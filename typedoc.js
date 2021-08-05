module.exports = {
    mode: 'modules',
    out: 'docs',
    exclude: ['**/node_modules/**', '**/*.spec.ts'],
    name: 'Nativescript UI WebView',
    excludePrivate: true,
    ignoreCompilerErrors: true,
    excludeNotExported: true,
    includeDeclarations: true,
    excludePrivate: true,
    excludeExternals: true,
    tsconfig: 'tsconfig.doc.json',
    readme: 'README.md'
};
