package com.moussazaghdoud.hence;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;

/**
 * Speech recognition for the voice composer, the Android twin of
 * ios/App/App/SpeechPlugin.swift: same methods, same events, so the web
 * layer (src/lib/voice/nativeSpeech.ts) does not know which phone it runs on.
 *
 * Android's recogniser stops by itself after a short pause, where Apple's
 * keeps listening. So each time it stops on its own, the words so far are
 * kept and it starts again, until the person taps Done.
 *
 * Events emitted to the web layer:
 *   - result { text, isFinal, locale }  the whole utterance so far
 *   - level  { level }                  0–1 microphone level
 *   - error  { code }                   permission | unavailable | audio | recognition | nospeech | nomatch | network
 *   - end    {}                         recognition finished or was stopped
 */
@CapacitorPlugin(
    name = "Speech",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") }
)
public class SpeechPlugin extends Plugin {

    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private Intent intent;
    private String locale = "en-US";
    /** Words from the earlier stretches of this session, before the last pause. */
    private String kept = "";
    /** What the current stretch has heard so far. */
    private String current = "";
    private boolean listening = false;
    /** Set by stop(): the next result is the last one. */
    private boolean finishing = false;
    /** Highest microphone level of the session: tells "heard nothing" from "understood nothing". */
    private float loudest = -100f;
    /** The recogniser noticed a voice at some point: silence and a foreign language are told apart. */
    private boolean heardVoice = false;

    // ---- Availability & permissions

    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        boolean onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        ret.put("onDevice", onDevice);
        call.resolve(ret);
    }

    @PluginMethod
    @Override
    public void checkPermissions(PluginCall call) {
        call.resolve(permissions());
    }

    @PluginMethod
    @Override
    public void requestPermissions(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            call.resolve(permissions());
        } else {
            requestPermissionForAlias("microphone", call, "microphoneAnswered");
        }
    }

    @PermissionCallback
    private void microphoneAnswered(PluginCall call) {
        call.resolve(permissions());
    }

    /** Android has one permission where iOS has two: both answers follow the microphone. */
    private JSObject permissions() {
        PermissionState state = getPermissionState("microphone");
        String value = state == PermissionState.GRANTED ? "granted" : state == PermissionState.DENIED ? "denied" : "prompt";
        JSObject ret = new JSObject();
        ret.put("speech", value);
        ret.put("microphone", value);
        return ret;
    }

    // ---- Recognition

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("Microphone not allowed", "permission");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("No speech recognition on this phone", "unavailable");
            return;
        }
        locale = call.getString("locale", "en-US");
        ArrayList<String> hints = new ArrayList<>();
        try {
            if (call.getArray("contextualStrings") != null) hints.addAll(call.getArray("contextualStrings").toList());
        } catch (Exception ignored) {
            // Hints only help spelling; listening works without them.
        }

        intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, call.getBoolean("partialResults", true));
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        // Ask for longer pauses; many phones ignore it, hence the restarts below.
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 4000L);
        if (Build.VERSION.SDK_INT >= 33 && !hints.isEmpty()) {
            intent.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, hints);
        }

        getActivity().runOnUiThread(() -> {
            handler.removeCallbacksAndMessages(null);
            destroy();
            kept = "";
            current = "";
            finishing = false;
            listening = true;
            loudest = -100f;
            heardVoice = false;
            String service = Settings.Secure.getString(getContext().getContentResolver(), "voice_recognition_service");
            trace("service " + (service == null ? "default" : service) + " sdk " + Build.VERSION.SDK_INT);
            // Every recogniser on the phone: a fallback may exist when the default one is weak.
            StringBuilder all = new StringBuilder();
            for (android.content.pm.ResolveInfo r : getContext().getPackageManager()
                    .queryIntentServices(new Intent(android.speech.RecognitionService.SERVICE_INTERFACE), 0)) {
                all.append(r.serviceInfo.packageName).append(' ');
            }
            trace("services " + all.toString().trim());
            if (Build.VERSION.SDK_INT >= 33) checkLanguage(intent, locale);
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(listener);
            recognizer.startListening(intent);
            call.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (listening) {
                finishing = true;
                if (recognizer != null) {
                    // The recogniser answers with onResults, which ends the session.
                    recognizer.stopListening();
                    // Some never answer after stopListening(): end with what was heard.
                    handler.postDelayed(() -> finish(joined().isEmpty() ? "nospeech" : null), 2500);
                } else {
                    // Between two stretches: nothing is listening, end now.
                    finish(joined().isEmpty() ? "nospeech" : null);
                }
            }
            call.resolve();
        });
    }

    /**
     * Whether the phone can recognise this language, and if its model is
     * missing, ask for it. Most Android phones now recognise speech on the
     * device, one downloaded model per language: the language of the region is
     * there, another often is not, and then every sentence comes back as "no
     * match". Android 13 can tell, and fetch the model in the background.
     */
    @androidx.annotation.RequiresApi(33)
    private void checkLanguage(Intent forIntent, String wanted) {
        SpeechRecognizer checker = SpeechRecognizer.createSpeechRecognizer(getContext());
        try {
            checker.checkRecognitionSupport(forIntent, getContext().getMainExecutor(), new RecognitionSupportCallback() {
                @Override
                public void onSupportResult(RecognitionSupport support) {
                    boolean installed = contains(support.getInstalledOnDeviceLanguages(), wanted);
                    boolean pending = contains(support.getPendingOnDeviceLanguages(), wanted);
                    boolean onDevice = contains(support.getSupportedOnDeviceLanguages(), wanted);
                    boolean online = contains(support.getOnlineLanguages(), wanted);
                    trace("language " + wanted + ": installed " + installed + ", downloading " + pending
                        + ", can download " + onDevice + ", online " + online
                        + " · installed " + support.getInstalledOnDeviceLanguages());
                    if (!installed && !pending && onDevice) {
                        checker.triggerModelDownload(forIntent);
                        trace("language " + wanted + ": download asked");
                    }
                    checker.destroy();
                }

                @Override
                public void onError(int error) {
                    trace("language check error " + error);
                    checker.destroy();
                }
            });
        } catch (Exception e) {
            trace("language check failed " + e.getClass().getSimpleName());
            checker.destroy();
        }
    }

    private static boolean contains(java.util.List<String> list, String locale) {
        if (list == null) return false;
        for (String l : list) if (l != null && l.equalsIgnoreCase(locale)) return true;
        return false;
    }

    /**
     * One step of the recogniser's life, for the diagnostics log: Android
     * phones differ more than iPhones, and "it heard nothing" has many causes.
     * Never the words themselves.
     */
    private void trace(String step) {
        JSObject data = new JSObject();
        data.put("step", step);
        notifyListeners("trace", data);
    }

    private String joined() {
        if (kept.isEmpty()) return current;
        if (current.isEmpty()) return kept;
        return kept + " " + current;
    }

    private void emitResult(boolean isFinal) {
        JSObject data = new JSObject();
        data.put("text", joined());
        data.put("isFinal", isFinal);
        data.put("locale", locale);
        notifyListeners("result", data);
    }

    private void finish(String errorCode) {
        if (!listening) return;
        listening = false;
        handler.removeCallbacksAndMessages(null);
        // Words already heard are never thrown away: a late error after them is
        // the recogniser giving up, not a failure worth more than the text.
        if (errorCode != null && !"permission".equals(errorCode) && !joined().isEmpty()) errorCode = null;
        // A voice with no word understood: most often another language than the one chosen.
        if ("nospeech".equals(errorCode) && heardVoice) errorCode = "nomatch";
        if (errorCode != null) {
            JSObject data = new JSObject();
            data.put("code", errorCode);
            notifyListeners("error", data);
        } else {
            emitResult(true);
        }
        destroy();
        notifyListeners("end", new JSObject());
    }

    /**
     * The recogniser stopped by itself after a pause: keep the words, listen
     * again. Many phones refuse a second startListening() on the same
     * recogniser, or one called from inside its own callback ("busy"), so
     * each stretch gets a fresh one, a moment later.
     */
    private void listenAgain() {
        if (!current.isEmpty()) kept = joined();
        current = "";
        destroy();
        handler.postDelayed(() -> {
            if (!listening || finishing) return;
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(listener);
            recognizer.startListening(intent);
        }, 150);
    }

    private void destroy() {
        if (recognizer != null) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    private static String first(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> list = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null || list.isEmpty() || list.get(0) == null ? "" : list.get(0).trim();
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {
            trace("ready");
        }

        @Override
        public void onBeginningOfSpeech() {
            heardVoice = true;
            trace("speech begins");
        }

        @Override
        public void onRmsChanged(float rmsdB) {
            loudest = Math.max(loudest, rmsdB);
            // Roughly -2 (silence) to 10 (loud speech) on most phones.
            float level = Math.max(0f, Math.min(1f, (rmsdB + 2f) / 12f));
            JSObject data = new JSObject();
            data.put("level", level);
            notifyListeners("level", data);
        }

        @Override
        public void onBufferReceived(byte[] buffer) {}

        @Override
        public void onEndOfSpeech() {}

        @Override
        public void onPartialResults(Bundle partialResults) {
            String text = first(partialResults);
            if (text.isEmpty()) return;
            current = text;
            emitResult(false);
        }

        @Override
        public void onResults(Bundle results) {
            String text = first(results);
            trace("results " + text.length() + " chars, loudest " + Math.round(loudest));
            if (!text.isEmpty()) current = text;
            if (finishing) {
                finish(joined().isEmpty() ? "nospeech" : null);
            } else {
                emitResult(false);
                listenAgain();
            }
        }

        @Override
        public void onError(int error) {
            trace("error " + error + (finishing ? " after done" : "") + ", loudest " + Math.round(loudest));
            switch (error) {
                case SpeechRecognizer.ERROR_NO_MATCH:
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                    // A pause with nothing new: still listening unless Done was tapped.
                    if (finishing) finish(joined().isEmpty() ? "nospeech" : null);
                    else listenAgain();
                    break;
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                    finish("permission");
                    break;
                case SpeechRecognizer.ERROR_NETWORK:
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                case SpeechRecognizer.ERROR_SERVER:
                    finish(joined().isEmpty() ? "network" : null);
                    break;
                case SpeechRecognizer.ERROR_AUDIO:
                    finish("audio");
                    break;
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                    finish("unavailable");
                    break;
                default:
                    // ERROR_CLIENT and friends, usually after stop(): keep what was heard.
                    finish(joined().isEmpty() ? (finishing ? "nospeech" : "recognition") : null);
            }
        }

        @Override
        public void onEvent(int eventType, Bundle params) {}
    };
}
