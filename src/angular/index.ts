import { NgModule } from '@angular/core';
import { isKnownView, registerElement } from '@nativescript/angular';

const webviewElementName = 'AWebView';

if (!isKnownView(webviewElementName)) {
    registerElement(webviewElementName, () => require('../webview').AWebView);
}

@NgModule()
export default class WebViewModule {}
