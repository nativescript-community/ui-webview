export default function install();

declare module '@nativescript-community/ui-webview' {
    interface AWebView {
        webRTC: boolean;
    }
}
