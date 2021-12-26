const fs = require('fs');
const Terser = require('terser');
const { promisify } = require('util');

const fsWriteFile = promisify(fs.writeFile);
const fsReadFile = promisify(fs.readFile);

async function nativescriptWebviewBridgeLoader(platform: 'ios' | 'android') {
    let template = await fsReadFile(`./www-src/bridge-loader.${platform}.ts.tmpl`, 'UTF-8');

    const values = {
        // fetchPolyfill: await fsReadFile('./node_modules/whatwg-fetch/dist/fetch.umd.js', 'UTF-8'),
        // promisePolyfill: await fsReadFile('./www-src/node_modules/promise-polyfill/dist/polyfill.js', 'UTF-8'),
        webViewBridge: await fsReadFile(`./build/bridge.${platform}.js`, 'UTF-8'),
        metadataViewPort: await fsReadFile('./build/metadata-view-port.js', 'UTF-8'),
    };

    for (const [name, value] of Object.entries(values)) {
        const terserRes = await Terser.minify(value, {
            ecma: 2019,
            module: false,
            toplevel: false,
            keep_classnames: false,
            keep_fnames: false,
            compress: {
                passes: 2,
                drop_console: true
            },
            mangle: {
                toplevel: true,
                properties: {
                    regex: /^(m[A-Z])/
                }
            }
        });
        template = template.replace(`<?= ${name} ?>`, JSON.stringify(terserRes.code));
    }

    await fsWriteFile(`./src/webview/nativescript-webview-bridge-loader.${platform}.ts`, template);
}

async function worker() {
    await nativescriptWebviewBridgeLoader('ios');
    await nativescriptWebviewBridgeLoader('android');
}

worker();
