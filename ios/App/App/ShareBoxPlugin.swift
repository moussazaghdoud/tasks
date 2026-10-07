import AudioToolbox
import BackgroundTasks
import Capacitor
import CloudKit
import UIKit
import UserNotifications

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
        CAPPluginMethod(name: "chime", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepIdentity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readIdentity", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - The identity, in the iCloud Keychain

    /*
     Who this Hence is to the people it shares with — its identifier, name and
     private key — kept where iOS keeps passwords: encrypted, still there
     after the app is deleted, and carried to a new iPhone by iCloud Keychain.
     Without it, a reinstall would be a stranger to everyone in People.
     */

    private static let keychainQuery: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.moussazaghdoud.hence.share",
        kSecAttrAccount as String: "identity",
        kSecAttrSynchronizable as String: kCFBooleanTrue as Any
    ]

    @objc func keepIdentity(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else {
            call.reject("Nothing to keep", "bad_request")
            return
        }
        let query = Self.keychainQuery
        let update: [String: Any] = [kSecValueData as String: data]
        var status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            status = SecItemAdd(add as CFDictionary, nil)
        }
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Keychain refused (\(status))", "failed")
        }
    }

    @objc func readIdentity(_ call: CAPPluginCall) {
        var query = Self.keychainQuery
        query[kSecReturnData as String] = kCFBooleanTrue
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &found)
        if status == errSecSuccess, let data = found as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            call.resolve([:])
        }
    }

    /// The three links a notice of arrival depends on, each checked: whether
    /// notifications are allowed, whether the iPhone is registered for push,
    /// and whether iCloud holds the subscription for this mailbox.
    @objc func status(_ call: CAPPluginCall) {
        let to = call.getString("to") ?? ""
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let permission = Self.describe(settings.authorizationStatus)
            DispatchQueue.main.async {
                let registered = UIApplication.shared.isRegisteredForRemoteNotifications
                self.database.fetch(withSubscriptionID: "inbox-" + to) { subscription, error in
                    call.resolve([
                        "permission": permission,
                        "registered": registered,
                        "subscribed": subscription != nil,
                        "error": error?.localizedDescription ?? ""
                    ])
                }
            }
        }
    }

    // MARK: - Looking in the mailbox while the app is closed

    /*
     iCloud's own notice of arrival (the subscription above) is refused in
     Production until its kind has once been created from a Development build.
     Until then — and as a second chance after — iOS is asked to wake the app
     now and then: it looks in the mailbox and, if something new is there,
     says so with a local notification. iOS decides when; typically every
     15 to 30 minutes for an app in regular use, less often otherwise.
     */

    static let taskID = "com.moussazaghdoud.hence.inbox"
    private static let inboxKey = "hence.share.inbox"
    private static let alertKey = "hence.share.alert"
    private static let announcedKey = "hence.share.announced"

    /// Called once from the app delegate, before launch ends.
    static func registerInboxCheck() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: ShareBoxPlugin.taskID, using: nil) { task in
            guard let refresh = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            ShareBoxPlugin.scheduleInboxCheck()
            let check = Task { await ShareBoxPlugin.lookInInbox() }
            refresh.expirationHandler = { check.cancel() }
            Task {
                _ = await check.value
                refresh.setTaskCompleted(success: true)
            }
        }
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { _ in ShareBoxPlugin.scheduleInboxCheck() }
    }

    /// Ask iOS for the next look. A newer request replaces the waiting one.
    static func scheduleInboxCheck() {
        guard UserDefaults.standard.string(forKey: inboxKey) != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskID)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// One look: announce envelopes not announced before. Nothing is opened
    /// or deleted here — the app does that when it comes to the screen.
    private static func lookInInbox() async {
        let defaults = UserDefaults.standard
        guard let to = defaults.string(forKey: inboxKey) else { return }
        let container = CKContainer(identifier: "iCloud.com.moussazaghdoud.hence")
        let query = CKQuery(recordType: "Envelope", predicate: NSPredicate(format: "to == %@", to))
        guard let page = try? await container.publicCloudDatabase.records(
            matching: query, desiredKeys: ["kind"], resultsLimit: 50
        ) else { return }

        var waiting: [String: String] = [:]
        for (id, result) in page.matchResults {
            if case .success(let record) = result {
                waiting[id.recordName] = (record["kind"] as? String) ?? ""
            }
        }
        let announced = Set(defaults.stringArray(forKey: announcedKey) ?? [])
        // Receipts are bookkeeping, not news.
        let fresh = waiting.filter { !announced.contains($0.key) && $0.value != "ack" }
        // Only what is still waiting needs remembering: collected ones are gone.
        defaults.set(Array(Set(waiting.keys).intersection(announced.union(fresh.keys))), forKey: announcedKey)
        guard !fresh.isEmpty else { return }

        let content = UNMutableNotificationContent()
        content.title = "Hence"
        content.body = defaults.string(forKey: alertKey) ?? "You received something on Hence"
        content.sound = .default
        let request = UNNotificationRequest(identifier: "hence-inbox", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    private static func describe(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        case .provisional: return "provisional"
        case .ephemeral: return "ephemeral"
        @unknown default: return "unknown"
        }
    }

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
        // Remembered for the background look, which runs with no web view.
        UserDefaults.standard.set(to, forKey: Self.inboxKey)
        UserDefaults.standard.set(alert, forKey: Self.alertKey)
        Self.scheduleInboxCheck()
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
