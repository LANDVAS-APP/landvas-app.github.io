package com.landvas.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A game's UI is laid out at fixed sizes: don't let the phone's font-size setting stretch it out of its boxes
        // (native games ignore it too). The in-game text is already sized for small screens.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setTextZoom(100);
        }
    }
}
