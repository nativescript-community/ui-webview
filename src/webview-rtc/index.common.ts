import { AWebView } from '@nativescript-community/ui-webview';
import { Property, booleanConverter } from '@nativescript/core';

export const webRTCProperty = new Property<AWebView, boolean>({
    name: 'webRTC',
    defaultValue: false,
    valueConverter: booleanConverter
});

webRTCProperty.register(AWebView);
