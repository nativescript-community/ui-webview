package com.nativescript.webviewinterface;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import java.io.File;
import java.io.FileInputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Serves registered local resources for the intercept scheme (x-local://).
 *
 * shouldInterceptRequest is called on a Chromium network thread. Implemented in JS, every
 * request would wait for the UI thread, and a request still in flight after the view is
 * disposed crashes with "Cannot find runtime/object id for instance". So it stays in Java.
 */
public class WebViewClient extends android.webkit.WebViewClient {
    private static final Map<String, String> EXT_TO_MIME_TYPE = new HashMap<>();
    private static final Set<String> BINARY_ENCODING_EXTS = new HashSet<>();

    static {
        EXT_TO_MIME_TYPE.put("html", "text/html");
        EXT_TO_MIME_TYPE.put("htm", "text/html");
        EXT_TO_MIME_TYPE.put("xhtml", "text/html");
        EXT_TO_MIME_TYPE.put("xhtm", "text/html");
        EXT_TO_MIME_TYPE.put("css", "text/css");
        EXT_TO_MIME_TYPE.put("gif", "image/gif");
        EXT_TO_MIME_TYPE.put("jpeg", "image/jpeg");
        EXT_TO_MIME_TYPE.put("jpg", "image/jpeg");
        EXT_TO_MIME_TYPE.put("js", "text/javascript");
        EXT_TO_MIME_TYPE.put("otf", "application/vnd.ms-opentype");
        EXT_TO_MIME_TYPE.put("png", "image/png");
        EXT_TO_MIME_TYPE.put("svg", "image/svg+xml");
        EXT_TO_MIME_TYPE.put("ttf", "application/x-font-ttf");

        BINARY_ENCODING_EXTS.add("gif");
        BINARY_ENCODING_EXTS.add("jpeg");
        BINARY_ENCODING_EXTS.add("jpg");
        BINARY_ENCODING_EXTS.add("otf");
        BINARY_ENCODING_EXTS.add("png");
        BINARY_ENCODING_EXTS.add("ttf");
    }

    private final Map<String, String> localResources = new ConcurrentHashMap<>();
    private volatile String interceptScheme = "x-local";

    public void setInterceptScheme(String scheme) {
        interceptScheme = scheme;
    }

    public void registerLocalResource(String resourceName, String filepath) {
        localResources.put(resourceName, filepath);
    }

    public void unregisterLocalResource(String resourceName) {
        localResources.remove(resourceName);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse response = interceptLocalResource(request.getUrl().toString());
        return response != null ? response : super.shouldInterceptRequest(view, request);
    }

    @Override
    @SuppressWarnings("deprecation")
    public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
        WebResourceResponse response = interceptLocalResource(url);
        return response != null ? response : super.shouldInterceptRequest(view, url);
    }

    private WebResourceResponse interceptLocalResource(String url) {
        String prefix = interceptScheme + "://";
        if (url == null || !url.startsWith(prefix)) {
            return null;
        }

        String filepath = localResources.get(url.substring(prefix.length()));
        if (filepath == null) {
            return null;
        }

        File file = new File(filepath);
        if (!file.exists()) {
            return null;
        }

        try {
            String name = file.getName();
            int dot = name.lastIndexOf('.');
            String ext = dot >= 0 ? name.substring(dot + 1).toLowerCase() : "";
            String mimeType = EXT_TO_MIME_TYPE.get(ext);
            if (mimeType == null) {
                mimeType = "application/octet-stream";
            }
            String encoding = BINARY_ENCODING_EXTS.contains(ext) || mimeType.equals("application/octet-stream") ? "binary" : "UTF-8";

            WebResourceResponse response = new WebResourceResponse(mimeType, encoding, new FileInputStream(file));
            Map<String, String> responseHeaders = new HashMap<>();
            responseHeaders.put("Access-Control-Allow-Origin", "*");
            response.setResponseHeaders(responseHeaders);
            return response;
        } catch (Exception e) {
            return null;
        }
    }
}
