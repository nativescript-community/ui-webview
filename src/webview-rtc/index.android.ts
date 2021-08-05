import { AWebView } from '@nativescript-community/ui-webview';
import { webRTCProperty } from './index.common';
export default function install() {
    AWebView.prototype[webRTCProperty.setNative] = function (enabled: boolean) {};
}
