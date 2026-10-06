import AudioToolbox
import Capacitor
import CloudKit
import UIKit

/**
 The mailbox thoughts travel through between two people's Hence.

 A record type, `Envelope`, in the app's public CloudKit database: addressed
 to an anonymous identifier, holding a sealed blob only its recipient can
 open, and deleted as soon as it has been collected. Apple stores and
 delivers it; neither Apple nor the developer can read it, and there is no
 server of Hence's own in the way.

 The schema — the `Envelope` type, an index on `to`, and permission for
 signed-in users to delete — is set up once in the CloudKit Console.
 */
@objc(ShareBoxPlugin)
public class ShareBoxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareBoxPlugin"
    public let jsName = "ShareBox"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "post", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "subscribe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "chime", returnType: CAPPluginReturnPromise)
    ]

    /// The iPhone's own "message received" sound, for something that arrives
    /// while the app is open — when iOS shows no notification. Like every
    /// system sound, it stays quiet with the silent switch on.
    @objc func chime(_ call: CAPPluginCall) {
        AudioServicesPlaySystemSound(1007)
        call.resolve()
    }

    private let container = CKContainer(identifier: "iCloud.com.moussazaghdoud.hence")
    private var database: CKDatabase { container.publicCloudDatabase }
    private let recordType = "Envelope"

    /// Whether this iPhone is signed in to iCloud — sharing needs it.
    @objc func available(_ call: CAPPluginCall) {
        container.accountStatus { status, _ in
            call.resolve(["available": status == .available])
        }
    }

    /// Drop a sealed envelope in someone's mailbox.
    @objc func post(_ call: CAPPluginCall) {
        guard let to = call.getString("to"), let kind = call.getString("kind"), let data = call.getString("data") else {
            call.reject("An envelope needs a recipient, a kind and a content", "bad_request")
            return
        }
        let record = CKRecord(recordType: recordType)
        record["to"] = to as CKRecordValue
        record["kind"] = kind as CKRecordValue
        record["from"] = (call.getString("from") ?? "") as CKRecordValue
        record["data"] = data as CKRecordValue
        database.save(record) { _, error in
            if let error = error {
                call.reject(error.localizedDescription, "failed")
            } else {
                call.resolve()
            }
        }
    }

    /// Everything waiting in this identity's mailbox.
    @objc func fetch(_ call: CAPPluginCall) {
        guard let to = call.getString("to") else {
            call.reject("Whose mailbox", "bad_request")
            return
        }
        let query = CKQuery(recordType: recordType, predicate: NSPredicate(format: "to == %@", to))
        database.fetch(withQuery: query, inZoneWith: nil, desiredKeys: nil, resultsLimit: 100) { result in
            switch result {
            case .failure(let error):
                call.reject(error.localizedDescription, "failed")
            case .success(let page):
                var envelopes: [[String: Any]] = []
                for (_, matched) in page.matchResults {
                    guard case .success(let record) = matched else { continue }
                    envelopes.append([
                        "id": record.recordID.recordName,
                        "kind": (record["kind"] as? String) ?? "",
                        "from": (record["from"] as? String) ?? "",
                        "data": (record["data"] as? String) ?? "",
                        "sentAt": ISO8601DateFormatter().string(from: record.creationDate ?? Date())
                    ])
                }
                call.resolve(["envelopes": envelopes])
            }
        }
    }

    /// Delete collected envelopes, so nothing lingers in the mailbox.
    @objc func remove(_ call: CAPPluginCall) {
        let names = (call.options["ids"] as? [String]) ?? []
        if names.isEmpty {
            call.resolve()
            return
        }
        let ids = names.map { CKRecord.ID(recordName: $0) }
        database.modifyRecords(saving: [], deleting: ids, savePolicy: .changedKeys, atomically: false) { result in
            switch result {
            case .failure(let error): call.reject(error.localizedDescription, "failed")
            case .success: call.resolve()
            }
        }
    }

    /// Ask iCloud to notify this iPhone when something arrives in its mailbox.
    @objc func subscribe(_ call: CAPPluginCall) {
        guard let to = call.getString("to") else {
            call.reject("Whose mailbox", "bad_request")
            return
        }
        let alert = call.getString("alert") ?? "You received a thought on Hence"
        let subscription = CKQuerySubscription(
            recordType: recordType,
            predicate: NSPredicate(format: "to == %@", to),
            subscriptionID: "inbox-" + to,
            options: [.firesOnRecordCreation]
        )
        let info = CKSubscription.NotificationInfo()
        info.alertBody = alert
        info.soundName = "default"
        info.shouldSendContentAvailable = true
        subscription.notificationInfo = info

        database.save(subscription) { _, error in
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
            // Saving the same subscription again only updates its wording.
            if let error = error as? CKError, error.code != .serverRejectedRequest {
                call.reject(error.localizedDescription, "failed")
            } else {
                call.resolve()
            }
        }
    }
}
