package com.moussazaghdoud.hence;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.provider.Settings;
import android.view.Window;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The Android twin of ios/App/App/AppearancePlugin.swift: which way the
 * system should dress the app, the app's page in Settings, and the rating
 * request (src/lib/native/bridge.ts).
 *
 * Android draws the status bar (clock, battery) and the navigation bar
 * (back, home) itself, outside the web view: left alone they stay light over
 * a dark app. setStyle paints both the colour of the page and picks icons
 * that read on it.
 */
@CapacitorPlugin(name = "Appearance")
public class AppearancePlugin extends Plugin {

    /** --color-paper in src/styles/index.css, light and dark. */
    private static final int LIGHT_PAPER = Color.parseColor("#faf9f6");
    private static final int DARK_PAPER = Color.parseColor("#232326");

    @PluginMethod
    public void setStyle(PluginCall call) {
        boolean dark = "dark".equals(call.getString("style", "dark"));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            int color = dark ? DARK_PAPER : LIGHT_PAPER;
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(window, window.getDecorView());
            // "Light bars" means dark icons, for a light background.
            bars.setAppearanceLightStatusBars(!dark);
            bars.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }

    /** Hence's page in the phone's Settings, where refused permissions are given back. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Google Play's in-app review comes with the Play release; until then, nothing. */
    @PluginMethod
    public void requestReview(PluginCall call) {
        call.resolve();
    }
}
