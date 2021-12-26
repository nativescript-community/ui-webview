import { NSWebViewBridgeBase } from './bridge.common';

declare const androidWebViewBridge: {
    emitEvent(eventName: string, data: string): void;
};

// Forked from nativescript-webview-interface@1.4.2
class NSWebViewBridge extends NSWebViewBridgeBase {
    private get androidWebViewBridge() {
        if (typeof androidWebViewBridge !== 'undefined') {
            return androidWebViewBridge;
        }
    }
    /**
     * Calls native android function to emit event and payload to android
     */
    protected emitEvent(eventName: any, data: any) {
        this.androidWebViewBridge.emitEvent(eventName, data);
    }
}

const nsBridgeReadyEventName = 'ns-bridge-ready';

const w = window as any;
if (!w.nsWebViewBridge) {
    // Only create the NSWebViewBridge, if is doesn't already exist.
    w.nsWebViewBridge = new NSWebViewBridge();

    for (const eventName of [nsBridgeReadyEventName, 'ns-brige-ready']) {
        if (typeof CustomEvent !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent(eventName, {
                    detail: w.nsWebViewBridge
                })
            );
        } else {
            window.dispatchEvent(new Event(eventName));
        }
    }
}
