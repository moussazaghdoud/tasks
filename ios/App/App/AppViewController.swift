import Capacitor
import UIKit

/**
 The bridge view controller, with our own plugins added.

 Capacitor does not discover plugins by scanning the runtime: it registers a
 handful of built-ins plus whatever is listed in `packageClassList` in
 `capacitor.config.json`, which `cap sync` fills in from installed npm
 packages. A plugin that lives in this target appears in neither list, so
 without the call below `SpeechPlugin` is compiled into the app and never
 reachable from JavaScript.

 `capacitorDidLoad()` runs after the bridge exists and before the web view
 loads its content, which is the point at which a plugin can still be added.
 */
public class AppViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(SpeechPlugin())
        bridge?.registerPluginInstance(MicrosoftPlugin())
        bridge?.registerPluginInstance(GooglePlugin())
        bridge?.registerPluginInstance(AppearancePlugin())
    }
}
