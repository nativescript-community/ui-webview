import { Device, File, Trace, knownFolders } from '@nativescript/core';
import lazy from '@nativescript/core/utils/lazy';
import { isEnabledProperty } from '@nativescript/core/ui/core/view';
import {
    CacheMode,
    UnsupportedSDKError,
    WebViewExtBase,
    WebViewTraceCategory,
    allowsInlineMediaPlaybackProperty,
    builtInZoomControlsProperty,
    cacheModeProperty,
    databaseStorageProperty,
    debugModeProperty,
    displayZoomControlsProperty,
    domStorageProperty,
    isScrollEnabledProperty,
    mediaPlaybackRequiresUserActionProperty,
    scrollBarIndicatorVisibleProperty,
    supportZoomProperty,
    useWideViewPortProperty,
    webConsoleProperty
} from './index.common';

export * from './index.common';

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
    ['ttf', 'application/x-font-ttf']
]);

const extToBinaryEncoding = new Set<string>(['gif', 'jpeg', 'jpg', 'otf', 'png', 'ttf']);

//#region android_native_classes
const cacheModeMap = {
    get cache_first() {
        return android.webkit.WebSettings.LOAD_CACHE_ELSE_NETWORK;
    },
    get cache_only() {
        return android.webkit.WebSettings.LOAD_CACHE_ONLY;
    },
    get default() {
        return android.webkit.WebSettings.LOAD_DEFAULT;
    },
    get no_cache() {
        return android.webkit.WebSettings.LOAD_NO_CACHE;
    },
    get normal() {
        return android.webkit.WebSettings.LOAD_NORMAL;
    }
};

export interface AndroidWebViewClient extends android.webkit.WebViewClient {}

export interface AndroidWebView extends com.nativescript.webviewinterface.WebView {
    client: AndroidWebViewClient | null;
    chromeClient: com.nativescript.webviewinterface.WebChromeClient | null;
    bridgeInterface?: com.nativescript.webviewinterface.WebViewBridgeInterface;
}

let WebViewExtClient: new (owner: AWebView) => AndroidWebViewClient;
let WebChromeViewExtClient: new (owner: AWebView) => com.nativescript.webviewinterface.WebChromeClient;
let WebViewBridgeInterface: new (owner: AWebView) => com.nativescript.webviewinterface.WebViewBridgeInterface;

const sdkVersion = lazy(() => parseInt(Device.sdkVersion, 10));

function initializeWebViewClient(): void {
    if (WebViewExtClient) {
        return;
    }

    @NativeClass()
    class WebViewExtClientImpl extends android.webkit.WebViewClient {
        private owner: WeakRef<AWebView>;
        constructor(owner: AWebView) {
            super();

            this.owner = new WeakRef(owner);

            return global.__native(this);
        }

        /**
         * Give the host application a chance to take control when a URL is about to be loaded in the current WebView.
         */
        public shouldOverrideUrlLoading(view: android.webkit.WebView, request: string | android.webkit.WebResourceRequest) {
            const owner = this.owner.get();
            if (!owner) {
                if (Trace.isEnabled()) {
                    Trace.write('WebViewExtClientImpl.shouldOverrideUrlLoading(...) - no owner', WebViewTraceCategory, Trace.messageType.warn);
                }
                return true;
            }

            let url = request as string;
            let httpMethod = 'GET';
            if (typeof request === 'object') {
                httpMethod = request.getMethod();
                url = request.getUrl().toString();
            }

            if (Trace.isEnabled()) {
                let hasGesture = false;
                let isRedirect = false;
                let isForMainFrame = false;
                let requestHeaders: java.util.Map<string, string> | null = null;
                if (typeof request === 'object') {
                    hasGesture = request.hasGesture();
                    isRedirect = request.isRedirect();
                    isForMainFrame = request.isForMainFrame();
                    requestHeaders = request.getRequestHeaders();
                }
                Trace.write(
                    `WebViewClientClass.shouldOverrideUrlLoading("${url}") - method:${httpMethod} isRedirect:${isRedirect} hasGesture:${hasGesture} isForMainFrame:${isForMainFrame} headers:${requestHeaders}`,
                    WebViewTraceCategory,
                    Trace.messageType.info
                );
            }

            if (url.startsWith(owner.interceptScheme)) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewClientClass.shouldOverrideUrlLoading("${url}") - "${owner.interceptScheme}" - cancel`, WebViewTraceCategory, Trace.messageType.info);
                }
                return true;
            }

            const shouldOverrideUrlLoading = owner._onShouldOverrideUrlLoading(url, httpMethod);
            if (shouldOverrideUrlLoading === true) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewClientClass.shouldOverrideUrlLoading("${url}") - cancel loading url`, WebViewTraceCategory, Trace.messageType.info);
                }
                return true;
            }

            return false;
        }

        public shouldInterceptRequest(view: android.webkit.WebView, request: string | android.webkit.WebResourceRequest) {
            const owner = this.owner.get();
            if (!owner) {
                if (Trace.isEnabled()) {
                    Trace.write('WebViewExtClientImpl.shouldInterceptRequest() - no owner', WebViewTraceCategory, Trace.messageType.warn);
                }
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            let url: string | void;
            if (typeof request === 'string') {
                url = request;
            } else if (typeof request === 'object') {
                url = request.getUrl().toString();
            }

            if (typeof url !== 'string') {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewClientClass.shouldInterceptRequest("${url}") - is not a string`, WebViewTraceCategory, Trace.messageType.info);
                }
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            if (!url.startsWith(owner.interceptScheme)) {
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            const filepath = owner.getRegisteredLocalResource(url);
            if (!filepath) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewClientClass.shouldInterceptRequest("${url}") - no matching file`, WebViewTraceCategory, Trace.messageType.info);
                }
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            if (!File.exists(filepath)) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewClientClass.shouldInterceptRequest("${url}") - file: "${filepath}" doesn't exists`, WebViewTraceCategory, Trace.messageType.info);
                }
                return super.shouldInterceptRequest(view, request as android.webkit.WebResourceRequest);
            }

            const tnsFile = File.fromPath(filepath);

            const javaFile = new java.io.File(tnsFile.path);
            const stream = new java.io.FileInputStream(javaFile);
            const ext = tnsFile.extension.substring(1).toLowerCase();
            const mimeType = extToMimeType.get(ext) || 'application/octet-stream';
            const encoding = extToBinaryEncoding.has(ext) || mimeType === 'application/octet-stream' ? 'binary' : 'UTF-8';

            if (Trace.isEnabled()) {
                Trace.write(`WebViewClientClass.shouldInterceptRequest("${url}") - file: "${filepath}" mimeType:${mimeType} encoding:${encoding}`, WebViewTraceCategory, Trace.messageType.info);
            }
            const response = new android.webkit.WebResourceResponse(mimeType, encoding, stream);
            if (sdkVersion() < 21 || !response.getResponseHeaders) {
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

        public onPageStarted(view: android.webkit.WebView, url: string, favicon: android.graphics.Bitmap) {
            super.onPageStarted(view, url, favicon);
            const owner = this.owner.get();
            if (!owner) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewExtClientImpl.onPageStarted("${view}", "${url}", "${favicon}") - no owner`, WebViewTraceCategory, Trace.messageType.warn);
                }
                return;
            }

            if (Trace.isEnabled()) {
                Trace.write(`WebViewClientClass.onPageStarted("${view}", "${url}", "${favicon}")`, WebViewTraceCategory, Trace.messageType.log);
            }
            owner._onLoadStarted(url);
        }

        public onPageFinished(view: android.webkit.WebView, url: string) {
            super.onPageFinished(view, url);

            const owner = this.owner.get();
            if (!owner) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewExtClientImpl.onPageFinished("${view}", ${url}") - no owner`, WebViewTraceCategory, Trace.messageType.warn);
                }
                return;
            }

            if (Trace.isEnabled()) {
                Trace.write(`WebViewClientClass.onPageFinished("${view}", ${url}")`, WebViewTraceCategory, Trace.messageType.info);
            }
            owner._onLoadFinished(url);
        }

        public onReceivedError(...args: any[]) {
            if (args.length === 4) {
                const [view, errorCode, description, failingUrl] = args as [android.webkit.WebView, number, string, string];
                this.onReceivedErrorBeforeAPI23(view, errorCode, description, failingUrl);
            } else {
                const [view, request, error] = args as [android.webkit.WebView, any, any];
                this.onReceivedErrorAPI23(view, request, error);
            }
        }

        private onReceivedErrorAPI23(view: android.webkit.WebView, request: any, error: any) {
            super.onReceivedError(view, request, error);

            const owner = this.owner.get();
            if (!owner) {
                if (Trace.isEnabled()) {
                    Trace.write('WebViewExtClientImpl.onReceivedErrorAPI23(...) - no owner', WebViewTraceCategory, Trace.messageType.warn);
                }
                return;
            }

            let url = error.getUrl && error.getUrl();
            if (!url && typeof request === 'object') {
                url = request.getUrl().toString();
            }

            if (Trace.isEnabled()) {
                Trace.write(`WebViewClientClass.onReceivedErrorAPI23(${error.getErrorCode()}, ${error.getDescription()}, ${url})`, WebViewTraceCategory, Trace.messageType.info);
            }

            owner._onLoadFinished(url, `${error.getDescription()}(${error.getErrorCode()})`);
        }

        private onReceivedErrorBeforeAPI23(view: android.webkit.WebView, errorCode: number, description: string, failingUrl: string) {
            super.onReceivedError(view, errorCode, description, failingUrl);

            const owner = this.owner.get();
            if (!owner) {
                if (Trace.isEnabled()) {
                    Trace.write('WebViewExtClientImpl.onReceivedErrorBeforeAPI23(...) - no owner', WebViewTraceCategory, Trace.messageType.warn);
                }

                return;
            }

            if (Trace.isEnabled()) {
                Trace.write(`WebViewClientClass.onReceivedErrorBeforeAPI23(${errorCode}, "${description}", "${failingUrl}")`, WebViewTraceCategory, Trace.messageType.info);
            }
            owner._onLoadFinished(failingUrl, `${description}(${errorCode})`);
        }
    }

    WebViewExtClient = WebViewExtClientImpl;

    @NativeClass()
    class WebChromeViewExtClientImpl extends com.nativescript.webviewinterface.WebChromeClient {
        private owner: WeakRef<AWebView>;
        private showCustomViewCallback?: android.webkit.WebChromeClient.CustomViewCallback;

        constructor(owner: AWebView) {
            super();

            this.owner = new WeakRef(owner);

            return global.__native(this);
        }

        public onShowCustomView(view: AndroidWebView) {
            const owner = this.owner.get();
            if (!owner) {
                return;
            }

            let callback: android.webkit.WebChromeClient.CustomViewCallback;

            if (arguments.length === 3) {
                callback = arguments[2];
            } else if (arguments.length === 2) {
                callback = arguments[1];
            } else {
                return;
            }

            if (owner._onEnterFullscreen(() => this.hideCustomView())) {
                this.showCustomViewCallback = callback;
            } else {
                callback.onCustomViewHidden();
            }
        }

        private hideCustomView() {
            if (this.showCustomViewCallback) {
                this.showCustomViewCallback.onCustomViewHidden();
            }

            this.showCustomViewCallback = undefined;
        }

        public onHideCustomView() {
            this.showCustomViewCallback = undefined;

            const owner = this.owner.get();
            if (!owner) {
                return;
            }

            owner._onExitFullscreen();
        }

        public onProgressChanged(view: AndroidWebView, newProgress: number) {
            const owner = this.owner.get();
            if (!owner) {
                return;
            }

            owner._loadProgress(newProgress);
        }

        public onReceivedTitle(view: AndroidWebView, title: string) {
            const owner = this.owner.get();
            if (!owner) {
                return;
            }
            if (owner.hasListeners(WebViewExtBase.titleChangedEvent)) {
                owner._titleChanged(title);
            }
        }

        public onJsAlert(view: AndroidWebView, url: string, message: string, result: android.webkit.JsResult): boolean {
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

        public onJsConfirm(view: AndroidWebView, url: string, message: string, result: android.webkit.JsResult): boolean {
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

        public onJsPrompt(view: AndroidWebView, url: string, message: string, defaultValue: string, result: android.webkit.JsPromptResult): boolean {
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

        public handleConsoleMessage(): boolean {
            if (arguments.length !== 1) {
                return false;
            }

            const owner = this.owner.get();
            if (!owner) {
                return false;
            }

            const consoleMessage = arguments[0] as android.webkit.ConsoleMessage;
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
        async _onPermissionsRequest(permissionRequest: android.webkit.PermissionRequest) {
            const owner = this.owner?.get();
            if (!owner) {
                permissionRequest.deny();
                return;
            }
            try {
                const requests = permissionRequest.getResources();
                const wantedPermissions = new Array();
                const requestedPermissions = new Array();
                for (let i = 0; i < requests.length; i += 1) {
                    switch (requests[i]) {
                        case android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE: {
                            requestedPermissions.push(android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE);
                            wantedPermissions.push('audio');
                            break;
                        }
                        case android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE: {
                            requestedPermissions.push(android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE);
                            wantedPermissions.push('camera');
                            break;
                        }
                    }
                }
                if (requestedPermissions.length === 0) {
                    permissionRequest.deny();
                }
                await owner._onRequestPermissions(wantedPermissions);

                permissionRequest.grant(requestedPermissions);
            } catch (error) {
                permissionRequest.deny();
                owner.notify({ eventName: 'error', error });
            }
        }
        onPermissionRequest(permissionRequest: android.webkit.PermissionRequest) {
            this._onPermissionsRequest(permissionRequest);
        }
        async onGeolocationPermissionsShowPrompt(origin: string, callback: globalAndroid.webkit.GeolocationPermissions.Callback) {
            const owner = this.owner?.get();
            if (!owner) {
                callback.invoke(origin, false, false);
                return;
            }
            try {
                await owner._onRequestPermissions(['location']);
                callback.invoke(origin, true, true);
            } catch (error) {
                callback.invoke(origin, false, false);
                owner.notify({ eventName: 'error', error });
            }
        }
        public onReceivedIcon(webView: globalAndroid.webkit.WebView, icon: globalAndroid.graphics.Bitmap): void {
            const owner = this.owner?.get();
            if (!owner) {
                return;
            }
            if (owner.hasListeners('favicon')) {
                owner.notify({ eventName: 'favicon', icon });
            }
        }
        public onReceivedTouchIconUrl(webView: globalAndroid.webkit.WebView, url: string, precomposed: boolean): void {
            const owner = this.owner?.get();
            if (!owner) {
                return;
            }
            if (owner.hasListeners('touchicon')) {
                owner.notify({ eventName: 'touchicon', url, precomposed });
            }
        }
        public onShowFileChooser(
            webView: globalAndroid.webkit.WebView,
            filePathCallback: globalAndroid.webkit.ValueCallback<androidNative.Array<globalAndroid.net.Uri>>,
            fileChooserParams: globalAndroid.webkit.WebChromeClient.FileChooserParams
        ): boolean {
            const owner = this.owner?.get();
            if (!owner) {
                return false;
            }
            if (owner.hasListeners('fileChooser')) {
                owner.notify({
                    eventName: 'fileChooser',
                    callback: (files: string[]) => {
                        if (!files || files.length === 0) {
                            filePathCallback.onReceiveValue(null);
                        } else {
                            const res = Array.create(android.net.Uri, files.length);
                            files.forEach((filePath, index) => {
                                const file = File.fromPath(filePath);
                                res[index] = android.net.Uri.parse(`file://${file.path}`);
                            });
                        }
                    },
                    fileChooserParams
                });
                return true;
            }
            return false;
        }
        // onPermissionRequestCanceled (permissionRequest: android.webkit.PermissionRequest) {
        //     console.log("onPermissionRequestCanceled", permissionRequest);
        //     return super.onPermissionRequestCanceled(permissionRequest);
        // }
    }

    WebChromeViewExtClient = WebChromeViewExtClientImpl;

    @NativeClass()
    class WebViewBridgeInterfaceImpl extends com.nativescript.webviewinterface.WebViewBridgeInterface {
        private owner: WeakRef<AWebView>;
        constructor(owner: AWebView) {
            super();

            this.owner = new WeakRef(owner);

            return global.__native(this);
        }

        public emitEventToNativeScript(eventName: string, data: string) {
            const owner = this.owner.get();
            if (!owner) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewExtClientImpl.emitEventToNativeScript("${eventName}") - no owner`, WebViewTraceCategory, Trace.messageType.warn);
                }
                return;
            }

            try {
                return owner.onWebViewEvent(eventName, JSON.parse(data));
            } catch (err) {
                if (Trace.isEnabled()) {
                    Trace.write(`WebViewExtClientImpl.emitEventToNativeScript("${eventName}") - couldn't parse data: ${data} err: ${err}`, WebViewTraceCategory, Trace.messageType.info);
                }
            }

            owner.onWebViewEvent(eventName, data);
        }
    }

    WebViewBridgeInterface = WebViewBridgeInterfaceImpl;
}
//#endregion android_native_classes

// let instanceNo = 0;
export class AWebView extends WebViewExtBase {
    public static supportXLocalScheme = true;

    public nativeViewProtected: AndroidWebView;

    protected readonly localResourceMap = new Map<string, string>();

    public supportXLocalScheme = true;

    public createWebViewClient?: (AWebView, clientClass: typeof WebViewExtClient) => android.webkit.WebViewClient;

    // public readonly instance = ++instanceNo;

    public android: AndroidWebView;

    public createNativeView() {
        const nativeView = new com.nativescript.webviewinterface.WebView(this._context);
        const settings = nativeView.getSettings();

        // Needed for the bridge library
        settings.setJavaScriptEnabled(true);
        settings.setAllowFileAccess(true); // Needed for Android 11

        if (sdkVersion() >= 21) {
            // Needed for x-local in https-sites
            settings.setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Needed for XHRRequests with x-local://
        settings.setAllowUniversalAccessFromFileURLs(true);

        return nativeView;
    }

    public initNativeView() {
        super.initNativeView();

        initializeWebViewClient();

        const nativeView = this.nativeViewProtected;
        if (!nativeView) {
            return;
        }
        if (this.createWebViewClient) {
            const client = this.createWebViewClient(this, WebViewExtClient);

            nativeView.setWebViewClient(client);
            nativeView.client = client;
        } else {
            const client = new WebViewExtClient(this);
            nativeView.setWebViewClient(client);
            nativeView.client = client;
        }
        const chromeClient = new WebChromeViewExtClient(this);

        nativeView.setWebChromeClient(chromeClient);
        nativeView.chromeClient = chromeClient;

        const bridgeInterface = new WebViewBridgeInterface(this);
        nativeView.addJavascriptInterface(bridgeInterface, 'androidWebViewBridge');
        nativeView.bridgeInterface = bridgeInterface;
    }

    public disposeNativeView() {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            nativeView.setWebViewClient(null);
            nativeView.setWebChromeClient(null);
            nativeView.removeJavascriptInterface('androidWebViewBridge');
            nativeView.client = null;
            nativeView.chromeClient = null;
            nativeView.bridgeInterface = null;
            nativeView.destroy();
        }

        super.disposeNativeView();
    }

    // public async ensurePromiseSupport() {
    //     if (sdkVersion() >= 21) {
    //         return;
    //     }

    //     return super.ensurePromiseSupport();
    // }

    public _loadUrl(src: string) {
        const nativeView = this.nativeViewProtected;
        if (!nativeView) {
            return;
        }

        if (Trace.isEnabled()) {
            Trace.write(`WebViewExt<android>._loadUrl("${src}")`, WebViewTraceCategory, Trace.messageType.info);
        }
        nativeView.loadUrl(src);
        if (Trace.isEnabled()) {
            Trace.write(`WebViewExt<android>._loadUrl("${src}") - end`, WebViewTraceCategory, Trace.messageType.info);
        }
    }

    public _loadData(src: string) {
        const nativeView = this.nativeViewProtected;
        if (!nativeView) {
            return;
        }

        const baseUrl = `file:///${knownFolders.currentApp().path}/`;
        if (Trace.isEnabled()) {
            Trace.write(`WebViewExt<android>._loadData("${src}") -> baseUrl: "${baseUrl}"`, WebViewTraceCategory, Trace.messageType.info);
        }
        nativeView.loadDataWithBaseURL(baseUrl, src, 'text/html', 'utf-8', null!);
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
            if (Trace.isEnabled()) {
                Trace.write(`WebViewExt<android>.registerLocalResource("${resourceName}", "${path}") -> file doesn't exist`, WebViewTraceCategory, Trace.messageType.error);
            }

            return;
        }

        if (Trace.isEnabled()) {
            Trace.write(`WebViewExt<android>.registerLocalResource("${resourceName}", "${path}") -> file: "${filepath}"`, WebViewTraceCategory, Trace.messageType.info);
        }

        this.localResourceMap.set(resourceName, filepath);
    }

    public unregisterLocalResource(resourceName: string) {
        if (Trace.isEnabled()) {
            Trace.write(`WebViewExt<android>.unregisterLocalResource("${resourceName}")`, WebViewTraceCategory, Trace.messageType.info);
        }
        resourceName = this.fixLocalResourceName(resourceName);

        this.localResourceMap.delete(resourceName);
    }

    public getRegisteredLocalResource(resourceName: string) {
        resourceName = this.fixLocalResourceName(resourceName);

        const result = this.localResourceMap.get(resourceName);

        if (Trace.isEnabled()) {
            Trace.write(`WebViewExt<android>.getRegisteredLocalResource("${resourceName}") => "${result}"`, WebViewTraceCategory, Trace.messageType.info);
        }

        return result;
    }

    /**
     * Always load the Fetch-polyfill on Android.
     *
     * Native 'Fetch API' on Android rejects all request for resources no HTTP or HTTPS.
     * This breaks x-local:// requests (and file://).
     */
    // public async ensureFetchSupport() {
    //     if (Trace.isEnabled()) {
    //         Trace.write("WebViewExt<android>.ensureFetchSupport() - Override 'Fetch API' to support x-local.", WebViewTraceCategory, Trace.messageType.info);
    //     }

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

    //     await this.loadFetchPolyfill();
    // }

    public async executeJavaScript<T>(scriptCode: string): Promise<T> {
        if (sdkVersion() < 19) {
            if (Trace.isEnabled()) {
                Trace.write(`WebViewExt<android>.executeJavaScript() -> SDK:${sdkVersion()} not supported`, WebViewTraceCategory, Trace.messageType.error);
            }
            return Promise.reject(new UnsupportedSDKError(19));
        }

        const result = await new Promise<T>((resolve, reject) => {
            const androidWebView = this.nativeViewProtected;
            if (!androidWebView) {
                if (Trace.isEnabled()) {
                    Trace.write('WebViewExt<android>.executeJavaScript() -> no nativeView?', WebViewTraceCategory, Trace.messageType.error);
                }
                reject(new Error('Native Android not initialized, cannot call executeJavaScript'));

                return;
            }

            androidWebView.evaluateJavascript(
                scriptCode,
                new android.webkit.ValueCallback({
                    onReceiveValue(result: any) {
                        resolve(result);
                    }
                })
            );
        });

        return this.parseWebViewJavascriptResult(result);
    }

    public async getTitle() {
        return this.nativeViewProtected && this.nativeViewProtected.getTitle();
    }

    public zoomIn() {
        const androidWebView = this.nativeViewProtected;

        return androidWebView.zoomIn();
    }

    public zoomOut() {
        const androidWebView = this.nativeViewProtected;

        return androidWebView.zoomOut();
    }

    public zoomBy(zoomFactor: number) {
        if (sdkVersion() < 21) {
            if (Trace.isEnabled()) {
                Trace.write('WebViewExt<android>.zoomBy - not supported on this SDK', WebViewTraceCategory, Trace.messageType.info);
            }

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
    [webConsoleProperty.getDefault]() {
        return true;
    }
    [webConsoleProperty.setNative](enabled: boolean) {
        if (this.nativeViewProtected?.chromeClient) {
            this.nativeViewProtected.chromeClient.setConsoleEnabled(enabled);
        }
    }

    [builtInZoomControlsProperty.getDefault]() {
        const androidWebView = this.nativeViewProtected;

        const settings = androidWebView.getSettings();

        return settings.getBuiltInZoomControls();
    }

    [builtInZoomControlsProperty.setNative](enabled: boolean) {
        this.nativeViewProtected.getSettings().setBuiltInZoomControls(!!enabled);
    }
    [displayZoomControlsProperty.getDefault]() {
        const androidWebView = this.nativeViewProtected;
        const settings = androidWebView.getSettings();

        return settings.getDisplayZoomControls();
    }

    [displayZoomControlsProperty.setNative](enabled: boolean) {
        this.nativeViewProtected.getSettings().setDisplayZoomControls(!!enabled);
    }

    [scrollBarIndicatorVisibleProperty.getDefault](): boolean {
        return true;
    }
    [scrollBarIndicatorVisibleProperty.setNative](value: boolean) {
        const androidWebView = this.nativeViewProtected;
        androidWebView.setHorizontalScrollBarEnabled(value);
        androidWebView.setVerticalScrollBarEnabled(value);
    }

    [cacheModeProperty.getDefault](): CacheMode | null {
        return 'default';
        // const androidWebView = this.nativeViewProtected;
        // if (!androidWebView) {
        //     return null;
        // }

        // const settings = androidWebView.getSettings();
        // const cacheModeInt = settings.getCacheMode();

        // for (const key of Object.keys(cacheModeMap)) {
        //     if (cacheModeMap[key] === cacheModeInt) {
        //         return key as CacheMode;
        //     }
        // }

        // return null;
    }

    [cacheModeProperty.setNative](cacheMode: CacheMode) {
        this.nativeViewProtected.getSettings().setCacheMode(cacheModeMap[cacheMode]);
    }

    [useWideViewPortProperty.setNative](value: boolean) {
        this.nativeViewProtected.getSettings().setUseWideViewPort(value);
    }

    [databaseStorageProperty.getDefault]() {
        return this.nativeViewProtected.getSettings().getDatabaseEnabled();
    }

    [databaseStorageProperty.setNative](enabled: boolean) {
        this.nativeViewProtected.getSettings().setDatabaseEnabled(!!enabled);
    }

    [domStorageProperty.getDefault]() {
        return this.nativeViewProtected.getSettings().getDomStorageEnabled();
    }

    [domStorageProperty.setNative](enabled: boolean) {
        return this.nativeViewProtected.getSettings().setDomStorageEnabled(!!enabled);
    }

    [supportZoomProperty.getDefault]() {
        return this.nativeViewProtected.getSettings().supportZoom();
    }

    [supportZoomProperty.setNative](enabled: boolean) {
        this.nativeViewProtected.getSettings().setSupportZoom(!!enabled);
    }

    public [isScrollEnabledProperty.setNative](value: boolean) {
        this.nativeViewProtected.setScrollEnabled(value);
    }

    [isEnabledProperty.setNative](enabled: boolean) {
        const androidWebView = this.nativeViewProtected;
        if (enabled) {
            androidWebView.setOnTouchListener(null!);
        } else {
            androidWebView.setOnTouchListener(
                new android.view.View.OnTouchListener({
                    onTouch() {
                        return true;
                    }
                })
            );
        }
    }

    [mediaPlaybackRequiresUserActionProperty.setNative](enabled: boolean) {
        this.nativeViewProtected.getSettings().setMediaPlaybackRequiresUserGesture(enabled);
    }
    [allowsInlineMediaPlaybackProperty.setNative](enabled: boolean) {
        // not supported
    }
}
