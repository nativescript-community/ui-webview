import { NgModule } from '@angular/core';
import { NativeScriptCommonModule, isKnownView, registerElement } from '@nativescript/angular';
import { AWebView } from '@nativescript-community/ui-webview';

const webviewElementName = 'AWebView';

if (!isKnownView(webviewElementName)) {
    registerElement(webviewElementName, () => AWebView);
}

@NgModule({
    imports: [NativeScriptCommonModule]
})
export class AWebViewModule {}
