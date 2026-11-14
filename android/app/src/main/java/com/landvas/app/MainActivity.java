package com.landvas.app;

import android.os.Bundle;
import android.webkit.WebView;
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

    // Behind other apps the game should rest. Capacitor keeps the web view "visible" in the background, so the page
    // never learned it was hidden: its animations, earnings ticker, polling and timers ran on as if it were on screen.
    // Pausing the web view tells the page it's hidden (the same as a browser tab in the background): animations and
    // frames stop, timers that check for it stand down, and everything picks up again the moment you're back.
    @Override
    public void onPause() {
        super.onPause();
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) wv.onPause();
    }

    @Override
    public void onResume() {
        WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv != null) wv.onResume();
        super.onResume();
    }
}
