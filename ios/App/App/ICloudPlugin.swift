import Capacitor
import Foundation

/**
 A copy of the person's thoughts in their own iCloud.

 Deleting an app deletes everything it kept on the phone. This keeps the same
 thoughts — and their photographs — in the app's folder of the person's iCloud
 Drive, hidden from the Files app, so a reinstall or a new iPhone finds them.
 The copy belongs to the person's Apple ID: Hence's servers never see it.

 One file for the thoughts, rewritten as they change; photographs alongside,
 each copied once.
 */
@objc(ICloudPlugin)
public class ICloudPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ICloudPlugin"
    public let jsName = "ICloud"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchPhoto", returnType: CAPPluginReturnPromise)
    ]

    private let containerId = "iCloud.com.moussazaghdoud.hence"
    private let thoughtsFile = "thoughts.json"
    /// iCloud calls can block for a while: never on the main thread, and one at a time.
    private let queue = DispatchQueue(label: "hence.icloud", qos: .utility)

    private static func safe(_ name: String) -> Bool {
        !name.isEmpty && !name.contains("/") && !name.contains("..")
    }

    /// The app's folder in the person's iCloud, or nil when iCloud is off.
    private func cloud() -> URL? {
        guard FileManager.default.ubiquityIdentityToken != nil,
              let root = FileManager.default.url(forUbiquityContainerIdentifier: containerId) else { return nil }
        let docs = root.appendingPathComponent("Documents", isDirectory: true)
        try? FileManager.default.createDirectory(at: docs, withIntermediateDirectories: true)
        return docs
    }

    /// Where the app keeps photographs on the phone (Capacitor's Directory.Data).
    private func localPhotos() -> URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("photos", isDirectory: true)
    }

    /// Ask iCloud for a file and wait until it is on the phone — at most `seconds`.
    private func download(_ url: URL, seconds: Double = 20) -> Bool {
        let fm = FileManager.default
        do {
            try fm.startDownloadingUbiquitousItem(at: url)
        } catch {
            // Not an iCloud item this phone knows about (yet), or already local.
            return fm.fileExists(atPath: url.path)
        }
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if let values = try? url.resourceValues(forKeys: [.ubiquitousItemDownloadingStatusKey]),
               values.ubiquitousItemDownloadingStatus == .current {
                return true
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return false
    }

    @objc func available(_ call: CAPPluginCall) {
        queue.async {
            call.resolve(["available": self.cloud() != nil])
        }
    }

    /// Write the thoughts, and copy any photograph not yet in iCloud.
    @objc func save(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8) else {
            call.reject("Nothing to save", "bad_request")
            return
        }
        let photos = (call.options["photos"] as? [String]) ?? []
        queue.async {
            guard let docs = self.cloud() else {
                call.reject("iCloud is off on this iPhone", "unavailable")
                return
            }
            let file = docs.appendingPathComponent(self.thoughtsFile)
            var failure: String?
            var coordinationError: NSError?
            NSFileCoordinator().coordinate(writingItemAt: file, options: .forReplacing, error: &coordinationError) { url in
                do {
                    try data.write(to: url, options: .atomic)
                } catch {
                    failure = error.localizedDescription
                }
            }
            if let error = coordinationError { failure = error.localizedDescription }

            if let local = self.localPhotos() {
                let remote = docs.appendingPathComponent("photos", isDirectory: true)
                try? FileManager.default.createDirectory(at: remote, withIntermediateDirectories: true)
                for name in photos where Self.safe(name) {
                    let target = remote.appendingPathComponent(name)
                    let source = local.appendingPathComponent(name)
                    if FileManager.default.fileExists(atPath: target.path) { continue }
                    if !FileManager.default.fileExists(atPath: source.path) { continue }
                    NSFileCoordinator().coordinate(writingItemAt: target, options: .forReplacing, error: nil) { url in
                        try? FileManager.default.copyItem(at: source, to: url)
                    }
                }
            }

            if let failure = failure {
                call.reject(failure, "failed")
            } else {
                call.resolve()
            }
        }
    }

    /// The thoughts kept in iCloud, if there are any.
    @objc func load(_ call: CAPPluginCall) {
        queue.async {
            guard let docs = self.cloud() else {
                call.resolve(["available": false])
                return
            }
            let file = docs.appendingPathComponent(self.thoughtsFile)
            guard self.download(file) else {
                call.resolve(["available": true])
                return
            }
            var text: String?
            NSFileCoordinator().coordinate(readingItemAt: file, options: [], error: nil) { url in
                text = try? String(contentsOf: url, encoding: .utf8)
            }
            var result: [String: Any] = ["available": true]
            if let text = text { result["json"] = text }
            call.resolve(result)
        }
    }

    /// Bring one photograph back from iCloud to the phone.
    @objc func fetchPhoto(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), Self.safe(name) else {
            call.reject("No photograph named", "bad_request")
            return
        }
        queue.async {
            guard let docs = self.cloud(), let local = self.localPhotos() else {
                call.resolve(["ok": false])
                return
            }
            let source = docs.appendingPathComponent("photos", isDirectory: true).appendingPathComponent(name)
            let target = local.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: target.path) {
                call.resolve(["ok": true])
                return
            }
            guard self.download(source, seconds: 30) else {
                call.resolve(["ok": false])
                return
            }
            try? FileManager.default.createDirectory(at: local, withIntermediateDirectories: true)
            var copied = false
            NSFileCoordinator().coordinate(readingItemAt: source, options: [], error: nil) { url in
                copied = (try? FileManager.default.copyItem(at: url, to: target)) != nil
            }
            call.resolve(["ok": copied])
        }
    }
}
