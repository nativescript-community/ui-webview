import * as fs from '@nativescript/core/file-system';
import { AWebViewBase, IOSWebViewWrapper, NavigationType } from './webview-common';

export class UIScrollViewDelegateImpl extends NSObject implements UIScrollViewDelegate {
    public static ObjCProtocols = [UIScrollViewDelegate];
    private owner: WeakRef<AWebViewBase>;
    public static initWithOwner(owner: WeakRef<AWebViewBase>): UIScrollViewDelegateImpl {
        const delegate = UIScrollViewDelegateImpl.new() as UIScrollViewDelegateImpl;
        delegate.owner = owner;
        return delegate;
    }
    scrollViewDidScroll?(scrollView: UIScrollView) {
        const owner = this.owner.get();
        if (owner) {
            owner.notify({
                object: owner,
                eventName: AWebViewBase.scrollEvent,
                scrollOffset: scrollView.contentOffset.y,
            });
        }
    }
}
export class UIWebViewDelegateImpl extends NSObject implements UIWebViewDelegate {
    public static ObjCProtocols = [UIWebViewDelegate];

    private owner: WeakRef<AWebViewBase>;

    public static initWithOwner(owner: WeakRef<AWebViewBase>): UIWebViewDelegateImpl {
        const delegate = UIWebViewDelegateImpl.new() as UIWebViewDelegateImpl;
        delegate.owner = owner;
        return delegate;
    }

    public webViewShouldStartLoadWithRequestNavigationType(webView: UIWebView, request: NSURLRequest, navigationType: number) {
        const owner = this.owner.get();
        if (!owner) {
            return true;
        }

        if (!request.URL) {
            return true;
        }

        const httpMethod = request.HTTPMethod;

        let navType: NavigationType = 'other';

        switch (navigationType) {
            case UIWebViewNavigationType.LinkClicked: {
                navType = 'linkClicked';
                break;
            }
            case UIWebViewNavigationType.FormSubmitted: {
                navType = 'formSubmitted';
                break;
            }
            case UIWebViewNavigationType.BackForward: {
                navType = 'backForward';
                break;
            }
            case UIWebViewNavigationType.Reload: {
                navType = 'reload';
                break;
            }
            case UIWebViewNavigationType.FormResubmitted: {
                navType = 'formResubmitted';
                break;
            }
            default: {
                navType = 'other';
                break;
            }
        }

        const url = request.URL.absoluteString;
        owner.writeTrace(() => `UIWebViewDelegateClass.webViewShouldStartLoadWithRequestNavigationType("${url}", "${navigationType}")`);
        if (url.startsWith('js2ios:')) {
            owner.writeTrace(() => `UIWebViewDelegateClass.webViewShouldStartLoadWithRequestNavigationType("${url}", "${navigationType}") -> onUIWebViewEvent`);
            owner.onUIWebViewEvent(url);
            return false;
        }

        const shouldOverrideUrlLoading = owner._onShouldOverrideUrlLoading(url, httpMethod, navType);
        if (shouldOverrideUrlLoading === true) {
            owner.writeTrace(() => `UIWebViewDelegateClass.webViewShouldStartLoadWithRequestNavigationType("${url}", "${navigationType}") - cancel`);
            return false;
        }

        owner._onLoadStarted(url, navType);

        return true;
    }

    public uiWebViewJSNavigation = false;

    public webViewDidStartLoad(webView: UIWebView) {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        owner.writeTrace(() => `UIWebViewDelegateClass.webViewDidStartLoad("${webView.request.URL}")`);
    }

    public webViewDidFinishLoad(webView: UIWebView) {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        owner.writeTrace(() => `UIWebViewDelegateClass.webViewDidFinishLoad("${webView.request.URL}")`);
        let src = owner.src;
        if (webView.request && webView.request.URL) {
            src = webView.request.URL.absoluteString;
        }
        owner._onLoadFinished(src).catch(() => void 0);
    }

    public webViewDidFailLoadWithError(webView: UIWebView, error: NSError) {
        const owner = this.owner.get();
        if (!owner) {
            return;
        }

        let src = owner.src;
        if (webView.request && webView.request.URL) {
            src = webView.request.URL.absoluteString;
        }

        owner.writeTrace(() => `UIWebViewDelegateClass.webViewDidFailLoadWithError("${error.localizedDescription}") url: "${src}"`);
        owner._onLoadFinished(src, error.localizedDescription).catch(() => void 0);
    }
}

let registeredCustomNSURLProtocol = false;
export class UIWebViewWrapper implements IOSWebViewWrapper {
    public owner: WeakRef<AWebViewBase>;
    public get ios(): UIWebView | void {
        const owner = this.owner.get();
        return owner && owner.ios;
    }

    protected uiWebViewDelegate: UIWebViewDelegateImpl;
    protected uiScrollViewDelegate: UIScrollViewDelegateImpl;

    public readonly shouldInjectWebViewBridge = true;

    public get autoInjectJSBridge() {
        const owner = this.owner.get();
        return owner && owner.autoInjectJSBridge;
    }

    constructor(owner: AWebViewBase) {
        this.owner = new WeakRef(owner);
    }

    public createNativeView() {
        if (!registeredCustomNSURLProtocol) {
            NSURLProtocol.registerClass(CustomNSURLProtocol as any);
            registeredCustomNSURLProtocol = true;
        }

        const uiWebView = UIWebView.new();
        uiWebView.scalesPageToFit = false;

        return uiWebView;
    }

    public initNativeView() {
        this.uiWebViewDelegate = UIWebViewDelegateImpl.initWithOwner(this.owner);
        this.uiScrollViewDelegate = UIScrollViewDelegateImpl.initWithOwner(this.owner);
    }

    public disposeNativeView() {
        this.uiWebViewDelegate = null;
        this.uiScrollViewDelegate = null;
    }

    public setScrollEnabled(value: boolean) {
        const ios = this.ios;
        if (!ios) {
            return;
        }
        ios.scrollView.scrollEnabled = value;
    }

    public onLoaded() {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.delegate = this.uiWebViewDelegate;
        ios.scrollView.delegate = this.uiScrollViewDelegate;
    }

    public onUnloaded() {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.delegate = null;
        ios.scrollView.delegate = null;
    }

    public stopLoading() {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.stopLoading();
    }

    public loadUrl(src: string) {
        const owner = this.owner.get();
        const ios = this.ios;
        if (!owner || !ios) {
            return;
        }

        if (src.startsWith(owner.interceptScheme)) {
            const tmpSrc = owner.getRegisteredLocalResource(src);
            if (!tmpSrc) {
                owner._onLoadFinished(src, 'x-local not found');
                return;
            }

            src = tmpSrc;
        }

        const nsURL = NSURL.URLWithString(src);
        const nsRequestWithUrl = NSURLRequest.requestWithURL(nsURL);
        owner.writeTrace(() => `UIWebViewWrapper.loadUrl("${src}") -> this.ios.loadRequest("${nsRequestWithUrl}"`);
        ios.loadRequest(nsRequestWithUrl);
    }

    public registerLocalResourceForNative(resourceName: string, filepath: string) {
        CustomNSURLProtocol.registerLocalResourceForKeyFilepath(resourceName, filepath);
    }

    public unregisterLocalResourceForNative(resourceName: string) {
        CustomNSURLProtocol.unregisterLocalResourceForKey(resourceName);
    }

    public getRegisteredLocalResourceFromNative(resourceName: string) {
        return CustomNSURLProtocol.getRegisteredLocalResourceForKey(resourceName);
    }

    public loadData(content: string) {
        const owner = this.owner.get();
        const ios = this.ios;
        if (!owner || !ios) {
            return;
        }

        const baseUrl = `file:///${fs.knownFolders.currentApp().path}/`;
        const nsBaseUrl = NSURL.URLWithString(baseUrl);

        owner.writeTrace(() => `UIWebViewWrapper.loadUrl(content) -> this.ios.loadHTMLStringBaseURL("${nsBaseUrl}")`);
        ios.loadHTMLStringBaseURL(content, nsBaseUrl);
    }

    public get canGoBack(): boolean {
        const ios = this.ios;
        return ios && !!ios.canGoBack;
    }

    public get canGoForward(): boolean {
        const ios = this.ios;
        return ios && !!ios.canGoForward;
    }

    public goBack() {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.goBack();
    }

    public goForward() {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.goForward();
    }

    public reload() {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.reload();
    }

    public executeJavaScript(scriptCode: string): Promise<string> {
        const ios = this.ios;
        if (!ios) {
            return Promise.reject(new Error('WebView is missing'));
        }

        try {
            const result = ios.stringByEvaluatingJavaScriptFromString(scriptCode);
            return Promise.resolve(result);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    public autoLoadStyleSheetFile() {
        throw new Error('autoLoadStyleSheetFile could not be called on UIWebView');
    }

    public removeAutoLoadStyleSheetFile() {
        throw new Error('removeAutoLoadStyleSheetFile could not be called on UIWebView');
    }

    public autoLoadJavaScriptFile(): Promise<void> {
        throw new Error('removeAutoLoadJavaScriptFile could not be called on UIWebView');
    }

    public removeAutoLoadJavaScriptFile() {
        throw new Error('removeAutoLoadJavaScriptFile could not be called on UIWebView');
    }

    public enableAutoInject(enable: boolean) {
        // Dummy
    }

    public set scrollBounce(enable: boolean) {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.scrollView.bounces = !!enable;
    }

    public get scrollBounce() {
        const ios = this.ios;
        if (!ios) {
            return false;
        }

        return !!ios.scrollView.bounces;
    }

    public set scalesPageToFit(enable: boolean) {
        const ios = this.ios;
        if (!ios) {
            return;
        }

        ios.scalesPageToFit = !!enable;
    }

    public get scalesPageToFit() {
        const ios = this.ios;
        if (!ios) {
            return false;
        }

        return !!ios.scalesPageToFit;
    }

    public async resetViewPortCode() {
        // Ignore
    }
}
