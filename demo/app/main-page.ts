import { Button, EventData, Page } from '@nativescript/core';
import {
    AWebView,
    EnterFullscreenEventData,
    LoadEventData,
    LoadFinishedEventData,
    ShouldOverrideUrlLoadEventData,
} from '@nativescript-community/ui-webview';
import * as fastEqual from 'fast-deep-equal';

let webview: AWebView;
let page: Page;


// Event handler for Page 'loaded' event attached in main-page.xml
export function pageLoaded(args: EventData) {
    page = args.object as Page;
}

let gotMessageData: any = null;
export function webviewLoaded(args: LoadEventData) {
    webview = args.object;

    // if (global.isAndroid) {
    //     webview.src = 'http://10.0.2.2:8080';
    // } else {
    //     webview.src = 'http://localhost:8080';
    // }
    webview.src = "~/assets/test-data/html/javascript-calls.html";

    webview.on(AWebView.shouldOverrideUrlLoadingEvent, (args: ShouldOverrideUrlLoadEventData) => {
        console.log(`${args.httpMethod} ${args.url}`);
        if (args.url.includes('google.com')) {
            args.cancel = true;
        }
    });

    webview.on(AWebView.loadFinishedEvent, (args: LoadFinishedEventData) => {
        console.log(`WebViewExt.loadFinishedEvent: ${args.url}`);
        webview.loadStyleSheetFile('local-stylesheet.css', '~/assets/test-data/css/local-stylesheet.css', false);
    });

    webview.on('gotMessage', (msg) => {
        gotMessageData = msg.data;
        console.log(`webview.gotMessage: ${JSON.stringify(msg.data)} (${typeof msg})`);
    });
}

async function executeJavaScriptTest<T>(js: string, expected?: T): Promise<T> {
    try {
        const res = await webview.executeJavaScript<T>(js);
        console.log(`executeJavaScript '${js}' => ${JSON.stringify(res)} (${typeof res})`);
        const jsonRes = JSON.stringify(res);
        const expectedJson = JSON.stringify(expected);
        if (expected !== undefined && !fastEqual(expected, res)) {
            throw new Error(`Expected: ${expectedJson}. Got: ${jsonRes}`);
        }

        return res;
    } catch (err) {
        console.log(`executeJavaScript '${js}' => ERROR: ${err}`);
        throw err;
    }
}

export async function runTests() {
    try {
        console.time('runTests');

        await executeJavaScriptTest('console.log("test console from web view")');
        await executeJavaScriptTest('callFromNativeScript()');

        const expected = {
            huba: 'hop',
        };
        const gotJson = JSON.stringify(gotMessageData);

        if (fastEqual(expected, gotMessageData)) {
            console.log(`executeJavaScript via message 'callFromNativeScript()' => ${gotJson} (${typeof gotMessageData})`);
        } else {
            throw new Error(`Expected: ${JSON.stringify(expected)}. Got: ${gotJson}`);
        }

        await executeJavaScriptTest('getNumber()', 42);
        await executeJavaScriptTest('getNumberFloat()', 3.14);
        await executeJavaScriptTest('getBoolean()', false);
        await executeJavaScriptTest('getString()', 'string result from webview JS function');
        await executeJavaScriptTest('getArray()', [1.5, true, 'hello']);
        await executeJavaScriptTest('getObject()', { name: 'object-test', prop: 'test', values: [42, 3.14] });

        console.timeEnd('runTests');
        } catch(err) {
        console.error(err);
        }
}

let closeFullscreen: () => void;
export function enterFullscreen(eventData: EnterFullscreenEventData) {
    page.actionBarHidden = true;

    closeFullscreen = eventData.exitFullscreen;

    const button = page.getViewById('test_button');
    if (button) {
        button.visibility = 'collapse';
    }
}

export function exitFullscreen() {
    page.actionBarHidden = false;
    const button = page.getViewById('test_button');
    if (button) {
        button.visibility = 'visible';
    }

    closeFullscreen = null;
}
