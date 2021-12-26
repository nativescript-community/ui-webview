import { NSWebViewBridgeBase } from './bridge.common';

interface WKWebViewMessageHandler {
    postMessage(message: string): void;
}
// if (!Object.keys) {
//     Object.keys = (function () {
//         'use strict';
//         const hasOwnProperty = Object.prototype.hasOwnProperty;
//         const hasDontEnumBug = !{ toString: null }.propertyIsEnumerable('toString');
//         const dontEnums = [
//             'toString',
//             'toLocaleString',
//             'valueOf',
//             'hasOwnProperty',
//             'isPrototypeOf',
//             'propertyIsEnumerable',
//             'constructor',
//         ];
//         const dontEnumsLength = dontEnums.length;

//         return function (obj: any) {
//             if (typeof obj !== 'function' && (typeof obj !== 'object' || obj === null)) {
//                 throw new TypeError('Object.keys called on non-object');
//             }

//             const result = new Array<any>();

//             for (const prop in obj) {
//                 if (hasOwnProperty.call(obj, prop)) {
//                     result.push(prop);
//                 }
//             }

//             if (hasDontEnumBug) {
//                 for (let i = 0; i < dontEnumsLength; i++) {
//                     if (hasOwnProperty.call(obj, dontEnums[i])) {
//                         result.push(dontEnums[i]);
//                     }
//                 }
//             }

//             return result;
//         };
//     })();
// }

/**
 * With WKWebView it's assumed the there is a WKScriptMessage named nsBridge
 */
function getWkWebViewMessageHandler(): WKWebViewMessageHandler | void {
    const w = window as any;
    if (!w?.webkit?.messageHandlers?.nsBridge) {
        console.error("Cannot get the window.webkit.messageHandlers.nsBridge - we can't communicate with native-layer");

        return;
    }

    return w.webkit.messageHandlers.nsBridge;
}

// Forked from nativescript-webview-interface@1.4.2
class NSWebViewBridge extends NSWebViewBridgeBase {
    protected emitEvent(eventName: string, data: any) {
        const messageHandler = getWkWebViewMessageHandler();
        if (messageHandler) {
            messageHandler.postMessage(
                JSON.stringify({
                    eventName,
                    data,
                })
            );

            return;
        }

        console.error('NSWebViewBridge only supports WKWebView');
    }
}

const nsBridgeReadyEventName = 'ns-bridge-ready';

const w = window as any;
if (!w.nsWebViewBridge) {
    // Only create the NSWebViewBridge, if is doesn't already exist.
    w.nsWebViewBridge = new NSWebViewBridge();

    for (const eventName of [nsBridgeReadyEventName, 'ns-brige-ready']) {
        if (typeof CustomEvent !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent(eventName, {
                    detail: w.nsWebViewBridge,
                })
            );
        } else {
            window.dispatchEvent(new Event(eventName));
        }
    }
}
