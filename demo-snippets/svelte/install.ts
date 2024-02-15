import BasicExample from './BasicExample.svelte';
import installWebRTC from '@nativescript-community/ui-webview-rtc';

export function installPlugin() {
    installWebRTC();
}

export const demos = [{ name: 'Basic Example', path: 'basic', component: BasicExample }];
