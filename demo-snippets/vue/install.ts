import Vue from 'nativescript-vue';
import WebView from '@nativescript-community/ui-webview/vue';

import BasicExample from './BasicExample.vue';

export function installPlugin() {
    Vue.use(WebView);
}

export const demos = [{ name: 'Basic Example', path: 'basic', component: BasicExample }];
