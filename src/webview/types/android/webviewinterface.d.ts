declare namespace com {
    export namespace nativescript {
        export namespace webviewinterface {
            export class WebViewBridgeInterface {
                public emitEvent(param0: string, param1: string): void;
                public emitEventToNativeScript(param0: string, param1: string): void;
                public constructor();
            }
            export class WebChromeClient extends globalAndroid.webkit.WebChromeClient {
                public setConsoleEnabled(value: boolean);
                public isConsoleEnabled(): boolean;
                public handleConsoleMessage(message: android.webkit.ConsoleMessage): boolean;
            }
            export class PopupWebChromeClient extends globalAndroid.webkit.WebChromeClient {
                public constructor(delegate: globalAndroid.webkit.WebChromeClient, supportPopups: boolean, activityContext: globalAndroid.content.Context);
                public setSupportPopups(value: boolean): void;
                public setUrlInterceptor(interceptor: PopupWebChromeClient.PopupUrlInterceptor): void;
            }
            export namespace PopupWebChromeClient {
                export class PopupUrlInterceptor {
                    constructor(implementation: { shouldHandleExternally(url: string): boolean });
                    shouldHandleExternally(url: string): boolean;
                }
            }
            export class WebView extends globalAndroid.webkit.WebView {
                public setScrollEnabled(value: boolean);
                public getScrollEnabled(): boolean;
            }
        }
    }
}
