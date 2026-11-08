package com.moussazaghdoud.hence;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugins, the Android twins of the Swift ones in ios/App/App.
        registerPlugin(SpeechPlugin.class);
        registerPlugin(AppearancePlugin.class);
        registerPlugin(TextReaderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
