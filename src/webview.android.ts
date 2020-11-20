import { File, Trace, knownFolders } from '@nativescript/core';
import * as utils from '@nativescript/core/utils/utils';
import {
    AWebViewBase,
    CacheMode,
    UnsupportedSDKError,
    builtInZoomControlsProperty,
    cacheModeProperty,
    databaseStorageProperty,
    debugModeProperty,
    displayZoomControlsProperty,
    domStorageProperty,
    isScrollEnabledProperty,
    supportZoomProperty,
} from './webview-common';

export * from './webview-common';

function getNativeHashMap(obj: { [k: string]: string }) {
    if (!obj) {
        return null;
    }
    const map = new java.util.HashMap<string, string>();
    Object.keys(obj).forEach((k) => {
        map.put(k, obj[k]);
    });
    return map;
}
const extToMimeType = new Map<string, string>([
    ['html', 'text/html'],
    ['htm', 'text/html'],
    ['xhtml', 'text/html'],
    ['xhtm', 'text/html'],
    ['css', 'text/css'],
    ['gif', 'image/gif'],
    ['jpeg', 'image/jpeg'],
    ['jpg', 'image/jpeg'],
    ['js', 'text/javascript'],
    ['otf', 'application/vnd.ms-opentype'],
    ['png', 'image/png'],
    ['svg', 'image/svg+xml'],
    ['ttf', 'application/x-font-ttf'],
]);

const extToBinaryEncoding = new Set<string>(['gif', 'jpeg', 'jpg', 'otf', 'png', 'ttf']);

// #region android_native_classes
let cacheModeMap: Map<CacheMode, number>;

declare class AndroidWebView extends com.nativescriptcommunity.webview.WebView {
    client: AndroidWebViewClient | null;
    chromeClient: android.webkit.WebChromeClient | null;
    bridgeInterface?: com.nativescriptcommunity.webview.WebViewBridgeInterface;
    scrollListener: android.view.View.OnScrollChangeListener;
    isScrollEnabled: boolean;
}
export interface AndroidWebViewClient extends android.webkit.WebViewClient {}

let AWebViewClient: new () => AndroidWebViewClient;
let WebChromeViewExtClient: new () => android.webkit.WebChromeClient;
let WebViewBridgeInterface: new () => com.nativescriptcommunity.webview.WebViewBridgeInterface;

function initializeWebViewClient(): void {
    if (AWebViewClient) {
        return;
    }

    cacheModeMap = new Map<CacheMode, number>([
        ['cache_first', android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK],
        ['cache_only', android.webkit.WebSettings.LOAD_CACHE_ONLY],
        ['default', android.webkit.WebSettings.LOAD_DEFAULT],
        ['no_cache', android.webkit.WebSettings.LOAD_NO_CACHE],
        ['normal', android.webkit.WebSettings.LOAD_NORMAL],
    ]);

    @NativeClass
    class AWebViewClientImpl extends android.webkit.WebViewClient {
        owner: WeakRef<AWebView>;

        /**
         * Give the host application a chance to take control when a URL is about to be loaded in the current WebView.
         */
        shouldOverrideUrlLoading(view: android.webkit.WebView, request: string | android.webkit.WebResourceRequest) {
            const owner = this.owner.get();
            if (!owner) {
                console.warn('AWebViewClientImpl.shouldOverrideUrlLoading(...) - no owner');
                return true;
            }

            let url = request as string;
            let httpMethod = 'GET';
            let isRedirect = false;
            let hasGesture = false;
            let isForMainFrame = false;
            let requestHeaders: java.util.Map<string, string> | null = null;
            if (typeof request === 'object') {
                httpMethod = request.getMethod();
                isRedirect = request.isRedirect();
                hasGesture = request.hasGesture();
                isForMainFrame = request.isForMainFrame();
                requestHeaders = request.getRequestHeaders();

                url = request.getUrl().toString();
            }

            owner.writeTrace(
                () =>
                    `WebViewClientClass.shouldOverrideUrlLoading("${url}") - method:${httpMethod} isRedirect:${isRedirect} hasGesture:${hasGesture} isForMainFrame:${isForMainFrame} headers:${requestHeaders}`
            );

            if (url.startsWith(owner.interceptScheme)) {
                owner.writeTrace(
                    () => `WebViewClientClass.shouldOverrideUrlLoading("${url}") - "${owner.interceptScheme}" - cancel`
                );
                return true;
            }

            const shouldOverrideUrlLoading = owner._onShouldOverrideUrlLoading(url, httpMethod);
            if (shouldOverrideUrlLoading === true) {
                owner.writeTrace(() => `WebViewClientClass.shouldOverrideUrlLoading("${url}") - cancel loading url`);
                return true;
            }

            return false;
        }

        shouldInterceptRequest(view: android.webkit.WebView, request: string | android.webkit.WebResourceRequest) {
            const owner = this.owner.get();
            if (!owner) {
                console.warn('AWebViewClientImpl.shouldInterceptRequest(...) - no owner');
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            let url: string;
            if (typeof request === 'string') {
                url = request;
            } else if (typeof request === 'object') {
                url = request.getUrl().toString();
            }

            if (typeof url !== 'string') {
                owner.writeTrace(() => `WebViewClientClass.shouldInterceptRequest("${url}") - is not a string`);
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            if (!url.startsWith(owner.interceptScheme)) {
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            const filepath = owner.getRegisteredLocalResource(url);
            if (!filepath) {
                owner.writeTrace(() => `WebViewClientClass.shouldInterceptRequest("${url}") - no matching file`);
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            if (!File.exists(filepath)) {
                owner.writeTrace(
                    () => `WebViewClientClass.shouldInterceptRequest("${url}") - file: "${filepath}" doesn't exists`
                );
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            const tnsFile = File.fromPath(filepath);

            const javaFile = new java.io.File(tnsFile.path);
            const stream = new java.io.FileInputStream(javaFile);
            const ext = tnsFile.extension.substr(1).toLowerCase();
            const mimeType = extToMimeType.get(ext) || 'application/octet-stream';
            const encoding = extToBinaryEncoding.has(ext) || mimeType === 'application/octet-stream' ? 'binary' : 'UTF-8';

            owner.writeTrace(
                () =>
                    `WebViewClientClass.shouldInterceptRequest("${url}") - file: "${filepath}" mimeType:${mimeType} encoding:${encoding}`
            );

            const response = new android.webkit.WebResourceResponse(mimeType, encoding, stream);
            if (android.os.Build.VERSION.SDK_INT < 21 || !response.getResponseHeaders) {
                return response;
            }

            let responseHeaders = response.getResponseHeaders();
            if (!responseHeaders) {
                responseHeaders = new java.util.HashMap<string, string>();
            }

            responseHeaders.put('Access-Control-Allow-Origin', '*');
            response.setResponseHeaders(responseHeaders);

            return response;
        }
        onPageStarted(view: android.webkit.WebView, url: string, favicon: android.graphics.Bitmap) {
            super.onPageStarted(view, url, favicon);
            const owner = this.owner.get();
            if (!owner) {
                console.warn(`AWebViewClientImpl.onPageStarted("${view}", "${url}", "${favicon}") - no owner`);
                return;
            }

            owner.writeTrace(() => `WebViewClientClass.onPageStarted("${view}", "${url}", "${favicon}")`);
            owner._onLoadStarted(url);
        }
        onPageFinished(view: android.webkit.WebView, url: string) {
            super.onPageFinished(view, url);

            const owner = this.owner.get();
            if (!owner) {
                console.warn(`AWebViewClientImpl.onPageFinished("${view}", ${url}") - no owner`);
                return;
            }

            owner.writeTrace(() => `WebViewClientClass.onPageFinished("${view}", ${url}")`);
            owner._onLoadFinished(url).catch(() => void 0);
        }
        onReceivedError(...args: any[]) {
            if (args.length === 4) {
                const [view, errorCode, description, failingUrl] = args as [android.webkit.WebView, number, string, string];
                this.onReceivedErrorBeforeAPI23(view, errorCode, description, failingUrl);
            } else {
                const [view, request, error] = args as [android.webkit.WebView, any, any];
                this.onReceivedErrorAPI23(view, request, error);
            }
        }
        onReceivedErrorAPI23(view: android.webkit.WebView, request: any, error: any) {
            super.onReceivedError(view, request, error);

            const owner = this.owner.get();
            if (!owner) {
                console.warn('AWebViewClientImpl.onReceivedErrorAPI23(...) - no owner');
                return;
            }

            let url = error.getUrl && error.getUrl();
            if (!url && typeof request === 'object') {
                url = request.getUrl().toString();
            }

            owner.writeTrace(
                () => `WebViewClientClass.onReceivedErrorAPI23(${error.getErrorCode()}, ${error.getDescription()}, ${url})`
            );

            owner._onLoadFinished(url, `${error.getDescription()}(${error.getErrorCode()})`).catch(() => void 0);
        }
        onReceivedErrorBeforeAPI23(view: android.webkit.WebView, errorCode: number, description: string, failingUrl: string) {
            super.onReceivedError(view, errorCode, description, failingUrl);

            const owner = this.owner.get();
            if (!owner) {
                console.warn('AWebViewClientImpl.onReceivedErrorBeforeAPI23(...) - no owner');
                return;
            }

            owner.writeTrace(
                () => `WebViewClientClass.onReceivedErrorBeforeAPI23(${errorCode}, "${description}", "${failingUrl}")`
            );
            owner._onLoadFinished(failingUrl, `${description}(${errorCode})`).catch(() => void 0);
        }
    }

    AWebViewClient = AWebViewClientImpl;

    @NativeClass
    class WebChromeViewExtClientImpl extends android.webkit.WebChromeClient {
        private owner: WeakRef<AWebView>;

        onGeolocationPermissionsHidePrompt(): void {
            return super.onGeolocationPermissionsHidePrompt();
        }
        onProgressChanged(view: AndroidWebView, newProgress: number) {
            const owner = this.owner.get();
            if (!owner) {
                return;
            }

            owner._loadProgress(newProgress);
        }
        onReceivedTitle(view: AndroidWebView, title: string) {
            const owner = this.owner.get();
            if (!owner) {
                return;
            }

            owner._titleChanged(title);
        }
        onJsAlert(view: android.webkit.WebView, url: string, message: string, result: android.webkit.JsResult): boolean {
            const owner = this.owner.get();
            if (!owner) {
                return false;
            }

            let gotResponse = false;
            return owner._webAlert(message, () => {
                if (!gotResponse) {
                    result.confirm();
                }

                gotResponse = true;
            });
        }
        onJsConfirm(view: android.webkit.WebView, url: string, message: string, result: android.webkit.JsResult): boolean {
            const owner = this.owner.get();
            if (!owner) {
                return false;
            }

            let gotResponse = false;
            return owner._webConfirm(message, (confirmed: boolean) => {
                if (!gotResponse) {
                    if (confirmed) {
                        result.confirm();
                    } else {
                        result.cancel();
                    }
                }

                gotResponse = true;
            });
        }
        onJsPrompt(
            view: android.webkit.WebView,
            url: string,
            message: string,
            defaultValue: string,
            result: android.webkit.JsPromptResult
        ): boolean {
            const owner = this.owner.get();
            if (!owner) {
                return false;
            }

            let gotResponse = false;
            return owner._webPrompt(message, defaultValue, (message: string) => {
                if (!gotResponse) {
                    if (message) {
                        result.confirm(message);
                    } else {
                        result.confirm();
                    }
                }

                gotResponse = true;
            });
        }
        onConsoleMessage(...args: any): boolean {
            if (arguments.length !== 1) {
                return false;
            }

            const owner = this.owner.get();
            if (!owner) {
                return false;
            }

            const consoleMessage = args[0] as android.webkit.ConsoleMessage;

            if (consoleMessage instanceof android.webkit.ConsoleMessage) {
                const message = consoleMessage.message();
                const lineNo = consoleMessage.lineNumber();
                let level = 'log';
                const { DEBUG, LOG, WARNING } = android.webkit.ConsoleMessage.MessageLevel;
                switch (consoleMessage.messageLevel()) {
                    case DEBUG: {
                        level = 'debug';
                        break;
                    }
                    case LOG: {
                        level = 'log';
                        break;
                    }
                    case WARNING: {
                        level = 'warn';
                        break;
                    }
                }

                return owner._webConsole(message, lineNo, level);
            }

            return false;
        }
    }

    WebChromeViewExtClient = WebChromeViewExtClientImpl;

    @NativeClass
    class WebViewBridgeInterfaceImpl extends com.nativescriptcommunity.webview.WebViewBridgeInterface {
        private owner: WeakRef<AWebView>;
        emitEventToNativeScript(eventName: string, data: string) {
            const owner = this.owner.get();
            if (!owner) {
                console.warn(`AWebViewClientImpl.emitEventToNativeScript("${eventName}") - no owner`);
                return;
            }

            try {
                owner.onWebViewEvent(eventName, JSON.parse(data));
                return;
            } catch (err) {
                owner.writeTrace(
                    () => `AWebViewClientImpl.emitEventToNativeScript("${eventName}") - couldn't parse data: ${data} err: ${err}`
                );
            }

            owner.onWebViewEvent(eventName, data);
        }
    }
    WebViewBridgeInterface = WebViewBridgeInterfaceImpl;
}
// #endregion android_native_classes

let instanceNo = 0;
export class AWebView extends AWebViewBase {
    public nativeViewProtected: AndroidWebView;

    protected readonly localResourceMap = new Map<string, string>();

    //@ts-ignore
    public get isUIWebView() {
        return false;
    }

    //@ts-ignore
    public get isWKWebView() {
        return false;
    }

    public readonly instance = ++instanceNo;

    public android: AndroidWebView;

    public createNativeView() {
        initializeWebViewClient();
        const nativeView = new com.nativescriptcommunity.webview.WebView(this._context);
        const settings = nativeView.getSettings();

        // Needed for the bridge library
        settings.setJavaScriptEnabled(true);

        settings.setBuiltInZoomControls(!!this.builtInZoomControls);
        settings.setDisplayZoomControls(!!this.displayZoomControls);
        settings.setSupportZoom(!!this.supportZoom);

        if (android.os.Build.VERSION.SDK_INT >= 21) {
            // Needed for x-local in https-sites
            settings.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Needed for XHRRequests with x-local://
        settings.setAllowUniversalAccessFromFileURLs(true);
        return nativeView;
    }

    public initNativeView() {
        super.initNativeView();

        const nativeView = this.nativeViewProtected;
        if (!nativeView) {
            return;
        }

        const client = new AWebViewClient();
        const chromeClient = new WebChromeViewExtClient();
        nativeView.setWebViewClient(client);
        nativeView.client = client;

        nativeView.setWebChromeClient(chromeClient);
        nativeView.chromeClient = chromeClient;
        const bridgeInterface = new WebViewBridgeInterface();
        (bridgeInterface as any).owner = (client as any).owner = (chromeClient as any).owner = new WeakRef(this);
        nativeView.addJavascriptInterface(bridgeInterface, 'androidWebViewBridge');
        nativeView.bridgeInterface = bridgeInterface;
    }

    public disposeNativeView() {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            nativeView.client = null;
            nativeView.chromeClient = null;
            nativeView.destroy();
        }

        super.disposeNativeView();
    }
    onLoaded() {
        super.onLoaded();
        this.attachScrollListener();
    }
    _nScrollListener: android.view.View.OnScrollChangeListener;
    scrolling = false;
    _scrollCount = 0;

    private attachScrollListener() {
        if (this._scrollCount > 0 && this.isLoaded) {
            const nativeView = this.nativeViewProtected;
            if (!nativeView.scrollListener) {
                this._nScrollListener = new android.view.View.OnScrollChangeListener({
                    onScrollChange: this.onScrollChange.bind(this),
                });
                nativeView.scrollListener = this._nScrollListener;
                nativeView.setOnScrollChangeListener(this._nScrollListener);
            }
        }
    }

    private dettachScrollListener() {
        if (this._scrollCount === 0 && this.isLoaded) {
            const nativeView = this.nativeViewProtected;
            if (nativeView.scrollListener) {
                nativeView.setOnScrollChangeListener(null);
                nativeView.scrollListener = null;
            }
        }
    }

    public onScrollChange(view: androidx.recyclerview.widget.RecyclerView, dx: number, dy: number) {
        if (!this) {
            return;
        }

        if (this.hasListeners(AWebViewBase.scrollEvent)) {
            this.notify({
                object: this,
                eventName: AWebViewBase.scrollEvent,
                scrollOffset: view.computeVerticalScrollOffset() / utils.layout.getDisplayDensity(),
            });
        }
    }
    public addEventListener(arg: string, callback: any, thisArg?: any) {
        super.addEventListener(arg, callback, thisArg);
        if (arg === AWebViewBase.scrollEvent) {
            this._scrollCount++;
            this.attachScrollListener();
        }
    }

    public removeEventListener(arg: string, callback: any, thisArg?: any) {
        super.removeEventListener(arg, callback, thisArg);

        if (arg === AWebViewBase.scrollEvent) {
            this._scrollCount--;
            this.dettachScrollListener();
        }
    }

    // public async ensurePromiseSupport() {
    //     if (android.os.Build.VERSION.SDK_INT >= 21) {
    //         return;
    //     }

    //     return await super.ensurePromiseSupport();
    // }

    public _loadUrl(src: string, headers?: { [k: string]: string }) {
        const nativeView = this.nativeViewProtected;
        if (!nativeView) {
            return;
        }

        this.writeTrace(() => `AWebView<android>._loadUrl("${src}")`);
        if (headers) {
            nativeView.loadUrl(src, getNativeHashMap(headers));
        } else {
            nativeView.loadUrl(src);
        }
        this.writeTrace(() => `AWebView<android>._loadUrl("${src}") - end`);
    }

    public _loadData(src: string) {
        const nativeView = this.nativeViewProtected;
        if (!nativeView) {
            return;
        }

        const baseUrl = `file:///${knownFolders.currentApp().path}/`;
        this.writeTrace(() => `AWebView<android>._loadData("${src}") -> baseUrl: "${baseUrl}"`);
        nativeView.loadDataWithBaseURL(baseUrl, src, 'text/html', 'utf-8', null);
    }

    public get canGoBack(): boolean {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            return nativeView.canGoBack();
        }
        return false;
    }

    public stopLoading() {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            nativeView.stopLoading();
        }
    }

    get canGoForward(): boolean {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            return nativeView.canGoForward();
        }
        return false;
    }

    public goBack() {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            return nativeView.goBack();
        }
    }

    public goForward() {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            return nativeView.goForward();
        }
    }

    public reload() {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            return nativeView.reload();
        }
    }

    public registerLocalResource(resourceName: string, path: string) {
        resourceName = this.fixLocalResourceName(resourceName);

        const filepath = this.resolveLocalResourceFilePath(path);
        if (!filepath) {
            this.writeTrace(
                () => `AWebView<android>.registerLocalResource("${resourceName}", "${path}") -> file doesn't exist`,
                Trace.messageType.error
            );
            return;
        }

        this.writeTrace(() => `AWebView<android>.registerLocalResource("${resourceName}", "${path}") -> file: "${filepath}"`);

        this.localResourceMap.set(resourceName, filepath);
    }

    public unregisterLocalResource(resourceName: string) {
        this.writeTrace(() => `AWebView<android>.unregisterLocalResource("${resourceName}")`);
        resourceName = this.fixLocalResourceName(resourceName);

        this.localResourceMap.delete(resourceName);
    }

    public getRegisteredLocalResource(resourceName: string) {
        resourceName = this.fixLocalResourceName(resourceName);

        const result = this.localResourceMap.get(resourceName);

        this.writeTrace(() => `AWebView<android>.getRegisteredLocalResource("${resourceName}") => "${result}"`);

        return result;
    }

    /**
     * Always load the Fetch-polyfill on Android.
     *
     * Native 'Fetch API' on Android rejects all request for resources no HTTP or HTTPS.
     * This breaks x-local:// requests (and file://).
     */
    // public async ensureFetchSupport() {
    //     this.writeTrace(()=>"AWebView<android>.ensureFetchSupport() - Override 'Fetch API' to support x-local.");

    //     // The polyfill is not loaded if fetch already exists, start by null'ing it.
    //     await this.executeJavaScript(
    //         `
    //         try {
    //             window.fetch = null;
    //         } catch (err) {
    //             console.error("null'ing Native Fetch API failed:", err);
    //         }
    //     `
    //     );

    //     // await this.loadFetchPolyfill();
    // }

    public async executeJavaScript<T>(scriptCode: string): Promise<T> {
        if (android.os.Build.VERSION.SDK_INT < 19) {
            this.writeTrace(
                () => `AWebView<android>.executeJavaScript() -> SDK:${android.os.Build.VERSION.SDK_INT} not supported`,
                Trace.messageType.error
            );
            return Promise.reject(new UnsupportedSDKError(19));
        }

        const result = await new Promise<T>((resolve, reject) => {
            if (!this.nativeViewProtected) {
                this.writeTrace(() => 'AWebView<android>.executeJavaScript() -> no nativeView?', Trace.messageType.error);
                reject(new Error('Native Android not initialized, cannot call executeJavaScript'));
                return;
            }

            this.nativeViewProtected.evaluateJavascript(
                scriptCode,
                new android.webkit.ValueCallback({
                    onReceiveValue(result: any) {
                        resolve(result);
                    },
                })
            );
        });

        return this.parseWebViewJavascriptResult(result);
    }

    public async getTitle() {
        return this.nativeViewProtected && this.nativeViewProtected.getTitle();
    }

    public zoomIn() {
        if (!this.nativeViewProtected) {
            return false;
        }
        return this.nativeViewProtected.zoomIn();
    }

    public zoomOut() {
        if (!this.nativeViewProtected) {
            return false;
        }
        return this.nativeViewProtected.zoomOut();
    }

    public zoomBy(zoomFactor: number) {
        if (android.os.Build.VERSION.SDK_INT < 21) {
            this.writeTrace(() => 'AWebView<android>.zoomBy - not supported on this SDK');
            return;
        }

        if (!this.nativeViewProtected) {
            return;
        }

        if (zoomFactor >= 0.01 && zoomFactor <= 100) {
            return this.nativeViewProtected.zoomBy(zoomFactor);
        }

        throw new Error('ZoomBy only accepts values between 0.01 and 100 both inclusive');
    }

    [debugModeProperty.getDefault]() {
        return false;
    }

    [debugModeProperty.setNative](enabled: boolean) {
        android.webkit.WebView.setWebContentsDebuggingEnabled(!!enabled);
    }

    [builtInZoomControlsProperty.getDefault]() {
        if (!this.nativeViewProtected) {
            return false;
        }

        const settings = this.nativeViewProtected.getSettings();
        return settings.getBuiltInZoomControls();
    }

    [builtInZoomControlsProperty.setNative](enabled: boolean) {
        if (!this.nativeViewProtected) {
            return;
        }
        const settings = this.nativeViewProtected.getSettings();
        settings.setBuiltInZoomControls(!!enabled);
    }

    [displayZoomControlsProperty.getDefault]() {
        if (!this.nativeViewProtected) {
            return false;
        }
        const settings = this.nativeViewProtected.getSettings();
        return settings.getDisplayZoomControls();
    }

    [displayZoomControlsProperty.setNative](enabled: boolean) {
        if (!this.nativeViewProtected) {
            return;
        }
        const settings = this.nativeViewProtected.getSettings();
        settings.setDisplayZoomControls(!!enabled);
    }

    [cacheModeProperty.getDefault](): CacheMode {
        if (!this.nativeViewProtected) {
            return null;
        }

        const settings = this.nativeViewProtected.getSettings();
        const cacheModeInt = settings.getCacheMode();
        for (const [key, value] of cacheModeMap) {
            if (value === cacheModeInt) {
                return key;
            }
        }

        return null;
    }

    [cacheModeProperty.setNative](cacheMode: CacheMode) {
        if (!this.nativeViewProtected) {
            return;
        }

        const settings = this.nativeViewProtected.getSettings();
        for (const [key, nativeValue] of cacheModeMap) {
            if (key === cacheMode) {
                settings.setCacheMode(nativeValue);
                return;
            }
        }
    }

    [databaseStorageProperty.getDefault]() {
        if (!this.nativeViewProtected) {
            return false;
        }

        const settings = this.nativeViewProtected.getSettings();
        return settings.getDatabaseEnabled();
    }

    [databaseStorageProperty.setNative](enabled: boolean) {
        if (!this.nativeViewProtected) {
            return;
        }

        const settings = this.nativeViewProtected.getSettings();
        settings.setDatabaseEnabled(!!enabled);
    }

    [domStorageProperty.getDefault]() {
        if (!this.nativeViewProtected) {
            return false;
        }

        const settings = this.nativeViewProtected.getSettings();
        return settings.getDomStorageEnabled();
    }

    [domStorageProperty.setNative](enabled: boolean) {
        if (!this.nativeViewProtected) {
            return;
        }

        const settings = this.nativeViewProtected.getSettings();
        settings.setDomStorageEnabled(!!enabled);
    }

    [supportZoomProperty.getDefault]() {
        if (!this.nativeViewProtected) {
            return false;
        }

        const settings = this.nativeViewProtected.getSettings();
        return settings.supportZoom();
    }

    [supportZoomProperty.setNative](enabled: boolean) {
        if (!this.nativeViewProtected) {
            return;
        }

        const settings = this.nativeViewProtected.getSettings();
        settings.setSupportZoom(!!enabled);
    }
    public [isScrollEnabledProperty.setNative](value: boolean) {
        this.nativeViewProtected.isScrollEnabled = value;
    }
}
