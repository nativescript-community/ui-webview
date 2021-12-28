import { NgModule } from '@angular/core';
import { NativeScriptCommonModule, isKnownView, registerElement } from '@nativescript/angular';

const webviewElementName = 'AWebView';

if (!isKnownView(webviewElementName)) {
    registerElement(webviewElementName, () => require('@nativescript-community/ui-webview').AWebView);
}

@NgModule()
export class WebViewExtModule {
    imports: [NativeScriptCommonModule];
}
