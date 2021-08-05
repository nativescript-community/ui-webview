import { NgModule } from '@angular/core';
import { NativeScriptCommonModule, isKnownView, registerElement } from '@nativescript/angular';

const webviewElementName = 'WebViewExt';

if (!isKnownView(webviewElementName)) {
    registerElement(webviewElementName, () => require('@nativescript-community/ui-webview').WebViewExt);
}

@NgModule()
export class WebViewExtModule {
    imports: [NativeScriptCommonModule];
}
