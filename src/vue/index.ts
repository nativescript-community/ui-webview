import Vue from 'nativescript-vue';

const webviewElementName = 'AWebView';
Vue.registerElement(webviewElementName, () => require('../webview').AWebView);
