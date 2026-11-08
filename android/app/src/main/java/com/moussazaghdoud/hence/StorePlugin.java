package com.moussazaghdoud.hence;

import android.content.Intent;
import android.net.Uri;
import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * The Android twin of ios/App/App/StorePlugin.swift: Hence Pro through Google
 * Play Billing, behind the same calls (src/lib/pro/store.ts).
 *
 * Play Console holds the same three products as App Store Connect, under the
 * same ids: two subscriptions (yearly, monthly, each with one base plan and its
 * free-trial offer) and the lifetime purchase as a one-time product.
 *
 * Every purchase is acknowledged here: Play refunds one that is not within
 * three days.
 */
@CapacitorPlugin(name = "Store")
public class StorePlugin extends Plugin {

    private static final String LIFETIME = "com.moussazaghdoud.hence.pro.lifetime";

    private BillingClient billing;
    /** Details from the last products() call, which purchase() needs to start a payment. */
    private final Map<String, ProductDetails> known = new HashMap<>();
    /** The purchase() waiting for Play's answer, if any. */
    private PluginCall buying;

    @Override
    public void load() {
        billing = BillingClient
            .newBuilder(getContext())
            .setListener(this::onPurchasesUpdated)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .build();
    }

    /** Runs `then` once connected to Play, or rejects the call. */
    private void connected(PluginCall call, Runnable then) {
        if (billing.isReady()) {
            then.run();
            return;
        }
        billing.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else call.reject("Google Play is not available: " + result.getDebugMessage(), "unavailable");
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Reconnected at the next call.
            }
        });
    }

    // ---- Offers

    @PluginMethod
    public void products(PluginCall call) {
        connected(call, () -> {
            List<String> ids = new ArrayList<>();
            try {
                ids.addAll(call.getArray("ids").toList());
            } catch (Exception e) {
                call.reject("No product ids", "invalid");
                return;
            }
            List<QueryProductDetailsParams.Product> subs = new ArrayList<>();
            List<QueryProductDetailsParams.Product> once = new ArrayList<>();
            for (String id : ids) {
                QueryProductDetailsParams.Product p = QueryProductDetailsParams.Product
                    .newBuilder()
                    .setProductId(id)
                    .setProductType(LIFETIME.equals(id) ? BillingClient.ProductType.INAPP : BillingClient.ProductType.SUBS)
                    .build();
                (LIFETIME.equals(id) ? once : subs).add(p);
            }
            JSArray out = new JSArray();
            // Subscriptions and one-time products are asked separately: Play takes one type per query.
            query(subs, () -> query(once, () -> {
                for (String id : ids) {
                    ProductDetails d = known.get(id);
                    if (d != null) out.put(offer(d));
                }
                JSObject ret = new JSObject();
                ret.put("products", out);
                call.resolve(ret);
            }));
        });
    }

    private void query(List<QueryProductDetailsParams.Product> products, Runnable then) {
        if (products.isEmpty()) {
            then.run();
            return;
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(products).build();
        billing.queryProductDetailsAsync(params, (result, list) -> {
            if (list != null) for (ProductDetails d : list) known.put(d.getProductId(), d);
            then.run();
        });
    }

    /** One product as the web layer's Offer: price formatted by Play, period, free trial. */
    private JSObject offer(ProductDetails d) {
        JSObject o = new JSObject();
        o.put("id", d.getProductId());
        o.put("title", d.getName());
        if (BillingClient.ProductType.INAPP.equals(d.getProductType())) {
            ProductDetails.OneTimePurchaseOfferDetails one = d.getOneTimePurchaseOfferDetails();
            o.put("price", one != null ? one.getFormattedPrice() : "");
            o.put("kind", "lifetime");
            return o;
        }
        o.put("kind", "subscription");
        ProductDetails.SubscriptionOfferDetails chosen = bestOffer(d);
        if (chosen == null) {
            o.put("price", "");
            return o;
        }
        for (ProductDetails.PricingPhase phase : chosen.getPricingPhases().getPricingPhaseList()) {
            if (phase.getPriceAmountMicros() == 0) {
                // A free phase is only offered to those who may have it: Play has checked.
                o.put("trial", period(phase.getBillingPeriod()));
                o.put("trialEligible", true);
            } else {
                o.put("price", phase.getFormattedPrice());
                o.put("period", period(phase.getBillingPeriod()));
            }
        }
        return o;
    }

    /** The offer with a free trial when this person may have one, else the plain base plan. */
    private static ProductDetails.SubscriptionOfferDetails bestOffer(ProductDetails d) {
        List<ProductDetails.SubscriptionOfferDetails> offers = d.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) return null;
        for (ProductDetails.SubscriptionOfferDetails o : offers) {
            for (ProductDetails.PricingPhase p : o.getPricingPhases().getPricingPhaseList()) {
                if (p.getPriceAmountMicros() == 0) return o;
            }
        }
        return offers.get(0);
    }

    /** ISO 8601 "P1Y", "P1M", "P1W", "P7D" → { value, unit }. */
    private static JSObject period(String iso) {
        JSObject p = new JSObject();
        int value = 1;
        String unit = "month";
        if (iso != null && iso.length() >= 3) {
            try {
                value = Integer.parseInt(iso.substring(1, iso.length() - 1));
            } catch (NumberFormatException ignored) {
                // keep 1
            }
            switch (iso.charAt(iso.length() - 1)) {
                case 'D':
                    unit = "day";
                    break;
                case 'W':
                    unit = "week";
                    break;
                case 'Y':
                    unit = "year";
                    break;
                default:
                    unit = "month";
            }
        }
        p.put("value", value);
        p.put("unit", unit);
        return p;
    }

    // ---- Buying

    @PluginMethod
    public void purchase(PluginCall call) {
        String id = call.getString("id", "");
        ProductDetails d = known.get(id);
        if (d == null) {
            call.reject("Unknown product: load the offers first", "unknown");
            return;
        }
        connected(call, () -> {
            BillingFlowParams.ProductDetailsParams.Builder item = BillingFlowParams.ProductDetailsParams
                .newBuilder()
                .setProductDetails(d);
            if (BillingClient.ProductType.SUBS.equals(d.getProductType())) {
                ProductDetails.SubscriptionOfferDetails o = bestOffer(d);
                if (o == null) {
                    call.reject("No offer for " + id, "unknown");
                    return;
                }
                item.setOfferToken(o.getOfferToken());
            }
            List<BillingFlowParams.ProductDetailsParams> items = new ArrayList<>();
            items.add(item.build());
            BillingFlowParams flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(items).build();
            call.setKeepAlive(true);
            buying = call;
            BillingResult started = billing.launchBillingFlow(getActivity(), flow);
            if (started.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                buying = null;
                call.setKeepAlive(false);
                answer(call, started.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED ? "cancelled" : "unknown", null);
            }
        });
    }

    /** Play's answer to a purchase, and any change made elsewhere (a renewal, a refund, a pending payment clearing). */
    private void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = buying;
        buying = null;
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            boolean pending = false;
            for (Purchase p : purchases) {
                if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) pending = true;
                acknowledge(p);
            }
            boolean anyPending = pending;
            active(list -> {
                notifyEntitlements(list);
                if (call != null) answer(call, list.length() == 0 && anyPending ? "pending" : "purchased", list);
            });
            return;
        }
        if (call == null) return;
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) answer(call, "cancelled", null);
        else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) active(list -> answer(call, "purchased", list));
        else answer(call, "unknown", null);
    }

    private void answer(PluginCall call, String status, JSArray active) {
        JSObject ret = new JSObject();
        ret.put("status", status);
        if (active != null) ret.put("active", active);
        call.setKeepAlive(false);
        call.resolve(ret);
    }

    private void acknowledge(Purchase p) {
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED || p.isAcknowledged()) return;
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build();
        billing.acknowledgePurchase(params, r -> {
            // Retried at the next launch if it failed: entitlements() acknowledges too.
        });
    }

    // ---- What is owned

    @PluginMethod
    public void entitlements(PluginCall call) {
        connected(call, () -> active(list -> {
            JSObject ret = new JSObject();
            ret.put("active", list);
            call.resolve(ret);
        }));
    }

    /** Play keeps purchases with the Google account: asking again is restoring. */
    @PluginMethod
    public void restore(PluginCall call) {
        entitlements(call);
    }

    /** Every product owned now, subscriptions and the lifetime purchase together. */
    private void active(Consumer<JSArray> then) {
        Set<String> owned = new HashSet<>();
        String[] types = { BillingClient.ProductType.SUBS, BillingClient.ProductType.INAPP };
        collect(types, 0, owned, () -> {
            JSArray list = new JSArray();
            for (String id : owned) list.put(id);
            then.accept(list);
        });
    }

    private void collect(String[] types, int i, Set<String> owned, Runnable then) {
        if (i >= types.length) {
            then.run();
            return;
        }
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder().setProductType(types[i]).build();
        billing.queryPurchasesAsync(params, (result, purchases) -> {
            if (purchases != null) {
                for (Purchase p : purchases) {
                    if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                    acknowledge(p);
                    owned.addAll(p.getProducts());
                }
            }
            collect(types, i + 1, owned, then);
        });
    }

    private void notifyEntitlements(JSArray list) {
        JSObject data = new JSObject();
        data.put("active", list);
        notifyListeners("entitlements", data);
    }

    // ---- The rest

    /** Promo codes are entered in the Play Store itself. */
    @PluginMethod
    public void redeem(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/redeem"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * Founding members and TestFlight testers are iPhone ideas: every Android
     * copy is a store copy, with no first build to look back on.
     */
    @PluginMethod
    public void environment(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("environment", "appstore");
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        if (billing != null) billing.endConnection();
    }
}
