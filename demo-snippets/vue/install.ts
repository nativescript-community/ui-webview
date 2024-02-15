import Vue from 'nativescript-vue';
import WebView from '@nativescript-community/ui-webview/vue';
import {WebViewTraceCategory} from '@nativescript-community/ui-webview';
import {Trace} from '@nativescript/core';
import installWebRTC from '@nativescript-community/ui-webview-rtc';

import BasicExample from './BasicExample.vue';

export function installPlugin() {
    Trace.addCategories(WebViewTraceCategory);
    Trace.enable();
    installWebRTC();
    Vue.use(WebView);
}

export const demos = [{ name: 'Basic Example', path: 'basic', component: BasicExample }];
