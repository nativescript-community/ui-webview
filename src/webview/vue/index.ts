const Plugin = {
    install(Vue) {
        Vue.registerElement('AWebView', () => require('../').AWebView);
    }
};

export default Plugin;
