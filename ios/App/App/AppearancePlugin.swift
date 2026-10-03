import Capacitor
import UIKit

/**
 Tells UIKit which way the app is dressed.

 The web view draws its own colours, but the controls iOS supplies — the date
 and time wheels, the text selection handles, the keyboard — come from the
 window's trait, not from CSS. Without this, choosing Dark in Settings on a
 phone set to Light left a white date picker in the middle of a dark sheet.
 */
@objc(AppearancePlugin)
public class AppearancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppearancePlugin"
    public let jsName = "Appearance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise)
    ]

    /// Hence's own page in the iPhone's Settings — where the camera and
    /// microphone are switched back on once they have been refused. iOS asks
    /// only once; after a refusal, this is the only way back.
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("No settings page")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() } else { call.reject("Settings did not open") }
            }
        }
    }

    @objc func setStyle(_ call: CAPPluginCall) {
        let style: UIUserInterfaceStyle = call.getString("style") == "light" ? .light : .dark
        DispatchQueue.main.async {
            // Every window, not just the key one: a sheet presented over the
            // app gets its own, and a half-lit app is worse than a wrong one.
            for scene in UIApplication.shared.connectedScenes {
                guard let scene = scene as? UIWindowScene else { continue }
                for window in scene.windows { window.overrideUserInterfaceStyle = style }
            }
            call.resolve()
        }
    }
}
