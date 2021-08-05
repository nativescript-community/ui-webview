package com.nativescript.webviewinterface;

public class WebChromeClient extends android.webkit.WebChromeClient {
    boolean mConsoleEnabled ;

    public WebChromeClient() {
        super();
        mConsoleEnabled = true;
    }
    public void setConsoleEnabled(boolean value) {
        mConsoleEnabled = value;
    }

    public boolean isConsoleEnabled() {
        return mConsoleEnabled;
    }
    public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
        if(mConsoleEnabled == false) {
            return true;
        }
        return handleConsoleMessage(message);
    }

    public boolean handleConsoleMessage(android.webkit.ConsoleMessage message) {
        return false;
    }
}
