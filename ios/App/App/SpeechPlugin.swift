import AVFoundation
import Capacitor
import Foundation
import Speech

/**
 Speech recognition for the voice composer.

 WKWebView has no Web Speech API, so the web implementation cannot work inside
 the native app. This plugin uses Apple's own `SFSpeechRecognizer`, which is
 more accurate, handles French properly, and also gives us the microphone level
 used by the listening animation.

 Events emitted to the web layer:
   - `result` { text, isFinal }  partial and final transcripts
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

    private let audioEngine = AVAudioEngine()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var listening = false
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

        let identifier = call.getString("locale") ?? "en-US"
        let partial = call.getBool("partialResults") ?? true
        let onDevice = call.getBool("onDevice") ?? false

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: identifier)), recognizer.isAvailable else {
            call.reject("Speech recognition unavailable for \(identifier)", "unavailable")
            return
        }

        // A second start (e.g. the user switched language) replaces the first.
        teardown(notifyEnd: false)

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = partial

        // Left alone, `requiresOnDeviceRecognition` stays false, which is
        // deliberate: Apple's server model is markedly more accurate than the
        // offline one, and accuracy is the whole point of this screen.
        if onDevice, recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }

        // Names are where dictation fails, and they are most of what gets
        // spoken here: people, projects, companies. Handing the recogniser the
        // vocabulary it is about to hear is what turns "Terry" into "Thierry".
        let contextual = call.getArray("contextualStrings", String.self) ?? []
        if !contextual.isEmpty {
            request.contextualStrings = Array(contextual.prefix(100))
        }

        // Short spoken notes, not a conversation or a search query.
        request.taskHint = .dictation

        // Sentence breaks make the difference between one run-on thought and
        // two separate ones once Claude reads it.
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }

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
            request.append(buffer)
            self?.emitLevel(from: buffer)
        }

        self.recognizer = recognizer
        self.request = request
        self.task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self = self else { return }
            if let result = result {
                self.notifyListeners("result", data: [
                    "text": result.bestTranscription.formattedString,
                    "isFinal": result.isFinal
                ])
                if result.isFinal { self.teardown(notifyEnd: true) }
            }
            if let error = error as NSError? {
                // Ending the audio always finishes the task with an error, so
                // most of these are ordinary end-of-recording noise rather than
                // a failure worth showing the user.
                if self.listening, let code = Self.reportableError(error) {
                    self.notifyListeners("error", data: ["code": code])
                }
                self.teardown(notifyEnd: true)
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
        // End the audio so the recognizer can deliver its final transcript.
        request?.endAudio()
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        call.resolve()
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
            self.request?.endAudio()
            self.audioEngine.inputNode.removeTap(onBus: 0)
            if self.audioEngine.isRunning { self.audioEngine.stop() }

            // If the recogniser never answers after an interruption, still hand
            // the screen back rather than leave it listening to nothing.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                if self.listening { self.teardown(notifyEnd: true) }
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
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
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
