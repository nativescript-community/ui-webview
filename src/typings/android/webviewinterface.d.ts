declare namespace com {
    export namespace nativescriptcommunity {
        export namespace webview {
            export class WebViewBridgeInterface {
                public emitEvent(param0: string, param1: string): void;
                public emitEventToNativeScript(param0: string, param1: string): void;
                public constructor();
            }
            export class WebView extends globalAndroid.webkit.WebView {
                public setScrollEnabled(value: boolean);
                public getScrollEnabled(): boolean;
            }
        }
    }
}
