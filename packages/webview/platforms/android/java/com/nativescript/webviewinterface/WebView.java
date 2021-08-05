package com.nativescript.webviewinterface;

public class WebView extends android.webkit.WebView {
    boolean mScrollEnabled;

    public WebView(android.content.Context context) {
        super(context);
        mScrollEnabled = true;
    }

    public void setScrollEnabled(boolean value) {
        mScrollEnabled = value;
    }

    public boolean getScrollEnabled() {
        return mScrollEnabled;
    }

    protected boolean overScrollBy(int deltaX, int deltaY, int scrollX, int scrollY, int scrollRangeX, int scrollRangeY,
            int maxOverScrollX, int maxOverScrollY, boolean isTouchEvent) {
        if (mScrollEnabled) {
            return super.overScrollBy(deltaX, deltaY, scrollX, scrollY, scrollRangeX, scrollRangeY, maxOverScrollX,
                    maxOverScrollY, isTouchEvent);
        }
        return false;
    }

    public void computeScroll() {
        if (mScrollEnabled) {
            super.computeScroll();
        }
    }

    public void scrollTo(int x, int y) {
        if (mScrollEnabled) {
            super.scrollTo(x, y);
        }
    }
}
