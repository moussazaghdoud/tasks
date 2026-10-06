import Capacitor
import UIKit
import Vision

/**
 Reads the words in a photograph kept with a thought.

 A whiteboard, a business card, a label: the picture says more than the
 sentence spoken over it, but a picture cannot be searched. Apple's text
 recognition runs on the phone itself, so the photograph and what it says
 never leave the device.

 Takes the stored file's name, not a path: only the app's own photographs
 folder can be read.
 */
@objc(TextReaderPlugin)
public class TextReaderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TextReaderPlugin"
    public let jsName = "TextReader"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readCode", returnType: CAPPluginReturnPromise)
    ]

    /// The QR codes in a photograph — how a contact's Hence code is read.
    @objc func readCode(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), !name.isEmpty, !name.contains("/"), !name.contains("..") else {
            call.reject("No photograph named")
            return
        }
        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.reject("No documents folder")
            return
        }
        let url = documents.appendingPathComponent("photos").appendingPathComponent(name)
        DispatchQueue.global(qos: .userInitiated).async {
            guard let image = UIImage(contentsOfFile: url.path)?.cgImage else {
                call.reject("Unreadable photograph")
                return
            }
            let request = VNDetectBarcodesRequest()
            request.symbologies = [.qr]
            do {
                try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            } catch {
                call.reject("Code reading failed")
                return
            }
            let codes = (request.results ?? []).compactMap { $0.payloadStringValue }
            call.resolve(["codes": codes])
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), !name.isEmpty, !name.contains("/"), !name.contains("..") else {
            call.reject("No photograph named")
            return
        }
        // Capacitor's Directory.Data is the app's Documents folder on iOS.
        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            call.reject("No documents folder")
            return
        }
        let url = documents.appendingPathComponent("photos").appendingPathComponent(name)

        // Recognition takes a moment on a large photograph: never on the main thread.
        DispatchQueue.global(qos: .utility).async {
            guard let image = UIImage(contentsOfFile: url.path)?.cgImage else {
                call.reject("Unreadable photograph")
                return
            }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            if #available(iOS 16.0, *) {
                // English, French and Chinese alike, without being told which.
                request.automaticallyDetectsLanguage = true
            } else {
                request.recognitionLanguages = ["en-US", "fr-FR"]
            }
            do {
                // The camera already turned the pixels upright.
                try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            } catch {
                call.reject("Text recognition failed")
                return
            }
            let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
            call.resolve(["text": lines.joined(separator: "\n")])
        }
    }
}
