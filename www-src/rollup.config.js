import strip from '@rollup/plugin-strip';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import cleanup from 'rollup-plugin-cleanup';

export default [
    {
        input: 'bridge.android.ts',
        plugins: [
            commonjs({ transformMixedEsModules: true }),
            typescript(),
            cleanup({ comments: 'none' }),
            strip({ functions: ['assert.*', 'debug', 'alert'] }),
        ],

        output: [
            {
                format: 'cjs',
                esModule: false,
                strict: false,
                file: '../build/bridge.android.js',
                // plugins: [terser()]
            },
        ],
    },
    {
        input: 'bridge.ios.ts',
        plugins: [
            commonjs({ transformMixedEsModules: true }),
            typescript(),
            strip({ functions: ['assert.*', 'debug', 'alert'] }),
        ],

        output: [
            {
                format: 'cjs',
                esModule: false,
                strict: false,
                file: '../build/bridge.ios.js',
                // plugins: [terser()]
            },
        ],
    },
    {
        input: 'metadata-view-port.ts',
        plugins: [
            commonjs({ transformMixedEsModules: true }),
            typescript(),
            strip({ functions: ['assert.*', 'debug', 'alert'] }),
        ],

        output: [
            {
                format: 'cjs',
                esModule: false,
                strict: false,
                file: '../build/metadata-view-port.js',
                // plugins: [terser()]
            },
        ],
    },
];
