import Capacitor
import StoreKit
import UIKit

/**
 Hence Pro, bought through the App Store with StoreKit 2.

 Three products: a monthly and a yearly subscription (one subscription
 group, each with a free trial set in App Store Connect) and a one-time
 lifetime purchase. StoreKit signs every transaction and checks the
 signature on the phone, so there is no server of Hence's own: what the
 phone holds as verified, current entitlements is what is unlocked.

 Renewals, refunds and purchases made on another device arrive through
 `Transaction.updates`, listened to for as long as the app runs, and are
 passed on to the page as an `entitlements` event.
 */
@objc(StorePlugin)
public class StorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StorePlugin"
    public let jsName = "Store"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "entitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "redeem", returnType: CAPPluginReturnPromise)
    ]

    /// Apple's own sheet for an offer code made in App Store Connect — how
    /// Pro is given away. What it unlocks arrives through Transaction.updates.
    @objc func redeem(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if #available(iOS 16.0, *),
               let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                Task { @MainActor in
                    do {
                        try await AppStore.presentOfferCodeRedeemSheet(in: scene)
                        call.resolve()
                    } catch {
                        call.reject(error.localizedDescription, "failed")
                    }
                }
            } else {
                SKPaymentQueue.default().presentCodeRedemptionSheet()
                call.resolve()
            }
        }
    }

    private var updates: Task<Void, Never>?

    override public func load() {
        updates = Task.detached { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
                await self?.announce()
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    private func announce() async {
        let active = await StorePlugin.activeProducts()
        notifyListeners("entitlements", data: ["active": active])
    }

    /// Product identifiers the person owns right now, verified and not refunded.
    static func activeProducts() async -> [String] {
        var ids: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.revocationDate == nil {
                ids.append(transaction.productID)
            }
        }
        return ids
    }

    private static func kind(_ type: Product.ProductType) -> String {
        if type == .autoRenewable { return "subscription" }
        if type == .nonConsumable { return "lifetime" }
        return "other"
    }

    private static func period(_ period: Product.SubscriptionPeriod) -> [String: Any] {
        let unit: String
        switch period.unit {
        case .day: unit = "day"
        case .week: unit = "week"
        case .month: unit = "month"
        case .year: unit = "year"
        @unknown default: unit = "month"
        }
        return ["value": period.value, "unit": unit]
    }

    /// What each product is called and costs, in the person's own currency.
    @objc func products(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let found = try await Product.products(for: ids)
                var list: [[String: Any]] = []
                for product in found {
                    var item: [String: Any] = [
                        "id": product.id,
                        "title": product.displayName,
                        "price": product.displayPrice,
                        "kind": StorePlugin.kind(product.type)
                    ]
                    if let subscription = product.subscription {
                        item["period"] = StorePlugin.period(subscription.subscriptionPeriod)
                        if let offer = subscription.introductoryOffer, offer.paymentMode == .freeTrial {
                            item["trial"] = StorePlugin.period(offer.period)
                            item["trialEligible"] = await subscription.isEligibleForIntroOffer
                        }
                    }
                    list.append(item)
                }
                call.resolve(["products": list])
            } catch {
                call.reject(error.localizedDescription, "failed")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Which product", "bad_request")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("Unknown product", "unknown")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    if case .verified(let transaction) = verification {
                        await transaction.finish()
                        let active = await StorePlugin.activeProducts()
                        call.resolve(["status": "purchased", "active": active])
                    } else {
                        call.resolve(["status": "unverified"])
                    }
                case .pending:
                    // Ask to Buy, or a payment to confirm: it arrives later through updates.
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject(error.localizedDescription, "failed")
            }
        }
    }

    @objc func entitlements(_ call: CAPPluginCall) {
        Task {
            let active = await StorePlugin.activeProducts()
            call.resolve(["active": active])
        }
    }

    /// "Restore purchases": asks the App Store for this Apple ID's purchases.
    @objc func restore(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let active = await StorePlugin.activeProducts()
                call.resolve(["active": active])
            } catch {
                call.reject(error.localizedDescription, "failed")
            }
        }
    }
}
