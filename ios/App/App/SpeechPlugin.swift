import AVFoundation
import Capacitor
import Foundation
import NaturalLanguage
import Speech

/**
 Speech recognition for the voice composer.

 WKWebView has no Web Speech API, so the web implementation cannot work inside
 the native app. This plugin uses Apple's own `SFSpeechRecognizer`, which is
 more accurate, handles French properly, and also gives us the microphone level
 used by the listening animation.

 It can also listen in several languages at once: one microphone feeding one
 recogniser per language, and at the end the transcript that actually reads
 like the language it was transcribed in wins. Apple's recogniser has to be
 told a language before it hears anything, so this race is the only way to let
 someone speak French and then English without reaching for a setting.

 Events emitted to the web layer:
   - `result` { text, isFinal, locale }  partial and final transcripts
   - `level`  { level }          0–1 microphone level, throttled
   - `error`  { code }           permission | unavailable | audio | recognition
   - `end`    {}                 recognition finished or was stopped
 */
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SpeechPlugin"
    public let jsName = "Speech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    /// One language's attempt at the same audio.
    private final class Track {
        let locale: String
        let request: SFSpeechAudioBufferRecognitionRequest
        var task: SFSpeechRecognitionTask?
        var text = ""
        /// Apple's own confidence in the words, averaged over the utterance.
        var confidence = 0.0
        var finished = false
        /// Why this language never answered, if it did not. Reported with the
        /// result: a recogniser iOS refuses to run looks exactly like a
        /// recogniser that heard nothing, and the two need different fixes.
        var failure = ""

        init(locale: String, request: SFSpeechAudioBufferRecognitionRequest) {
            self.locale = locale
            self.request = request
        }
    }

    private let audioEngine = AVAudioEngine()
    /// The first track is the language the interface is set to: its partial
    /// results are what appears on screen while someone speaks.
    private var tracks: [Track] = []
    private var listening = false
    private var deciding = false
    /// Set once the audio has ended, and the only time a winner may be picked.
    private var finishing = false
    private var lastLevelAt = Date.distantPast

    // MARK: - Availability & permissions

    @objc func available(_ call: CAPPluginCall) {
        let locale = Locale(identifier: call.getString("locale") ?? "en-US")
        let recognizer = SFSpeechRecognizer(locale: locale)
        call.resolve([
            "available": recognizer?.isAvailable ?? false,
            "onDevice": recognizer?.supportsOnDeviceRecognition ?? false
        ])
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        call.resolve(currentPermissions())
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        SFSpeechRecognizer.requestAuthorization { [weak self] _ in
            guard let self = self else { return }
            Self.requestMicrophone {
                DispatchQueue.main.async { call.resolve(self.currentPermissions()) }
            }
        }
    }

    private func currentPermissions() -> [String: Any] {
        let speech: String
        switch SFSpeechRecognizer.authorizationStatus() {
        case .authorized: speech = "granted"
        case .denied, .restricted: speech = "denied"
        default: speech = "prompt"
        }
        return ["speech": speech, "microphone": Self.microphoneState()]
    }

    // MARK: - Microphone permission
    //
    // iOS 17 moved record permission from AVAudioSession to AVAudioApplication
    // and deprecated the old calls. The app still supports iOS 15, so each
    // asks the new API where it exists and the old one only where it must.

    private static func microphoneState() -> String {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted: return "granted"
            case .denied: return "denied"
            default: return "prompt"
            }
        }
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: return "granted"
        case .denied: return "denied"
        default: return "prompt"
        }
    }

    private static func requestMicrophone(_ done: @escaping () -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { _ in done() }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { _ in done() }
        }
    }

    // MARK: - Recognition

    @objc func start(_ call: CAPPluginCall) {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              Self.microphoneState() == "granted" else {
            call.reject("Microphone or speech permission not granted", "permission")
            return
        }

        let partial = call.getBool("partialResults") ?? true
        let onDevice = call.getBool("onDevice") ?? false

        // One language, or several to race. The first is the one whose words
        // appear live on screen.
        var identifiers = call.getArray("locales", String.self) ?? []
        if identifiers.isEmpty { identifiers = [call.getString("locale") ?? "en-US"] }

        // Names are where dictation fails, and they are most of what gets
        // spoken here: people, projects, companies. Handing the recogniser the
        // vocabulary it is about to hear is what turns "Terry" into "Thierry".
        let contextual = call.getArray("contextualStrings", String.self) ?? []

        var recognizers: [(String, SFSpeechRecognizer)] = []
        for identifier in identifiers {
            guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: identifier)),
                  recognizer.isAvailable else { continue }
            recognizers.append((identifier, recognizer))
        }
        guard !recognizers.isEmpty else {
            call.reject("Speech recognition unavailable for \(identifiers.joined(separator: ", "))", "unavailable")
            return
        }

        // A second start (e.g. the user switched language) replaces the first.
        teardown(notifyEnd: false)

        var started: [Track] = []
        for (identifier, recognizer) in recognizers {
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = partial

            // Left alone, `requiresOnDeviceRecognition` stays false, which is
            // deliberate: Apple's server model is markedly more accurate than
            // the offline one, and accuracy is the whole point of this screen.
            if onDevice, recognizer.supportsOnDeviceRecognition {
                request.requiresOnDeviceRecognition = true
            }

            if !contextual.isEmpty {
                request.contextualStrings = Array(contextual.prefix(100))
            }

            // Short spoken notes, not a conversation or a search query.
            request.taskHint = .dictation

            // Sentence breaks make the difference between one run-on thought
            // and two separate ones once Claude reads it.
            if #available(iOS 16.0, *) {
                request.addsPunctuation = true
            }

            started.append(Track(locale: identifier, request: request))
        }

        tracks = started

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: [.duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            call.reject("Could not start the audio session", "audio")
            return
        }

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else {
            call.reject("No audio input available", "audio")
            return
        }

        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            // The same audio to every language still listening to it.
            for track in self.tracks where !track.finished { track.request.append(buffer) }
            self.emitLevel(from: buffer)
        }

        for (index, pair) in recognizers.enumerated() {
            let track = tracks[index]
            track.task = pair.1.recognitionTask(with: track.request) { [weak self] result, error in
                guard let self = self else { return }
                if let result = result {
                    track.text = result.bestTranscription.formattedString
                    track.confidence = Self.averageConfidence(result.bestTranscription)
                    // One language at a time is shown while speaking: three
                    // transcripts fighting over one line would be unreadable,
                    // and the choice is made at the end anyway. Normally the
                    // leading one — but if it drops out, whichever is still
                    // listening, so the words do not freeze mid-sentence.
                    let showing = self.tracks.first(where: { !$0.finished }) ?? self.tracks.first
                    if showing === track && !result.isFinal {
                        self.notifyListeners("result", data: [
                            "text": track.text,
                            "isFinal": false,
                            "locale": track.locale
                        ])
                    }
                    if result.isFinal {
                        track.finished = true
                        self.decideIfReady()
                    }
                }
                if let error = error as NSError? {
                    track.finished = true
                    if track.text.isEmpty { track.failure = "\(error.domain.suffix(12)):\(error.code)" }
                    // Ending the audio always finishes the task with an error,
                    // so most of these are ordinary end-of-recording noise
                    // rather than a failure worth showing the user. And one
                    // language failing is not a failure at all while another
                    // is still listening — only silence from all of them is.
                    let everyoneGaveUp = self.tracks.allSatisfy { $0.finished && $0.text.isEmpty }
                    if everyoneGaveUp, self.listening, let code = Self.reportableError(error) {
                        self.notifyListeners("error", data: ["code": code])
                    }
                    self.decideIfReady()
                }
            }
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            teardown(notifyEnd: false)
            call.reject("Could not start the microphone", "audio")
            return
        }

        listening = true
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        // End the audio so every recognizer can deliver its final transcript.
        finishing = true
        for track in tracks { track.request.endAudio() }
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        call.resolve()
    }

    // MARK: - Choosing between languages

    /// Decide once every language has answered — or once the quick ones have
    /// and the rest have had their moment. A language whose recogniser hangs
    /// must not hold the thought hostage.
    private func decideIfReady() {
        DispatchQueue.main.async {
            guard self.listening else { return }

            // Nothing is decided while someone is still speaking. A language
            // that gives up early — Chinese, with nothing Chinese to hear —
            // is one runner dropping out, not the end of the race. Without
            // this, its failure ended the recording a second and a half in.
            guard self.finishing else {
                // Unless they have all dropped out, in which case there is
                // nothing left listening and the screen has to be handed back.
                if self.tracks.allSatisfy({ $0.finished }) { self.decide() }
                return
            }

            // Everyone has answered: no reason to wait out the grace period.
            if self.tracks.allSatisfy({ $0.finished }) {
                self.decide()
                return
            }
            guard !self.deciding else { return }
            self.deciding = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                self.deciding = false
                if self.listening { self.decide() }
            }
        }
    }

    private func decide() {
        guard listening else { return }
        let winner = Self.pick(from: tracks)
        if let winner = winner, !winner.text.isEmpty {
            notifyListeners("result", data: [
                "text": winner.text,
                "isFinal": true,
                "locale": winner.locale,
                // What each language made of the same audio. The app shows
                // this in Settings, because on a phone there is no console to
                // read and "it picked the wrong language" is unfixable
                // without knowing whether the others were even heard.
                "candidates": tracks.map { track in
                    [
                        "locale": track.locale,
                        "text": String(track.text.prefix(60)),
                        "confidence": track.confidence,
                        "match": Self.languageScore(track.text, locale: track.locale),
                        "failure": track.failure
                    ]
                }
            ])
        }
        teardown(notifyEnd: true)
    }

    /// The transcript that reads like the language it was transcribed in.
    ///
    /// Confidence alone does not work: a French sentence run through the
    /// English recogniser comes back as confident nonsense. Apple's language
    /// detector, asked how English the English attempt looks, separates them —
    /// and where it cannot tell, the language on screen keeps its place.
    private static func pick(from tracks: [Track]) -> Track? {
        let spoken = tracks.filter { !$0.text.trimmingCharacters(in: .whitespaces).isEmpty }
        guard let leading = tracks.first else { return nil }
        guard spoken.count > 1 else { return spoken.first ?? leading }

        var best: (track: Track, score: Double)?
        for track in spoken {
            let match = languageScore(track.text, locale: track.locale)
            // Both halves matter. The detector says whether the words are
            // that language at all; Apple's confidence says whether they were
            // really heard — a French sentence forced through the English
            // recogniser reads as plausible English, but the recogniser knows
            // it was guessing.
            var score = match * 0.6 + track.confidence * 0.4
            // The Chinese recogniser writes Chinese characters whatever it
            // hears, and the detector is certain about a script. Without this
            // it would win every sentence in any language.
            if track.locale.hasPrefix("zh"), track.confidence < 0.45 { score *= 0.3 }
            if best == nil || score > best!.score { best = (track, score) }
        }
        guard let winner = best else { return leading }

        // Too short or too odd to judge — "ok", a single name — and the
        // language the person is reading the app in is the better guess.
        if winner.score < 0.4, !leading.text.isEmpty { return leading }
        return winner.track
    }

    /// How much this text looks like that language, from 0 to 1.
    private static func languageScore(_ text: String, locale: String) -> Double {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 1 else { return 0 }
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(trimmed)
        let code = String(locale.prefix(2)).lowercased()
        var best = 0.0
        for (language, probability) in recognizer.languageHypotheses(withMaximum: 6) {
            if language.rawValue.lowercased().hasPrefix(code) { best = max(best, probability) }
        }
        return best
    }

    private static func averageConfidence(_ transcription: SFTranscription) -> Double {
        let segments = transcription.segments.filter { $0.confidence > 0 }
        guard !segments.isEmpty else { return 0 }
        return Double(segments.reduce(0) { $0 + $1.confidence }) / Double(segments.count)
    }

    // MARK: - Interruptions

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(audioInterrupted(_:)),
                           name: AVAudioSession.interruptionNotification, object: nil)
        center.addObserver(self, selector: #selector(audioRouteChanged(_:)),
                           name: AVAudioSession.routeChangeNotification, object: nil)
    }

    /// A phone call, a FaceTime, Siri, an alarm: the system takes the
    /// microphone. Without this the engine died silently and the screen sat
    /// on "Listening" with nothing listening.
    @objc private func audioInterrupted(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
        finishEarly()
    }

    /// Headphones pulled out or AirPods disconnected mid-sentence. The input
    /// format changes under the tap, so the only safe move is to stop.
    @objc private func audioRouteChanged(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        finishEarly()
    }

    /// Stop listening but keep what was said. Ending the audio lets the
    /// recogniser deliver its final transcript for the words it already has;
    /// losing a half-spoken thought to an incoming call would be the worst
    /// outcome here.
    private func finishEarly() {
        DispatchQueue.main.async {
            guard self.listening else { return }
            self.finishing = true
            for track in self.tracks { track.request.endAudio() }
            self.audioEngine.inputNode.removeTap(onBus: 0)
            if self.audioEngine.isRunning { self.audioEngine.stop() }

            // If the recogniser never answers after an interruption, still hand
            // the screen back rather than leave it listening to nothing.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                if self.listening { self.decide() }
            }
        }
    }

    /// Which recognition errors deserve a message, and which are just the
    /// recogniser winding down. Returns nil when there is nothing to say.
    private static func reportableError(_ error: NSError) -> String? {
        // kAFAssistantErrorDomain is Apple's speech backend.
        if error.domain == "kAFAssistantErrorDomain" {
            switch error.code {
            case 1110: return "nospeech"  // heard nothing at all
            case 203: return "nospeech"   // "Retry" — an empty utterance
            case 216, 301: return nil            // task cancelled by us
            default: return "recognition"
            }
        }
        // NSURLErrorDomain and friends: the transcription could not reach Apple.
        if error.domain == NSURLErrorDomain { return "network" }
        return "recognition"
    }

    private func teardown(notifyEnd: Bool) {
        let wasListening = listening
        listening = false
        deciding = false
        finishing = false
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        for track in tracks {
            track.request.endAudio()
            track.task?.cancel()
            track.task = nil
        }
        tracks = []
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if notifyEnd && wasListening { notifyListeners("end", data: [:]) }
    }

    /// Root-mean-square of the buffer, smoothed and throttled for the UI.
    private func emitLevel(from buffer: AVAudioPCMBuffer) {
        guard Date().timeIntervalSince(lastLevelAt) > 0.06, let channel = buffer.floatChannelData?[0] else { return }
        lastLevelAt = Date()
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return }
        var sum: Float = 0
        for i in 0..<frames { sum += channel[i] * channel[i] }
        let rms = sqrt(sum / Float(frames))
        let level = min(1.0, Double(rms) * 8.0)
        notifyListeners("level", data: ["level": level])
    }

    deinit {
        teardown(notifyEnd: false)
    }
}
