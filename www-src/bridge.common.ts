type WebEventListener = (data: any) => boolean;

interface EventListenerMap {
    [eventName: string]: WebEventListener[];
}

if (!Object.entries) {
    Object.entries = function (this: null, obj: any) {
        const ownProps = Object.keys(obj);
        let i = ownProps.length;
        const resArray = new Array(i); // preallocate the Array

        while (i--) {
            resArray[i] = [ownProps[i], obj[ownProps[i]]];
        }

        return resArray;
    };
}

// Forked from nativescript-webview-interface@1.4.2
export abstract class NSWebViewBridgeBase {
    /**
     * Mapping of native eventName and its handler in webView
     */
    private eventListenerMap: EventListenerMap = {};

    /**
     * Handles events/commands emitted by android/ios. This function is called from nativescript.
     */
    public onNativeEvent(eventName: string, data: any) {
        const events = this.eventListenerMap[eventName];
        if (!events?.length) {
            return;
        }

        for (const listener of events) {
            const res = listener && listener(data);
            // if any handler return false, not executing any further handlers for that event.
            if (res === false) {
                break;
            }
        }
    }

    /**
     * Calls native android function to emit event and payload to android
     */
    protected abstract emitEvent(eventName: any, data: any): any;

    /**
     * Add an event listener for event from native-layer
     */
    public on(eventName: string, callback: WebEventListener) {
        if (!callback) {
            return;
        }

        if (!this.eventListenerMap[eventName]) {
            this.eventListenerMap[eventName] = [];
        }

        this.eventListenerMap[eventName].push(callback);
    }

    /**
     * Add an event listener for event from native-layer
     */
    public addEventListener(eventName: string, callback: WebEventListener) {
        this.on(eventName, callback);
    }

    /**
     * Remove an event listener for event from native-layer.
     * If callback is undefined all events for the eventName will be removed.
     */
    public off(eventName?: string, callback?: WebEventListener) {
        if (!eventName) {
            this.eventListenerMap = {};

            return;
        }

        if (!this.eventListenerMap[eventName]) {
            return;
        }

        if (!callback) {
            delete this.eventListenerMap[eventName];

            return;
        }

        this.eventListenerMap[eventName] = this.eventListenerMap[eventName].filter((oldCallback) => oldCallback !== callback);

        if (this.eventListenerMap[eventName].length === 0) {
            delete this.eventListenerMap[eventName];
        }
    }

    /**
     * Remove an event listener for event from native-layer.
     * If callback is undefined all events for the eventName will be removed.
     */
    public removeEventListener(eventName?: string, callback?: WebEventListener) {
        return this.off(eventName, callback);
    }

    /**
     * Emit an event to the native-layer
     */
    public emit(eventName: string, data: any) {
        this.emitEvent(eventName, JSON.stringify(data));
    }

    /**
     * Injects a javascript file.
     * This is usually called from WebViewExt.loadJavaScriptFiles(...)
     */
    public injectJavaScriptFile(href: string): Promise<void> {
        const elId = this.elementIdFromHref(href);

        if (document.getElementById(elId)) {
            console.log(`${elId} already exists`);

            return Promise.resolve();
        }

        return new Promise<void>((resolve, reject) => {
            const scriptElement = document.createElement('script');
            scriptElement.async = true;
            scriptElement.setAttribute('id', elId);
            scriptElement.addEventListener('error', (error) => {
                console.error(`Failed to load ${href} - error: ${error}`);
                reject(this.serializeError(error));

                if (scriptElement.parentElement) {
                    scriptElement.parentElement.removeChild(scriptElement);
                }
            });
            scriptElement.addEventListener('load', function () {
                console.info(`Loaded ${href}`);
                window.requestAnimationFrame(() => {
                    resolve();
                });

                if (scriptElement.parentElement) {
                    scriptElement.parentElement.removeChild(scriptElement);
                }
            });
            scriptElement.src = href;

            document.body.appendChild(scriptElement);
        });
    }

    /**
     * Used to inject javascript-files on iOS<11 where we cannot support x-local
     */
    public injectJavaScript(elId: string, scriptCode: string): Promise<void> {
        if (document.getElementById(elId)) {
            console.log(`${elId} already exists`);

            return Promise.resolve();
        }

        return new Promise<void>((resolve, reject) => {
            const scriptElement = document.createElement('script');
            scriptElement.setAttribute('id', elId);
            scriptElement.addEventListener('error', function (error) {
                console.error(`Failed to inject javascript- error: ${error}`);
                reject(error);

                if (scriptElement.parentElement) {
                    scriptElement.parentElement.removeChild(scriptElement);
                }
            });
            scriptElement.text = scriptCode;

            document.body.appendChild(scriptElement);

            window.requestAnimationFrame(() => resolve());
        });
    }

    /**
     * Injects a StyleSheet file.
     * This is usually called from WebViewExt.loadStyleSheetFiles(...)
     */
    public injectStyleSheetFile(href: string, insertBefore?: boolean): Promise<void> {
        const elId = this.elementIdFromHref(href);

        if (document.getElementById(elId)) {
            console.log(`${elId} already exists`);

            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const linkElement = document.createElement('link');
            linkElement.addEventListener('error', (error) => {
                console.error(`Failed to load ${href} - error: ${error}`);
                reject(error);

                if (linkElement.parentElement) {
                    linkElement.parentElement.removeChild(linkElement);
                }
            });
            linkElement.addEventListener('load', () => {
                console.info(`Loaded ${href}`);
                window.requestAnimationFrame(() => {
                    resolve();
                });
            });
            linkElement.setAttribute('id', elId);
            linkElement.setAttribute('rel', 'stylesheet');
            linkElement.setAttribute('type', 'text/css');
            linkElement.setAttribute('href', href);
            if (document.head) {
                if (insertBefore && document.head.childElementCount > 0) {
                    document.head.insertBefore(linkElement, document.head.firstElementChild);
                } else {
                    document.head.appendChild(linkElement);
                }
            }
        });
    }

    /**
     * Inject stylesheets into the page without using x-local. This is needed for iOS<11
     */
    public injectStyleSheet(elId: string, stylesheet: string, insertBefore?: boolean): Promise<void> {
        if (document.getElementById(elId)) {
            console.log(`${elId} already exists`);

            return Promise.resolve();
        }

        return new Promise<void>((resolve, reject) => {
            const styleElement = document.createElement('style');
            styleElement.addEventListener('error', reject);
            styleElement.textContent = stylesheet;
            styleElement.setAttribute('id', elId);

            const parentElement = document.head ?? document.body;
            if (parentElement) {
                if (insertBefore && parentElement.childElementCount > 0) {
                    document.head.insertBefore(styleElement, parentElement.firstElementChild);
                } else {
                    document.head.appendChild(styleElement);
                }
            } else {
                reject(new Error("Couldn't find parent element"));

                return;
            }

            resolve();
        });
    }

    /**
     * Helper function for WebViewExt.executePromise(scriptCode).
     */
    public async executePromise(promise: Promise<any>, eventName: string) {
        try {
            const data = await promise;
            this.emit(eventName, {
                data,
            });
        } catch (err) {
            this.emitError(err, eventName);
        }
    }

    /**
     * Emit an error to the native-layer.
     * This is used to workaround the problem of serializing an Error-object.
     * If err is an Error the message and stack will be extracted and emitted to the native-layer.
     */
    public emitError(err: any, eventName = 'web-error') {
        if (typeof err === 'object' && err?.message) {
            // Error objects cannot be serialized
            this.emit(eventName, {
                err: this.serializeError(err),
            });
        } else {
            this.emit(eventName, {
                err,
            });
        }
    }

    private elementIdFromHref(href: string) {
        return href.replace(/^[:]*:\/\//, '').replace(/[^a-z0-9]/g, '');
    }

    /**
     * Error objects cannot be serialized properly.
     */
    private serializeError(error: any) {
        const { name, message, stack } = error;
        const res = {
            name,
            message,
            stack,
        };

        for (const [key, value] of Object.entries(error)) {
            if (value instanceof HTMLElement) {
                continue;
            }

            if (!(key in res)) {
                //@ts-ignore
                res[key] = value;
            }
        }

        return res;
    }
}
