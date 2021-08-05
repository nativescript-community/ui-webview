# NativeScript WebView RTC
[![npm downloads](https://img.shields.io/npm/dm/@nativescript-community/ui-webview-rtc.svg)](https://www.npmjs.com/package/@nativescript-community/ui-webview-rtc)
[![npm downloads](https://img.shields.io/npm/dt/@nativescript-community/ui-webview-rtc.svg)](https://www.npmjs.com/package/@nativescript-community/ui-webview-rtc)
[![npm](https://img.shields.io/npm/v/@nativescript-community/ui-webview-rtc.svg)](https://www.npmjs.com/package/@nativescript-community/ui-webview-rtc)

A NativeScript Plugin to add webRTC support to `@nativescript-community/ui-webview`

## Installation
Run the following command from the root of your project:

`tns plugin add @nativescript-community/ui-webview-rtc`

This command automatically installs the necessary files, as well as stores @nativescript-community/ui-webview-rtc as a dependency in your project's package.json file.

## Configuration

To install the plugin run 
```typescript
import install from '@nativescript-community/ui-webview-rtc';
install();
```

then simply use the `webRTC="true"` as a webview property
