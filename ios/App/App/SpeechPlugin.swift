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
            AVAudioSession.sharedInstance().requestRecordPermission { _ in
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
        let mic: String
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted: mic = "granted"
        case .denied: mic = "denied"
        default: mic = "prompt"
        }
        return ["speech": speech, "microphone": mic]
    }

    // MARK: - Recognition

    @objc func start(_ call: CAPPluginCall) {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              AVAudioSession.sharedInstance().recordPermission == .granted else {
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
        if onDevice, recognizer.supportsOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
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
            if error != nil {
                // A cancelled task after stop() is expected, not a failure.
                if self.listening { self.notifyListeners("error", data: ["code": "recognition"]) }
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
