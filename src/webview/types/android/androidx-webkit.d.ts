declare namespace androidx {
    export namespace webkit {
        export class WebViewFeature {
            public static DOCUMENT_START_SCRIPT: string;
            public static isFeatureSupported(feature: string): boolean;
        }
        export class WebViewCompat {
            public static addDocumentStartJavaScript(webView: android.webkit.WebView, script: string, allowedOriginRules: java.util.Set<string>): ScriptHandler;
        }
        export class ScriptHandler {
            public remove(): void;
        }
    }
}
