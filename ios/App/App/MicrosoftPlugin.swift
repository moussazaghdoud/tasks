import AuthenticationServices
import Capacitor
import CommonCrypto
import Foundation
import UIKit

/// Anything Microsoft said no to, carried as a message worth showing.
private struct AuthError: Error {
    let message: String
}

/**
 Signing in to Microsoft, and writing to the calendar.

 All of it lives here rather than in the web layer, for two reasons. The token
 endpoint refuses cross-origin redemption for a native client, so the exchange
 cannot be done with `fetch` from the web view at all. And the refresh token is
 the one credential this app holds: it belongs in the Keychain, where the
 system encrypts it and no other app can read it, not in web storage.

 The web layer therefore never sees a token. It asks for a sign-in, and later
 asks for an event to be created.
 */
@objc(MicrosoftPlugin)
public class MicrosoftPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MicrosoftPlugin"
    public let jsName = "Microsoft"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "account", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createEvent", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?
    private let keychainAccount = "microsoft.refresh-token"
    private let defaultsUser = "microsoft.user"
    private let defaultsTenant = "microsoft.tenant"
    private let defaultsClient = "microsoft.client"

    // MARK: - Sign in

    @objc func signIn(_ call: CAPPluginCall) {
        guard let clientId = call.getString("clientId"), !clientId.isEmpty,
              let tenantId = call.getString("tenantId"), !tenantId.isEmpty else {
            call.reject("Microsoft is not configured in this build", "unconfigured")
            return
        }
        let scopes = call.getString("scopes") ?? "Calendars.ReadWrite offline_access User.Read"
        let redirect = "msauth.\(Bundle.main.bundleIdentifier ?? "")://auth"

        let verifier = Self.randomVerifier()
        let challenge = Self.challenge(for: verifier)
        let state = Self.randomVerifier()

        var components = URLComponents(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_mode", value: "query"),
            URLQueryItem(name: "scope", value: scopes),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            // Always show the account picker: people have more than one.
            URLQueryItem(name: "prompt", value: "select_account")
        ]

        guard let authorizeURL = components.url,
              let scheme = URL(string: redirect)?.scheme else {
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
                // The state guards against a callback we did not start.
                guard value("state") == state, let code = value("code") else {
                    call.reject("Sign-in could not be verified", "failed")
                    return
                }

                self.redeem(code: code, verifier: verifier, clientId: clientId, tenantId: tenantId,
                            redirect: redirect, scopes: scopes, call: call)
            }
            session.presentationContextProvider = self
            // A fresh sign-in each time is less confusing than silently reusing
            // whichever account Safari happens to be signed into.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }

    private func redeem(code: String, verifier: String, clientId: String, tenantId: String,
                        redirect: String, scopes: String, call: CAPPluginCall) {
        var body = URLComponents()
        body.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "code_verifier", value: verifier),
            URLQueryItem(name: "scope", value: scopes)
        ]

        token(tenantId: tenantId, form: body.percentEncodedQuery ?? "") { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .failure(let error):
                call.reject(error.message, "failed")
            case .success(let json):
                guard let refresh = json["refresh_token"] as? String else {
                    call.reject("Microsoft did not return a refresh token", "failed")
                    return
                }
                self.store(refresh: refresh)
                UserDefaults.standard.set(tenantId, forKey: self.defaultsTenant)
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
        let start = call.getString("start") ?? ""   // ISO 8601, local wall time
        let end = call.getString("end") ?? ""
        let timeZone = call.getString("timeZone") ?? TimeZone.current.identifier
        let allDay = call.getBool("allDay") ?? false

        accessToken { token in
            guard let token = token else {
                call.reject("Not connected to Microsoft", "not_connected")
                return
            }

            var event: [String: Any] = [
                "subject": subject,
                "body": ["contentType": "text", "content": body],
                "start": ["dateTime": start, "timeZone": timeZone],
                "end": ["dateTime": end, "timeZone": timeZone]
            ]
            if allDay { event["isAllDay"] = true }

            var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me/events")!)
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
                call.resolve(["id": (json?["id"] as? String) ?? "", "webLink": (json?["webLink"] as? String) ?? ""])
            }.resume()
        }
    }

    // MARK: - Tokens

    /// A usable access token, refreshed on demand. Access tokens last an hour;
    /// the refresh token is what keeps the connection alive for months.
    private func accessToken(_ done: @escaping (String?) -> Void) {
        guard let refresh = readRefresh(),
              let tenantId = UserDefaults.standard.string(forKey: defaultsTenant),
              let clientId = UserDefaults.standard.string(forKey: defaultsClient) else {
            done(nil)
            return
        }

        var body = URLComponents()
        body.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "grant_type", value: "refresh_token"),
            URLQueryItem(name: "refresh_token", value: refresh),
            URLQueryItem(name: "scope", value: "Calendars.ReadWrite offline_access User.Read")
        ]

        token(tenantId: tenantId, form: body.percentEncodedQuery ?? "") { [weak self] result in
            switch result {
            case .failure:
                // The refresh token is spent or revoked; make the app say so
                // rather than fail silently on every attempt.
                self?.deleteRefresh()
                done(nil)
            case .success(let json):
                if let rotated = json["refresh_token"] as? String { self?.store(refresh: rotated) }
                done(json["access_token"] as? String)
            }
        }
    }

    private func token(tenantId: String, form: String, done: @escaping (Result<[String: Any], AuthError>) -> Void) {
        var request = URLRequest(url: URL(string: "https://login.microsoftonline.com/\(tenantId)/oauth2/v2.0/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = form.data(using: .utf8)

        URLSession.shared.dataTask(with: request) { data, _, error in
            if let error = error {
                done(.failure(AuthError(message: error.localizedDescription)))
                return
            }
            guard let data = data,
                  let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else {
                done(.failure(AuthError(message: "Microsoft returned something unreadable")))
                return
            }
            if let description = json["error_description"] as? String {
                done(.failure(AuthError(message: description)))
                return
            }
            done(.success(json))
        }.resume()
    }

    /// Who is connected, for the line in Settings. Failure here is cosmetic.
    private func fetchUser(access: String?, done: @escaping (String?) -> Void) {
        guard let access = access else { return done(nil) }
        var request = URLRequest(url: URL(string: "https://graph.microsoft.com/v1.0/me")!)
        request.setValue("Bearer \(access)", forHTTPHeaderField: "Authorization")
        URLSession.shared.dataTask(with: request) { data, _, _ in
            let json = data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
            done((json?["userPrincipalName"] as? String) ?? (json?["displayName"] as? String))
        }.resume()
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
            // Readable only after the first unlock, and never in a backup that
            // could be restored onto someone else's phone.
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
        return Data(bytes).base64URL
    }

    private static func challenge(for verifier: String) -> String {
        var digest = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        let data = Data(verifier.utf8)
        _ = data.withUnsafeBytes { CC_SHA256($0.baseAddress, CC_LONG(data.count), &digest) }
        return Data(digest).base64URL
    }
}

private extension Data {
    /// base64url, which OAuth requires and plain base64 is not.
    var base64URL: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

extension MicrosoftPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
