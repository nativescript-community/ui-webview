import Vue from 'nativescript-vue';

const webviewElementName = 'AWebView';
Vue.registerElement(webviewElementName, () => require("'@nativescript-community/ui-webview").AWebView);
