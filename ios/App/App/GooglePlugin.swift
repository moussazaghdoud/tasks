import AuthenticationServices
import Capacitor
import CommonCrypto
import Foundation
import UIKit

/// Anything Google said no to, carried as a message worth showing.
private struct GoogleAuthError: Error {
    let message: String
    /// The OAuth error code, when Google gave one — it decides whether the
    /// connection is dead or just had a bad moment.
    var code: String = ""
}

/**
 Signing in to Google, and reading and writing the calendar.

 The same shape as MicrosoftPlugin, for the same reasons: the token exchange
 cannot be done from the web view, and the refresh token belongs in the
 Keychain rather than in web storage. The web layer asks for a sign-in and
 asks for events; it never holds a credential.

 Google's installed-app flow takes no client secret — PKCE is what proves the
 exchange came from the app that started it — and its redirect is the client
 ID reversed, which is derived here rather than configured twice.
 */
@objc(GooglePlugin)
public class GooglePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GooglePlugin"
    public let jsName = "Google"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "account", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createEvent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "todayEvents", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?
    private var lastAuthError = ""
    private let keychainAccount = "google.refresh-token"
    private let defaultsUser = "google.user"
    private let defaultsClient = "google.client"

    /// Calendar read and write, plus enough to show whose calendar it is.
    private static let scopes = "https://www.googleapis.com/auth/calendar.events email profile"

    /// Google's redirect for an installed app: the client ID, reversed.
    /// `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`.
    private static func scheme(for clientId: String) -> String? {
        let suffix = ".apps.googleusercontent.com"
        guard clientId.hasSuffix(suffix) else { return nil }
        return "com.googleusercontent.apps." + String(clientId.dropLast(suffix.count))
    }

    // MARK: - Sign in

    @objc func signIn(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty else {
            call.reject("Google is not configured in this build", "unconfigured")
            return
        }
        guard let scheme = Self.scheme(for: clientId) else {
            call.reject("That does not look like an iOS Google client ID", "unconfigured")
            return
        }
        let redirect = "\(scheme):/oauth2redirect"

        let verifier = Self.randomVerifier()
        let challenge = Self.challenge(for: verifier)
        let state = Self.randomVerifier()

        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "scope", value: Self.scopes),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            // Offline access is what earns a refresh token, and Google only
            // hands one over when it asks the question out loud — without
            // `consent`, a second sign-in returns none and the connection
            // would quietly last an hour.
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent")
        ]
        if let hint = call.getString("loginHint"), !hint.isEmpty {
            components.queryItems?.append(URLQueryItem(name: "login_hint", value: hint))
        }

        guard let authorizeURL = components.url else {
            call.reject("Could not build the sign-in request", "internal")
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: authorizeURL, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                guard let self = self else { return }
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Sign-in cancelled", "cancelled")
                    return
                }
                if let error = error {
                    call.reject(error.localizedDescription, "failed")
                    return
                }
                guard let callbackURL = callbackURL,
                      let items = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.queryItems else {
                    call.reject("Sign-in returned nothing", "failed")
                    return
                }
                let value = { (name: String) in items.first(where: { $0.name == name })?.value }

                if let description = value("error_description") ?? value("error") {
                    call.reject(description, "denied")
                    return
                }
                guard value("state") == state, let code = value("code") else {
                    call.reject("Sign-in could not be verified", "failed")
                    return
                }

                self.redeem(code: code, verifier: verifier, clientId: clientId, redirect: redirect, call: call)
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }

    private func redeem(code: String, verifier: String, clientId: String, redirect: String, call: CAPPluginCall) {
        var body = URLComponents()
        body.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "code_verifier", value: verifier)
        ]

        token(form: body.percentEncodedQuery ?? "") { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                call.reject(error.message, "failed")
            case .success(let json):
                guard let refresh = json["refresh_token"] as? String else {
                    call.reject("Google did not return a refresh token", "failed")
                    return
                }
                self.store(refresh: refresh)
                UserDefaults.standard.set(clientId, forKey: self.defaultsClient)

                let access = json["access_token"] as? String
                self.fetchUser(access: access) { name in
                    if let name = name { UserDefaults.standard.set(name, forKey: self.defaultsUser) }
                    call.resolve(["connected": true, "account": name ?? ""])
                }
            }
        }
    }

    // MARK: - State

    @objc func account(_ call: CAPPluginCall) {
        let connected = readRefresh() != nil
        call.resolve([
            "connected": connected,
            "account": connected ? (UserDefaults.standard.string(forKey: defaultsUser) ?? "") : ""
        ])
    }

    @objc func signOut(_ call: CAPPluginCall) {
        deleteRefresh()
        UserDefaults.standard.removeObject(forKey: defaultsUser)
        call.resolve(["connected": false])
    }

    // MARK: - Calendar

    @objc func createEvent(_ call: CAPPluginCall) {
        guard let subject = call.getString("subject") else {
            call.reject("An event needs a title", "bad_request")
            return
        }
        let body = call.getString("body") ?? ""
        let start = call.getString("start") ?? ""   // local wall time, no zone
        let end = call.getString("end") ?? ""
        let timeZone = call.getString("timeZone") ?? TimeZone.current.identifier
        let allDay = call.getBool("allDay") ?? false

        accessToken { token in
            guard let token = token else {
                call.reject(self.lastAuthError.isEmpty ? "Not connected to Google" : self.lastAuthError, "not_connected")
                return
            }

            // An all-day event is a date, not a moment; Google takes the date
            // alone and reads the end as exclusive, so it needs the next day.
            var event: [String: Any] = ["summary": subject, "description": body]
            if allDay {
                event["start"] = ["date": String(start.prefix(10))]
                event["end"] = ["date": Self.dayAfter(String(end.prefix(10)))]
            } else {
                event["start"] = ["dateTime": start, "timeZone": timeZone]
                event["end"] = ["dateTime": end, "timeZone": timeZone]
            }

            var request = URLRequest(url: URL(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events")!)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: event)

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    call.reject(error.localizedDescription, "network")
                    return
                }
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(status) else {
                    let detail = data.flatMap { String(data: $0, encoding: .utf8) } ?? "HTTP \(status)"
                    call.reject("Calendar refused the event: \(detail.prefix(200))", status == 401 ? "not_connected" : "failed")
                    return
                }
                let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                call.resolve(["id": (json?["id"] as? String) ?? "", "webLink": (json?["htmlLink"] as? String) ?? ""])
            }.resume()
        }
    }

    /// The days ahead, in the order they happen.
    ///
    /// `singleEvents` expands a recurring series into the occurrences that
    /// actually fall in the window, which is what a person means by "my
    /// meetings".
    @objc func todayEvents(_ call: CAPPluginCall) {
        let zone = TimeZone.current
        var calendar = Calendar.current
        calendar.timeZone = zone
        let startOfDay = calendar.startOfDay(for: Date())
        let days = max(1, min(7, call.getInt("days") ?? 1))
        guard let endOfDay = calendar.date(byAdding: .day, value: days, to: startOfDay) else {
            call.reject("Could not work out today", "internal")
            return
        }

        let formatter = ISO8601DateFormatter()
        formatter.timeZone = zone
        formatter.formatOptions = [.withInternetDateTime]

        accessToken { token in
            guard let token = token else {
                call.reject(self.lastAuthError.isEmpty ? "Not connected to Google" : self.lastAuthError, "not_connected")
                return
            }

            var components = URLComponents(string: "https://www.googleapis.com/calendar/v3/calendars/primary/events")!
            components.queryItems = [
                URLQueryItem(name: "timeMin", value: formatter.string(from: startOfDay)),
                URLQueryItem(name: "timeMax", value: formatter.string(from: endOfDay)),
                URLQueryItem(name: "singleEvents", value: "true"),
                URLQueryItem(name: "orderBy", value: "startTime"),
                URLQueryItem(name: "maxResults", value: "250"),
                // Ask for the times in the phone's zone, so nothing has to be
                // converted on the way out.
                URLQueryItem(name: "timeZone", value: zone.identifier)
            ]
            // A query string reads "+" as a space, so the "+02:00" offset would
            // arrive as " 02:00" — an invalid date.
            components.percentEncodedQuery = components.percentEncodedQuery?
                .replacingOccurrences(of: "+", with: "%2B")

            var request = URLRequest(url: components.url!)
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

            URLSession.shared.dataTask(with: request) { data, response, error in
                if let error = error {
                    call.reject(error.localizedDescription, "network")
                    return
                }
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                guard (200..<300).contains(status), let data = data else {
                    // Google explains itself in the body: keep that, because
                    // "refused" alone leaves nobody able to tell a missing
                    // permission from a policy.
                    let body = data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
                    let detail = (body?["error"] as? [String: Any])
                    let message = (detail?["message"] as? String) ?? ""
                    call.reject("HTTP \(status) \(message)".trimmingCharacters(in: .whitespaces),
                                status == 401 ? "not_connected" : "failed")
                    return
                }
                let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                let items = (json?["items"] as? [[String: Any]]) ?? []

                let events: [[String: Any]] = items.compactMap { item in
                    // A declined or cancelled occurrence is not a meeting.
                    if (item["status"] as? String) == "cancelled" { return nil }
                    let start = item["start"] as? [String: Any]
                    let end = item["end"] as? [String: Any]
                    let allDay = (start?["date"] as? String) != nil
                    // Dates come back as plain days for all-day events; the
                    // app reads wall time, so give it midnight of that day.
                    let startValue = allDay
                        ? "\((start?["date"] as? String) ?? "")T00:00:00"
                        : (start?["dateTime"] as? String) ?? ""
                    let endValue = allDay
                        ? "\((end?["date"] as? String) ?? "")T00:00:00"
                        : (end?["dateTime"] as? String) ?? ""
                    return [
                        "subject": (item["summary"] as? String) ?? "(no title)",
                        "start": startValue,
                        "end": endValue,
                        "allDay": allDay,
                        "showAs": (item["transparency"] as? String) == "transparent" ? "free" : "busy"
                    ]
                }
                call.resolve(["events": events])
            }.resume()
        }
    }

    // MARK: - Tokens

    private func accessToken(_ done: @escaping (String?) -> Void) {
        guard let refresh = readRefresh(),
              let clientId = UserDefaults.standard.string(forKey: defaultsClient) else {
            done(nil)
            return
        }

        var body = URLComponents()
        body.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "grant_type", value: "refresh_token"),
            URLQueryItem(name: "refresh_token", value: refresh)
        ]

        token(form: body.percentEncodedQuery ?? "") { [weak self] result in
            switch result {
            case .failure(let error):
                self?.lastAuthError = error.message
                // Only forget the connection when Google says it is over — a
                // revoked or expired grant. A dropped network is not that.
                if ["invalid_grant", "unauthorized_client", "invalid_client"].contains(error.code) {
                    self?.deleteRefresh()
                }
                done(nil)
            case .success(let json):
                if let rotated = json["refresh_token"] as? String { self?.store(refresh: rotated) }
                done(json["access_token"] as? String)
            }
        }
    }

    private func token(form: String, done: @escaping (Result<[String: Any], GoogleAuthError>) -> Void) {
        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = form.replacingOccurrences(of: "+", with: "%2B").data(using: .utf8)

        URLSession.shared.dataTask(with: request) { data, _, error in
            if let error = error {
                done(.failure(GoogleAuthError(message: error.localizedDescription)))
                return
            }
            guard let data = data,
                  let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                done(.failure(GoogleAuthError(message: "Google returned something unreadable")))
                return
            }
            if let code = json["error"] as? String {
                let description = (json["error_description"] as? String) ?? code
                done(.failure(GoogleAuthError(message: description, code: code)))
                return
            }
            done(.success(json))
        }.resume()
    }

    /// Whose calendar this is, for the line in Settings. Cosmetic on failure.
    private func fetchUser(access: String?, done: @escaping (String?) -> Void) {
        guard let access = access else { return done(nil) }
        var request = URLRequest(url: URL(string: "https://www.googleapis.com/oauth2/v3/userinfo")!)
        request.setValue("Bearer \(access)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { data, _, _ in
            let json = data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
            done((json?["email"] as? String) ?? (json?["name"] as? String))
        }.resume()
    }

    /// The day after a `YYYY-MM-DD`, which is where Google puts an all-day end.
    private static func dayAfter(_ date: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let parsed = formatter.date(from: date),
              let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: 1, to: parsed) else {
            return date
        }
        return formatter.string(from: next)
    }

    // MARK: - Keychain

    private func query(_ extra: [String: Any] = [:]) -> [String: Any] {
        var q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Bundle.main.bundleIdentifier ?? "hence",
            kSecAttrAccount as String: keychainAccount
        ]
        for (k, v) in extra { q[k] = v }
        return q
    }

    private func store(refresh: String) {
        SecItemDelete(query() as CFDictionary)
        SecItemAdd(query([
            kSecValueData as String: Data(refresh.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]) as CFDictionary, nil)
    }

    private func readRefresh() -> String? {
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query([
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]) as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func deleteRefresh() {
        SecItemDelete(query() as CFDictionary)
    }

    // MARK: - PKCE

    private static func randomVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).googleBase64URL
    }

    private static func challenge(for verifier: String) -> String {
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        let data = Data(verifier.utf8)
        _ = data.withUnsafeBytes { CC_SHA256($0.baseAddress, CC_LONG(data.count), &digest) }
        return Data(digest).googleBase64URL
    }
}

private extension Data {
    /// base64url, which OAuth requires and plain base64 is not.
    var googleBase64URL: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension GooglePlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
