import Vue from 'nativescript-vue';
import WebView from '@nativescript-community/ui-webview/vue';
import {Trace} from '@nativescript/core';

import BasicExample from './BasicExample.vue';

export function installPlugin() {
    Trace.addCategories(WebViewTraceCategory);
    Trace.enable();
    Vue.use(WebView);
}

export const demos = [{ name: 'Basic Example', path: 'basic', component: BasicExample }];
