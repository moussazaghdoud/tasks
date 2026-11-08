package com.moussazaghdoud.hence;

import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.io.File;

/**
 * The Android twin of ios/App/App/TextReaderPlugin.swift: the words in a
 * photograph, read on the phone with Google's ML Kit (src/lib/native/photos.ts).
 * The model ships inside the app, so it works offline and nothing leaves the
 * phone, as on the iPhone.
 *
 * Photos live where the app keeps them: Directory.Data/photos/<name>, which is
 * the app's private files folder on Android.
 */
@CapacitorPlugin(name = "TextReader")
public class TextReaderPlugin extends Plugin {

    private TextRecognizer recognizer;

    private TextRecognizer recognizer() {
        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        return recognizer;
    }

    private File photo(PluginCall call) {
        String name = call.getString("name", "");
        // A bare name, never a path: nothing outside the photos folder is read.
        if (name.isEmpty() || name.contains("/") || name.contains("..")) return null;
        File file = new File(new File(getContext().getFilesDir(), "photos"), name);
        return file.exists() ? file : null;
    }

    @PluginMethod
    public void read(PluginCall call) {
        File file = photo(call);
        if (file == null) {
            call.reject("No such photo", "missing");
            return;
        }
        try {
            InputImage image = InputImage.fromFilePath(getContext(), Uri.fromFile(file));
            recognizer()
                .process(image)
                .addOnSuccessListener(result -> {
                    JSObject ret = new JSObject();
                    ret.put("text", result.getText());
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> call.reject("Could not read the photo", "failed"));
        } catch (Exception e) {
            call.reject("Could not open the photo", "failed");
        }
    }

    /** QR codes are for sending thoughts, which Android does not offer yet. */
    @PluginMethod
    public void readCode(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("codes", new JSArray());
        call.resolve(ret);
    }
}
