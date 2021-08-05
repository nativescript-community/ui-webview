declare namespace com {
    export namespace nativescript {
        export namespace webviewinterface {
            export class WebViewBridgeInterface {
                public emitEvent(param0: string, param1: string): void;
                public emitEventToNativeScript(param0: string, param1: string): void;
                public constructor();
            }
            export class WebChromeClient extends android.webkit.WebChromeClient {
                public setConsoleEnabled(value: boolean);
                public isConsoleEnabled(): boolean;
                public handleConsoleMessage(message: android.webkit.ConsoleMessage): boolean;
            }
            export class WebView extends android.webkit.WebView {
                public setScrollEnabled(value: boolean);
                public getScrollEnabled(): boolean;
            }
        }
    }
}
