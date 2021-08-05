import { AWebView } from '@nativescript-community/ui-webview';
import { webRTCProperty } from './index.common';
export default function install() {
    AWebView.prototype[webRTCProperty.setNative] = function (enabled: boolean) {
        const nativeView = this.nativeViewProtected;
        if (!nativeView || this.webViewRTC) {
            return;
        }

        this.webViewRTC = WKWebViewRTC.alloc().initWithWkwebviewContentController(nativeView, nativeView.configuration.userContentController);
    };
}
