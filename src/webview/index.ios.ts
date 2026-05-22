import { File, Trace, alert, confirm, knownFolders, profile, prompt } from '@nativescript/core';
import { isEnabledProperty } from '@nativescript/core/ui/core/view';
import {
    NavigationType,
    ViewPortProperties,
    WebViewExtBase,
    WebViewTraceCategory,
    allowsInlineMediaPlaybackProperty,
    autoInjectJSBridgeProperty,
    customUserAgentProperty,
    debugModeProperty,
    limitsNavigationsToAppBoundDomainsProperty,
    mediaPlaybackRequiresUserActionProperty,
    scrollBarIndicatorVisibleProperty,
    scrollBounceProperty,
    viewPortProperty
} from './index.common';
import { webViewBridge } from './nativescript-webview-bridge-loader';

export * from './index.common';

const messageHandlerName = 'nsBridge';

export class AWebView extends WebViewExtBase {
    zoomIn(): boolean {
        return false;
    }
    zoomOut(): boolean {
        return false;
    }
    zoomBy(zoomFactor: number) {}
    nativeViewProtected: WKWebView;

    public static supportXLocalScheme = typeof CustomUrlSchemeHandler !== 'undefined';

    protected wkWebViewConfiguration: WKWebViewConfiguration;
    protected wkNavigationDelegate: WKNavigationDelegateNotaImpl;
    protected wkUIDelegate: WKUIDelegateNotaImpl;
    protected wkCustomUrlSchemeHandler: CustomUrlSchemeHandler | void;
    protected wkUserContentController: WKUserContentController;
    protected wkUserScriptInjectWebViewBridge?: WKUserScript;
    protected wkUserScriptViewPortCode: Promise<WKUserScript | null> | null;
    protected wkNamedUserScripts = [] as {
        resourceName: string;
        wkUserScript: WKUserScript;
    }[];

    public readonly supportXLocalScheme = typeof CustomUrlSchemeHandler !== 'undefined';

    public viewPortSize = { initialScale: 1.0 };
    private limitsNavigationsToAppBoundDomains = false;
    private allowsInlineMediaPlayback = false;
    private mediaTypesRequiringUser = true;

    public createNativeView() {
        const configuration = WKWebViewConfiguration.new();
        configuration.dataDetectorTypes = WKDataDetectorTypes.All;
        this.wkWebViewConfiguration = configuration;

        const messageHandler = WKScriptMessageHandlerNotaImpl.initWithOwner(new WeakRef(this));
        const wkUController = (this.wkUserContentController = WKUserContentController.new());
        wkUController.addScriptMessageHandlerName(messageHandler, messageHandlerName);
        configuration.userContentController = wkUController;
        configuration.preferences.setValueForKey(true, 'allowFileAccessFromFileURLs');
        configuration.setValueForKey(true, 'allowUniversalAccessFromFileURLs');
        configuration.limitsNavigationsToAppBoundDomains = this.limitsNavigationsToAppBoundDomains;
        configuration.mediaTypesRequiringUserActionForPlayback = this.mediaTypesRequiringUser ? WKAudiovisualMediaTypes.All : WKAudiovisualMediaTypes.None;
        configuration.allowsInlineMediaPlayback = this.allowsInlineMediaPlayback;

        if (this.supportXLocalScheme) {
            this.wkCustomUrlSchemeHandler = new CustomUrlSchemeHandler();
            configuration.setURLSchemeHandlerForURLScheme(this.wkCustomUrlSchemeHandler, this.interceptScheme);
        }

        return new WKWebView({
            frame: CGRectZero,
            configuration
        });
    }

    public initNativeView() {
        super.initNativeView();

        this.wkNavigationDelegate = WKNavigationDelegateNotaImpl.initWithOwner(new WeakRef(this));
        this.wkUIDelegate = WKUIDelegateNotaImpl.initWithOwner(new WeakRef(this));

        this.loadWKUserScripts();
    }

    public disposeNativeView() {
        this.wkWebViewConfiguration?.userContentController?.removeScriptMessageHandlerForName(messageHandlerName);
        this.wkWebViewConfiguration = null!;
        this.wkNavigationDelegate = null!;
        this.wkCustomUrlSchemeHandler = null!;
        this.wkUIDelegate = null!;

        super.disposeNativeView();
    }

    protected async injectWebViewBridge() {
        // return this.ensurePolyfills();
    }

    protected async injectViewPortMeta() {
        this.resetViewPortCode();
        if (this.supportXLocalScheme) {
            return;
        }

        return super.injectViewPortMeta();
    }

    public async executeJavaScript<T>(scriptCode: string, stringifyResult = true): Promise<T> {
        if (stringifyResult) {
            scriptCode = `
                (function(window) {
                    var result = null;

                    try {
                        result = ${scriptCode.trim()};
                    } catch (err) {
                        return JSON.stringify({
                            error: true,
                            message: err.message,
                            stack: err.stack
                        });
                    }

                    try {
                        return JSON.stringify(result);
                    } catch (err) {
                        return result;
                    }
                })(window);
            `;
        }

        const nativeView = this.nativeViewProtected;
        if (!nativeView) {
            return Promise.reject(new Error('WebView is missing'));
        }

        const rawResult = await new Promise<any>((resolve, reject) => {
            nativeView.evaluateJavaScriptCompletionHandler(scriptCode.trim(), (result, error) => {
                if (error) {
                    reject(error);

                    return;
                }

                resolve(result);
            });
        });

        const result: T = await this.parseWebViewJavascriptResult(rawResult);

        const r = result as any;
        if (r && typeof r === 'object' && r.error) {
            const error = new Error(r.message);
            (error as any).webStack = r.stack;
            throw error;
        }

        return result;
    }

    @profile
    public onLoaded() {
        super.onLoaded();

        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            nativeView.navigationDelegate = this.wkNavigationDelegate;
            nativeView.UIDelegate = this.wkUIDelegate;
        }
    }

    public onUnloaded() {
        const nativeView = this.nativeViewProtected;
        if (nativeView) {
            nativeView.navigationDelegate = null!;
            nativeView.UIDelegate = null!;
        }

        super.onUnloaded();
    }

    public stopLoading() {
        const nativeView = this.nativeViewProtected;

        nativeView.stopLoading();
    }

    public _loadUrl(src: string) {
        const nativeView = this.nativeViewProtected;

        const nsURL = NSURL.URLWithString(src);
        if (src.startsWith('file:///')) {
            const cachePath = src.substring(0, src.lastIndexOf('/'));
            const nsReadAccessUrl = NSURL.URLWithString(cachePath);
            if (Trace.isEnabled()) {
                Trace.write(`WKWebViewWrapper.loadUrl("${src}") -> ios.loadFileURLAllowingReadAccessToURL("${nsURL}", "${nsReadAccessUrl}"`, WebViewTraceCategory, Trace.messageType.info);
            }
            nativeView.loadFileURLAllowingReadAccessToURL(nsURL, nsReadAccessUrl);
        } else {
            const nsRequestWithUrl = NSURLRequest.requestWithURL(nsURL);
            if (Trace.isEnabled()) {
                Trace.write(`WKWebViewWrapper.loadUrl("${src}") -> ios.loadRequest("${nsRequestWithUrl}"`, WebViewTraceCategory, Trace.messageType.info);
            }
            nativeView.loadRequest(nsRequestWithUrl);
        }
    }

    public _loadData(content: string) {
        const nativeView = this.nativeViewProtected;

        const baseUrl = `file:///${knownFolders.currentApp().path}/`;
        const nsBaseUrl = NSURL.URLWithString(baseUrl);

        if (Trace.isEnabled()) {
            Trace.write(`WKWebViewWrapper.loadUrl(content) -> this.ios.loadHTMLStringBaseURL("${nsBaseUrl}")`, WebViewTraceCategory, Trace.messageType.info);
        }
        nativeView.loadHTMLStringBaseURL(content, nsBaseUrl);
    }

    public get canGoBack(): boolean {
        const nativeView = this.nativeViewProtected;

        return nativeView && !!nativeView.canGoBack;
    }

    public get canGoForward(): boolean {
        const nativeView = this.nativeViewProtected;

        return nativeView && !!nativeView.canGoForward;
    }

    public goBack() {
        const nativeView = this.nativeViewProtected;

        nativeView.goBack();
    }

    public goForward() {
        const nativeView = this.nativeViewProtected;

        nativeView.goForward();
    }

    public reload() {
        const nativeView = this.nativeViewProtected;

        nativeView.reload();
    }

    public _webAlert(message: string, callback: () => void) {
        if (!super._webAlert(message, callback)) {
            alert(message)
                .then(() => callback())
                .catch(() => callback());
        }

        return true;
    }

    public _webConfirm(message: string, callback: (response: boolean | null) => void) {
        if (!super._webConfirm(message, callback)) {
            confirm(message)
                .then((res) => callback(res))
                .catch(() => callback(null));
        }

        return true;
    }

    public _webPrompt(message: string, defaultText: string, callback: (response: string | null) => void) {
        if (!super._webPrompt(message, defaultText, callback)) {
            prompt(message, defaultText)
                .then((res) => {
                    if (res.result) {
                        callback(res.text);
                    } else {
                        callback(null);
                    }
                })
                .catch(() => callback(null));
        }

        return true;
    }

    public registerLocalResource(resourceName: string, path: string) {
        const cls = `WebViewExt<${this}.ios>.registerLocalResource("${resourceName}", "${path}")`;

        if (!this.supportXLocalScheme) {
            if (Trace.isEnabled()) {
                Trace.write(`${cls} -> custom schema isn't support on iOS <11`, WebViewTraceCategory, Trace.messageType.error);
            }
            return;
        }

        resourceName = this.fixLocalResourceName(resourceName);

        const filepath = this.resolveLocalResourceFilePath(path);
        if (!filepath) {
            if (Trace.isEnabled()) {
                Trace.write(`${cls} -> file doesn't exist`, WebViewTraceCategory, Trace.messageType.error);
            }

            return;
        }

        if (Trace.isEnabled()) {
            Trace.write(`${cls} -> file: "${filepath}"`, WebViewTraceCategory, Trace.messageType.info);
        }

        this.registerLocalResourceForNative(resourceName, filepath);
    }

    public unregisterLocalResource(resourceName: string) {
        const cls = `WebViewExt<${this}.ios>.unregisterLocalResource("${resourceName}")`;
        if (!this.supportXLocalScheme) {
            if (Trace.isEnabled()) {
                Trace.write(`${cls} -> custom schema isn't support on iOS <11`, WebViewTraceCategory, Trace.messageType.error);
            }

            return;
        }

        if (Trace.isEnabled()) {
            Trace.write(cls, WebViewTraceCategory, Trace.messageType.info);
        }

        resourceName = this.fixLocalResourceName(resourceName);

        this.unregisterLocalResourceForNative(resourceName);
    }

    public getRegisteredLocalResource(resourceName: string) {
        resourceName = this.fixLocalResourceName(resourceName);
        const cls = `WebViewExt<${this}.ios>.getRegisteredLocalResource("${resourceName}")`;
        if (!this.supportXLocalScheme) {
            if (Trace.isEnabled()) {
                Trace.write(`${cls} -> custom schema isn't support on iOS <11`, WebViewTraceCategory, Trace.messageType.error);
            }

            return null;
        }

        const result = this.getRegisteredLocalResourceFromNative(resourceName);

        if (Trace.isEnabled()) {
            Trace.write(`${cls} -> "${result}"`, WebViewTraceCategory, Trace.messageType.info);
        }

        return result;
    }

    public getTitle() {
        return this.executeJavaScript<string>('document.title');
    }

    public async autoLoadStyleSheetFile(resourceName: string, path: string, insertBefore?: boolean) {
        const filepath = this.resolveLocalResourceFilePath(path);
        if (!filepath) {
            if (Trace.isEnabled()) {
                Trace.write(`WKWebViewWrapper.autoLoadStyleSheetFile("${resourceName}", "${path}") - couldn't resolve filepath`, WebViewTraceCategory, Trace.messageType.info);
            }

            return;
        }

        resourceName = this.fixLocalResourceName(resourceName);
        const scriptCode = await this.generateLoadCSSFileScriptCode(resourceName, filepath, insertBefore);

        if (scriptCode) {
            this.addNamedWKUserScript(`auto-load-css-${resourceName}`, scriptCode);
        }
    }

    public removeAutoLoadStyleSheetFile(resourceName: string) {
        resourceName = this.fixLocalResourceName(resourceName);
        this.removeNamedWKUserScript(`auto-load-css-${resourceName}`);
    }

    public async autoLoadJavaScriptFile(resourceName: string, path: string) {
        const filepath = this.resolveLocalResourceFilePath(path);
        if (!filepath) {
            if (Trace.isEnabled()) {
                Trace.write(`WKWebViewWrapper.autoLoadJavaScriptFile("${resourceName}", "${path}") - couldn't resolve filepath`, WebViewTraceCategory, Trace.messageType.info);
            }

            return;
        }

        const scriptCode = await File.fromPath(filepath).readText();

        this.addNamedWKUserScript(resourceName, scriptCode);
    }

    public removeAutoLoadJavaScriptFile(resourceName: string) {
        const fixedResourceName = this.fixLocalResourceName(resourceName);
        const href = `${this.interceptScheme}://${fixedResourceName}`;
        this.removeNamedWKUserScript(href);
    }

    [autoInjectJSBridgeProperty.setNative](enabled: boolean) {
        this.loadWKUserScripts(enabled);
    }

    [debugModeProperty.getDefault]() {
        return false;
    }

    [debugModeProperty.setNative](enabled) {
        const nativeView = this.nativeViewProtected;

        nativeView['inspectable'] = !!enabled;
    }

    [scrollBounceProperty.getDefault]() {
        const nativeView = this.nativeViewProtected;

        return nativeView.scrollView.bounces;
    }

    [scrollBounceProperty.setNative](enabled: boolean) {
        const nativeView = this.nativeViewProtected;

        nativeView.scrollView.bounces = !!enabled;
    }

    [viewPortProperty.setNative](value) {
        if (this.src) {
            this.injectViewPortMeta();
        }
    }

    [limitsNavigationsToAppBoundDomainsProperty.setNative](enabled: boolean) {
        this.limitsNavigationsToAppBoundDomains = enabled;
    }

    [limitsNavigationsToAppBoundDomainsProperty.getDefault]() {
        return false;
    }

    [scrollBarIndicatorVisibleProperty.getDefault](): boolean {
        return true;
    }
    [scrollBarIndicatorVisibleProperty.setNative](value: boolean) {
        this.updateScrollBarVisibility(value);
    }
    [customUserAgentProperty.setNative](value) {
        this.nativeViewProtected.customUserAgent = value;
    }
    protected updateScrollBarVisibility(value) {
        if (!this.nativeViewProtected) {
            return;
        }
        this.nativeViewProtected.scrollView.showsHorizontalScrollIndicator = value;
        this.nativeViewProtected.scrollView.showsVerticalScrollIndicator = value;
    }

    public _onOrientationChanged() {
        this.updateScrollBarVisibility(this.scrollBarIndicatorVisible);
    }

    [isEnabledProperty.setNative](enabled: boolean) {
        const nativeView = this.nativeViewProtected;

        nativeView.userInteractionEnabled = !!enabled;
        nativeView.scrollView.userInteractionEnabled = !!enabled;
    }
    [mediaPlaybackRequiresUserActionProperty.setNative](enabled: boolean) {
        this.nativeViewProtected.configuration.mediaTypesRequiringUserActionForPlayback = enabled ? WKAudiovisualMediaTypes.All : WKAudiovisualMediaTypes.None;
        // this.nativeViewProtected.configuration.setValueForKey(enabled ? WKAudiovisualMediaTypes.All : WKAudiovisualMediaTypes.None, 'mediaTypesRequiringUserActionForPlayback');
    }
    [allowsInlineMediaPlaybackProperty.setNative](enabled: boolean) {
        // this.nativeViewProtected.configuration.setValueForKey(enabled, 'allowsInlineMediaPlayback');
        this.nativeViewProtected.configuration.allowsInlineMediaPlayback = enabled;
    }

    /**
     * iOS11+
     *
     * Sets up loading WKUserScripts
     *
     * @param autoInjectJSBridge If true viewport-code, bridge-code and named scripts will be loaded, if false only viewport-code
     */
    protected loadWKUserScripts(autoInjectJSBridge = this.autoInjectJSBridge) {
        if (!this.wkUserScriptViewPortCode) {
            this.wkUserScriptViewPortCode = this.makeWKUserScriptPromise(this.generateViewPortCode());
        }

        this.wkUserContentController.removeAllUserScripts();

        this.addUserScriptFromPromise(this.wkUserScriptViewPortCode);
        if (!autoInjectJSBridge) {
            return;
        }

        if (!this.wkUserScriptInjectWebViewBridge) {
            this.wkUserScriptInjectWebViewBridge = this.createWkUserScript(webViewBridge);
        }

        this.addUserScript(this.wkUserScriptInjectWebViewBridge);
        for (const { wkUserScript } of this.wkNamedUserScripts) {
            this.addUserScript(wkUserScript);
        }
    }

    /**
     * iOS11+
     *
     * Remove a named WKUserScript
     */
    protected removeNamedWKUserScript(resourceName: string) {
        const idx = this.wkNamedUserScripts.findIndex((val) => val.resourceName === resourceName);
        if (idx === -1) {
            return;
        }

        this.wkNamedUserScripts.splice(idx, 1);

        this.loadWKUserScripts();
    }

    protected async resetViewPortCode() {
        this.wkUserScriptViewPortCode = null;

        const viewPortScriptCode = await this.generateViewPortCode();
        if (viewPortScriptCode) {
            this.executeJavaScript(viewPortScriptCode);
            this.loadWKUserScripts();
        }
    }

    protected registerLocalResourceForNative(resourceName: string, filepath: string) {
        if (!this.wkCustomUrlSchemeHandler) {
            return;
        }

        this.wkCustomUrlSchemeHandler.registerLocalResourceForKeyFilepath(resourceName, filepath);
    }

    protected unregisterLocalResourceForNative(resourceName: string) {
        if (!this.wkCustomUrlSchemeHandler) {
            return;
        }

        this.wkCustomUrlSchemeHandler.unregisterLocalResourceForKey(resourceName);
    }

    protected getRegisteredLocalResourceFromNative(resourceName: string) {
        if (!this.wkCustomUrlSchemeHandler) {
            return null;
        }

        return this.wkCustomUrlSchemeHandler.getRegisteredLocalResourceForKey(resourceName);
    }

    protected async makeWKUserScriptPromise(scriptCodePromise: Promise<string | null>): Promise<WKUserScript | null> {
        const scriptCode = await scriptCodePromise;
        if (!scriptCode) {
            return null;
        }

        return this.createWkUserScript(scriptCode);
    }

    protected async addUserScriptFromPromise(userScriptPromise: Promise<WKUserScript | null>) {
        const userScript = await userScriptPromise;
        if (!userScript) {
            return;
        }

        return this.addUserScript(userScript);
    }

    protected addUserScript(userScript: WKUserScript | null) {
        if (!userScript) {
            return;
        }

        this.wkUserContentController.addUserScript(userScript);
    }

    /**
     * iOS11+
     *
     * Add/replace a named WKUserScript.
     * These scripts will be injected when a new document is loaded.
     */
    protected addNamedWKUserScript(resourceName: string, scriptCode: string) {
        if (!scriptCode) {
            return;
        }

        this.removeNamedWKUserScript(resourceName);

        const wkUserScript = this.createWkUserScript(scriptCode);

        this.wkNamedUserScripts.push({ resourceName, wkUserScript });

        this.addUserScript(wkUserScript);
    }

    /**
     * iOS11+
     *
     * Factory function for creating a WKUserScript instance.
     */
    protected createWkUserScript(source: string) {
        return WKUserScript.alloc().initWithSourceInjectionTimeForMainFrameOnly(source, WKUserScriptInjectionTime.AtDocumentEnd, true);
    }
}

@NativeClass()
export class WKNavigationDelegateNotaImpl extends NSObject implements WKNavigationDelegate {
    public static ObjCProtocols = [WKNavigationDelegate];
    public static initWithOwner(owner: WeakRef<AWebView>): WKNavigationDelegateNotaImpl {
        const handler = WKNavigationDelegateNotaImpl.new() as WKNavigationDelegateNotaImpl;
        handler.owner = owner;

        return handler;
    }

    private owner: WeakRef<AWebView>;

    public webViewDecidePolicyForNavigationActionDecisionHandler(webView: WKWebView, navigationAction: WKNavigationAction, decisionHandler: (policy: WKNavigationActionPolicy) => void): void {
        const owner = this.owner.get();
        if (!owner) {
            decisionHandler(WKNavigationActionPolicy.Cancel);

            return;
        }

        const request = navigationAction.request;
        const httpMethod = request.HTTPMethod;
        const url = request.URL && request.URL.absoluteString;

        if (Trace.isEnabled()) {
            Trace.write(`webViewDecidePolicyForNavigationActionDecisionHandler: "${url}"`, WebViewTraceCategory, Trace.messageType.info);
        }
        if (!url) {
            return;
        }

        let navType: NavigationType = 'other';

        switch (navigationAction.navigationType) {
            case WKNavigationType.LinkActivated: {
                navType = 'linkClicked';
                break;
            }
            case WKNavigationType.FormSubmitted: {
                navType = 'formSubmitted';
                break;
            }
            case WKNavigationType.BackForward: {
                navType = 'backForward';
                break;
            }
            case WKNavigationType.Reload: {
                navType = 'reload';
                break;
            }
            case WKNavigationType.FormResubmitted: {
                navType = 'formResubmitted';
                break;
            }
            default: {
                navType = 'other';
                break;
            }
        }

        const shouldOverrideUrlLoading = owner._onShouldOverrideUrlLoading(url, httpMethod, navType);
        if (shouldOverrideUrlLoading === true) {
            if (Trace.isEnabled()) {
                Trace.write(
                    `WKNavigationDelegateClass.webViewDecidePolicyForNavigationActionDecisionHandler("${url}", "${navigationAction.navigationType}") -> method:${httpMethod} "${navType}" -> cancel`,
                    WebViewTraceCategory,
                    Trace.messageType.info
                );
                decisionHandler(WKNavigationActionPolicy.Cancel);
            }
            return;
        }
        decisionHandler(WKNavigationActionPolicy.Allow);

        if (Trace.isEnabled()) {
            Trace.write(
                `WKNavigationDelegateClass.webViewDecidePolicyForNavigationActionDecisionHandler("${url}", "${navigationAction.navigationType}") -> method:${httpMethod} "${navType}"`,
                WebViewTraceCategory,
                Trace.messageType.info
            );
        }
        owner._onLoadStarted(url, navType);
    }

    public webViewDidStartProvisionalNavigation(webView: WKWebView, navigation: WKNavigation): void {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        if (Trace.isEnabled()) {
            Trace.write(`WKNavigationDelegateClass.webViewDidStartProvisionalNavigation("${webView.URL}")`, WebViewTraceCategory, Trace.messageType.info);
        }
    }

    public webViewDidFinishNavigation(webView: WKWebView, navigation: WKNavigation): void {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        if (Trace.isEnabled()) {
            Trace.write(`WKNavigationDelegateClass.webViewDidFinishNavigation("${webView.URL}")`, WebViewTraceCategory, Trace.messageType.info);
        }
        let src = owner.src;
        if (webView.URL) {
            src = webView.URL.absoluteString;
        }
        owner._onLoadFinished(src);
    }

    public webViewDidFailNavigationWithError(webView: WKWebView, navigation: WKNavigation, error: NSError): void {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        let src = owner.src;
        if (webView.URL) {
            src = webView.URL.absoluteString;
        }
        if (Trace.isEnabled()) {
            Trace.write(`WKNavigationDelegateClass.webViewDidFailNavigationWithError("${error.localizedDescription}")`, WebViewTraceCategory, Trace.messageType.info);
        }
        owner._onLoadFinished(src, error.localizedDescription);
    }

    public webViewDidFailProvisionalNavigationWithError(webView: WKWebView, navigation: WKNavigation, error: NSError): void {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        let src = owner.src;
        if (webView.URL && webView.URL.absoluteString) {
            src = webView.URL.absoluteString;
        }

        if (Trace.isEnabled()) {
            Trace.write(`WKNavigationDelegateClass.webViewDidFailProvisionalNavigationWithError(${error.localizedDescription}`, WebViewTraceCategory, Trace.messageType.info);
        }
        owner._onLoadFinished(src, error.localizedDescription);
    }
}

@NativeClass()
export class WKScriptMessageHandlerNotaImpl extends NSObject implements WKScriptMessageHandler {
    public static ObjCProtocols = [WKScriptMessageHandler];

    private owner: WeakRef<WebViewExtBase>;

    public static initWithOwner(owner: WeakRef<WebViewExtBase>): WKScriptMessageHandlerNotaImpl {
        const delegate = WKScriptMessageHandlerNotaImpl.new() as WKScriptMessageHandlerNotaImpl;
        delegate.owner = owner;

        return delegate;
    }

    public userContentControllerDidReceiveScriptMessage(userContentController: WKUserContentController, webViewMessage: WKScriptMessage) {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        try {
            const message = JSON.parse(webViewMessage.body as string);

            try {
                owner.onWebViewEvent(message.eventName, JSON.parse(message.data));
            } catch (err) {
                owner.writeTrace(`userContentControllerDidReceiveScriptMessage(${userContentController}, ${webViewMessage}) - couldn't parse data: ${message.data}`, Trace.messageType.error);
                owner.onWebViewEvent(message.eventName, message.data);
            }
        } catch (err) {
            if (Trace.isEnabled()) {
                Trace.write(
                    `userContentControllerDidReceiveScriptMessage(${userContentController}, ${webViewMessage}) - bad message: ${webViewMessage.body}`,
                    WebViewTraceCategory,
                    Trace.messageType.error
                );
            }
        }
    }
}

@NativeClass()
export class WKUIDelegateNotaImpl extends NSObject implements WKUIDelegate {
    public static ObjCProtocols = [WKUIDelegate];
    public owner: WeakRef<AWebView>;

    public static initWithOwner(owner: WeakRef<AWebView>): WKUIDelegateNotaImpl {
        const delegate = WKUIDelegateNotaImpl.new() as WKUIDelegateNotaImpl;
        delegate.owner = owner;

        return delegate;
    }

    /**
     * Handle alerts from the webview
     */
    public webViewRunJavaScriptAlertPanelWithMessageInitiatedByFrameCompletionHandler(webView: WKWebView, message: string, frame: WKFrameInfo, completionHandler: () => void): void {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        let gotResponse = false;
        owner._webAlert(message, () => {
            if (!gotResponse) {
                completionHandler();
            }

            gotResponse = true;
        });
    }

    /**
     * Handle confirm dialogs from the webview
     */
    public webViewRunJavaScriptConfirmPanelWithMessageInitiatedByFrameCompletionHandler(
        webView: WKWebView,
        message: string,
        frame: WKFrameInfo,
        completionHandler: (confirmed: boolean) => void
    ): void {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        let gotResponse = false;
        owner._webConfirm(message, (confirmed: boolean) => {
            if (!gotResponse) {
                completionHandler(confirmed);
            }

            gotResponse = true;
        });
    }

    /**
     * Handle prompt dialogs from the webview
     */
    public webViewRunJavaScriptTextInputPanelWithPromptDefaultTextInitiatedByFrameCompletionHandler(
        webView: WKWebView,
        message: string,
        defaultText: string,
        frame: WKFrameInfo,
        completionHandler: (response: string) => void
    ): void {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        let gotResponse = false;
        owner._webPrompt(message, defaultText, (response: string) => {
            if (!gotResponse) {
                completionHandler(response);
            }

            gotResponse = true;
        });
    }

    webViewCreateWebViewWithConfigurationForNavigationActionWindowFeatures(
        webView: WKWebView,
        configuration: WKWebViewConfiguration,
        navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ): WKWebView {
        const owner = this.owner.get();

        // Handle popup window requests (window.open() or target="_blank")
        if (navigationAction && navigationAction.request && navigationAction.request.URL && (!navigationAction.targetFrame || !navigationAction.targetFrame.mainFrame)) {
            const supportPopups = owner?.supportPopups ?? true;

            if (supportPopups) {
                try {
                    const popupConfig = configuration;
                    // iOS shares WKUserContentController between parent and popup webviews by default.
                    // Create a fresh controller to prevent user scripts from being injected into popups.
                    popupConfig.userContentController = WKUserContentController.alloc().init();

                    let popupWebView = WKWebView.alloc().initWithFrameConfiguration(CGRectZero, popupConfig);

                    if (webView.customUserAgent) {
                        popupWebView.customUserAgent = webView.customUserAgent;
                    }

                    let currentVC = UIApplication.sharedApplication.keyWindow.rootViewController;
                    while (currentVC && currentVC.presentedViewController) {
                        currentVC = currentVC.presentedViewController;
                    }

                    if (currentVC) {
                        const popupVC = UIViewController.alloc().init();
                        popupVC.view.backgroundColor = UIColor.whiteColor;

                        popupVC.view.addSubview(popupWebView);
                        popupWebView.translatesAutoresizingMaskIntoConstraints = false;

                        NSLayoutConstraint.activateConstraints([
                            popupWebView.topAnchor.constraintEqualToAnchor(popupVC.view.safeAreaLayoutGuide.topAnchor),
                            popupWebView.bottomAnchor.constraintEqualToAnchor(popupVC.view.bottomAnchor),
                            popupWebView.leadingAnchor.constraintEqualToAnchor(popupVC.view.leadingAnchor),
                            popupWebView.trailingAnchor.constraintEqualToAnchor(popupVC.view.trailingAnchor)
                        ]);

                        let navController = UINavigationController.alloc().initWithRootViewController(popupVC);

                        // Create close button handler
                        const CloseHandler = (NSObject as any).extend(
                            {
                                'onCloseButtonTap:'(sender) {
                                    navController.dismissViewControllerAnimatedCompletion(true, null);
                                }
                            },
                            {
                                name: 'CloseHandler',
                                exposedMethods: {
                                    'onCloseButtonTap:': {
                                        returns: interop.types.void,
                                        params: [interop.types.id]
                                    }
                                }
                            }
                        );

                        const handler = CloseHandler.alloc().init();
                        const closeButton = UIBarButtonItem.alloc().initWithBarButtonSystemItemTargetAction(UIBarButtonSystemItem.Done, handler, 'onCloseButtonTap:');
                        popupVC.navigationItem.leftBarButtonItem = closeButton;

                        let simpleUIDelegate = (NSObject as any)
                            .extend(
                                {
                                    webViewDidClose(webView) {
                                        navController.dismissViewControllerAnimatedCompletion(true, function () {
                                            popupWebView = null;
                                            navController = null;
                                            simpleUIDelegate = null;
                                        });
                                    }
                                },
                                {
                                    protocols: [WKUIDelegate]
                                }
                            )
                            .alloc()
                            .init();

                        popupWebView.UIDelegate = simpleUIDelegate;

                        currentVC.presentViewControllerAnimatedCompletion(navController, true, null);
                        return popupWebView;
                    }
                } catch (error) {
                    console.error('[ui-webview] Error creating popup:', error);
                }
            }

            // Load in main WebView (fallback or when popups disabled)
            webView.loadRequest(navigationAction.request);
        }

        return null;
    }
    async webViewRequestDeviceOrientationAndMotionPermissionForOriginInitiatedByFrameDecisionHandler?(
        webView: WKWebView,
        origin: WKSecurityOrigin,
        frame: WKFrameInfo,
        decisionHandler: (p1: WKPermissionDecision) => void
    ) {
        const owner = this.owner.get();
        if (!owner) {
            decisionHandler(WKPermissionDecision.Deny);
            return;
        }
        try {
            await owner._onRequestPermissions(['motion']);
            decisionHandler(WKPermissionDecision.Grant);
        } catch (error) {
            decisionHandler(WKPermissionDecision.Deny);
            owner.notify({ eventName: 'error', error });
        }
    }

    async webViewRequestMediaCapturePermissionForOriginInitiatedByFrameTypeDecisionHandler?(
        webView: WKWebView,
        origin: WKSecurityOrigin,
        frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: (p1: WKPermissionDecision) => void
    ) {
        const owner = this.owner.get();
        if (!owner) {
            decisionHandler(WKPermissionDecision.Deny);
            return;
        }
        try {
            const permissions = [];
            switch (type) {
                case WKMediaCaptureType.Camera:
                    permissions.push('camera');
                    break;
                case WKMediaCaptureType.Microphone:
                    permissions.push('microphone');
                    break;
                case WKMediaCaptureType.CameraAndMicrophone:
                    permissions.push('camera', 'microphone');
                    break;
            }
            await owner._onRequestPermissions(permissions);
            decisionHandler(WKPermissionDecision.Grant);
        } catch (error) {
            decisionHandler(WKPermissionDecision.Deny);
            owner.notify({ eventName: 'error', error });
        }
    }
}
