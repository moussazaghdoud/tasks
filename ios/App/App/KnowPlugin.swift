import Capacitor
#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 Know: a Wikipedia opening made into a glossary entry by Apple's on-device
 model (Apple Intelligence, iOS 26) — on the phone, free, nothing sent away.

 The model is told to use only the text it is given, so it condenses rather
 than invents. Where it is not available — an older iPhone, Apple
 Intelligence off, a language it does not support, or a build made without
 the iOS 26 SDK — this answers `available: false`, and the app uses the
 article's own sentences instead.
 */
@objc(KnowPlugin)
public class KnowPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KnowPlugin"
    public let jsName = "Know"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "condense", returnType: CAPPluginReturnPromise)
    ]

    private static func languageName(_ code: String) -> String {
        switch code {
        case "fr": return "French"
        case "it": return "Italian"
        case "es": return "Spanish"
        case "de": return "German"
        case "zh": return "Simplified Chinese"
        default: return "English"
        }
    }

    @objc func condense(_ call: CAPPluginCall) {
        let term = call.getString("term") ?? ""
        let text = call.getString("text") ?? ""
        let language = KnowPlugin.languageName(call.getString("lang") ?? "en")

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                let model = SystemLanguageModel.default
                guard case .available = model.availability else {
                    call.resolve(["available": false])
                    return
                }
                let instructions = """
                You turn an encyclopedia extract into a glossary entry for someone in a business meeting. \
                Use only facts stated in the extract; never add anything it does not say. \
                Answer in \(language). \
                First line: one plain sentence saying what the term is, at most 30 words. \
                Then exactly three lines, each starting with "- ", each a key point of at most 15 words: \
                what it does, why it matters, and how it relates to similar things if the extract says so. \
                Write nothing else.
                """
                let session = LanguageModelSession(instructions: instructions)
                do {
                    let response = try await session.respond(to: "Term: \(term)\n\nExtract:\n\(text)")
                    call.resolve(["available": true, "text": response.content])
                } catch {
                    call.resolve(["available": false])
                }
            }
            return
        }
        #endif
        call.resolve(["available": false])
    }
}
