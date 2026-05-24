package com.nativescript.webviewinterface;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.DialogInterface;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Message;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.Map;

/**
 * Wraps a WebChromeClient delegate and adds popup window support via a bottom-sheet Dialog.
 * Slide-up entrance, swipe-to-dismiss, dim overlay. Uses only standard Android APIs (API 19+).
 */
public class PopupWebChromeClient extends WebChromeClient {

    /** Callback so the host app can intercept popup navigations (e.g. OAuth redirects). */
    public interface PopupUrlInterceptor {
        /** Return true to intercept: the popup is dismissed and the URL is passed to the host. */
        boolean shouldHandleExternally(String url);
    }

    private final WebChromeClient delegate;
    private volatile boolean supportPopups;
    private final WeakReference<Context> activityContextRef;
    private final Map<WebView, Dialog> popupDialogs = new HashMap<>();
    private PopupUrlInterceptor urlInterceptor;

    public PopupWebChromeClient(WebChromeClient delegate, boolean supportPopups, Context activityContext) {
        this.delegate = delegate;
        this.supportPopups = supportPopups;
        this.activityContextRef = new WeakReference<>(activityContext);
    }

    public void setSupportPopups(boolean value) {
        this.supportPopups = value;
    }

    public void setUrlInterceptor(PopupUrlInterceptor interceptor) {
        this.urlInterceptor = interceptor;
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        if (!supportPopups) return false;

        Context context = activityContextRef.get();
        if (context == null) return false;

        Activity activity = getActivity(context);
        if (activity == null) return false;

        final WebView popupWebView = new WebView(activity);
        WebSettings settings = popupWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportMultipleWindows(true);
        // Inherit the parent WebView's UA so any app-level customisation is preserved.
        settings.setUserAgentString(view.getSettings().getUserAgentString());

        // Wire the new WebView into the system's popup transport before showing UI.
        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
        transport.setWebView(popupWebView);
        resultMsg.sendToTarget();

        Dialog dialog = showPopupDialog(activity, popupWebView);
        popupDialogs.put(popupWebView, dialog);

        return true;
    }

    @Override
    public void onCloseWindow(WebView window) {
        Dialog d = popupDialogs.remove(window);
        if (d != null) d.dismiss();
        delegate.onCloseWindow(window);
    }

    /** Unwrap ContextWrapper chain to find the hosting Activity (required for Dialog). */
    private static Activity getActivity(Context context) {
        while (context instanceof ContextWrapper) {
            if (context instanceof Activity) return (Activity) context;
            context = ((ContextWrapper) context).getBaseContext();
        }
        return null;
    }

    private Dialog showPopupDialog(final Activity activity, final WebView popupWebView) {
        final float dp = activity.getResources().getDisplayMetrics().density;
        final int toolbarH = (int) (48 * dp);
        final int padH = (int) (20 * dp);
        android.graphics.Rect initFrame = new android.graphics.Rect();
        activity.getWindow().getDecorView().getWindowVisibleDisplayFrame(initFrame);
        final int[] sheetH = {initFrame.height() - toolbarH / 2};

        // Dim overlay on the Activity decor view
        final ViewGroup activityDecor = (ViewGroup) activity.getWindow().getDecorView();
        final View dimView = new View(activity);
        dimView.setBackgroundColor(Color.argb(102, 0, 0, 0)); // 40 % dim
        dimView.setAlpha(0f);
        activityDecor.addView(dimView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        dimView.animate().alpha(1f).setDuration(350).start();

        final Dialog dialog = new Dialog(activity);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        // Sheet root with rounded top corners.
        // onMeasure recalculates sheetH[0] on every layout pass so rotation
        // automatically updates the sheet height while respecting the status bar safe area
        final LinearLayout content = new LinearLayout(activity) {
            @Override
            protected void onMeasure(int widthSpec, int heightSpec) {
                // Query the dialog's own window frame; the activity window frame would
                // not reflect keyboard insets inside a separate dialog window.
                android.graphics.Rect fr = new android.graphics.Rect();
                getWindowVisibleDisplayFrame(fr);
                if (fr.height() > 0) sheetH[0] = fr.height() - toolbarH / 2;
                super.onMeasure(widthSpec,
                        MeasureSpec.makeMeasureSpec(sheetH[0], MeasureSpec.EXACTLY));
            }
        };
        content.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable sheetBg = new GradientDrawable();
        sheetBg.setColor(Color.parseColor("#222222"));
        float cornerR = 16 * dp;
        sheetBg.setCornerRadii(new float[]{cornerR, cornerR, cornerR, cornerR, 0, 0, 0, 0});
        content.setBackground(sheetBg);

        // Shared drag state
        final int touchSlop = ViewConfiguration.get(activity).getScaledTouchSlop();
        final float[] dragStartRawY = {0f};
        final float[] interceptDownY = {0f};
        final VelocityTracker[] vt = {null};

        // Slide-down animation shared by toolbar, webViewWrapper, and back key
        final Runnable[] doAnimatedDismiss = {null};
        doAnimatedDismiss[0] = new Runnable() {
            @Override public void run() {
                float current = content.getTranslationY();
                long duration = Math.max(80L, (long) (250 * (1f - current / sheetH[0])));
                dimView.animate().alpha(0f).setDuration(duration).start();
                content.animate()
                        .translationY(sheetH[0])
                        .setDuration(duration)
                        .withEndAction(new Runnable() {
                            @Override public void run() { dialog.dismiss(); }
                        })
                        .start();
            }
        };

        // Toolbar: drag downward to dismiss.
        // Two touch paths:
        //  (A) Touch on close button: button consumes ACTION_DOWN; onInterceptTouchEvent
        //      steals subsequent MOVE once drag is detected.
        //  (B) Touch on title area: TextView is not clickable, so no child takes
        //      ACTION_DOWN; onTouchEvent receives it, returns true to own the gesture,
        //      then detects and handles the drag itself.
        final LinearLayout toolbar = new LinearLayout(activity) {
            private float downY;
            private boolean dragging;

            // Path A: steal touch from a child (close button) once drag is detected.
            @Override
            public boolean onInterceptTouchEvent(MotionEvent ev) {
                switch (ev.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        downY = ev.getRawY();
                        dragging = false;
                        break;
                    case MotionEvent.ACTION_MOVE:
                        if (!dragging && ev.getRawY() - downY > touchSlop) {
                            dragging = true;
                            dragStartRawY[0] = ev.getRawY();
                            if (vt[0] != null) vt[0].recycle();
                            vt[0] = VelocityTracker.obtain();
                            vt[0].addMovement(ev);
                            content.animate().cancel();
                        }
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        dragging = false;
                        break;
                }
                return dragging;
            }

            // Path B: direct touch on non-clickable area (title), or continuation
            // after interception from a child.
            @Override
            public boolean onTouchEvent(MotionEvent ev) {
                switch (ev.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        // Own the gesture so we receive future MOVE events.
                        downY = ev.getRawY();
                        dragging = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        if (!dragging) {
                            if (ev.getRawY() - downY > touchSlop) {
                                dragging = true;
                                dragStartRawY[0] = ev.getRawY();
                                if (vt[0] != null) vt[0].recycle();
                                vt[0] = VelocityTracker.obtain();
                                vt[0].addMovement(ev);
                                content.animate().cancel();
                            }
                            return true;
                        }
                        float delta = ev.getRawY() - dragStartRawY[0];
                        if (delta > 0) content.setTranslationY(delta);
                        if (vt[0] != null) vt[0].addMovement(ev);
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        if (dragging) {
                            dragging = false;
                            float totalDelta = ev.getRawY() - dragStartRawY[0];
                            float yVelocity = 0;
                            if (vt[0] != null) {
                                vt[0].addMovement(ev);
                                vt[0].computeCurrentVelocity(1000);
                                yVelocity = vt[0].getYVelocity();
                                vt[0].recycle();
                                vt[0] = null;
                            }
                            if (totalDelta > sheetH[0] * 0.3f || yVelocity > 1000) {
                                doAnimatedDismiss[0].run();
                            } else {
                                content.animate().translationY(0).setDuration(200).start();
                            }
                        }
                        return true;
                }
                return false;
            }
        };
        toolbar.setOrientation(LinearLayout.HORIZONTAL);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        content.addView(toolbar, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, toolbarH));

        final TextView titleView = new TextView(activity);
        titleView.setText("loading...");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        titleView.setIncludeFontPadding(false);
        titleView.setPadding(padH, 0, 0, 0);
        toolbar.addView(titleView, new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        final Button closeBtn = new Button(activity);
        closeBtn.setText("✕");
        closeBtn.setTextColor(Color.WHITE);
        closeBtn.setBackgroundColor(Color.TRANSPARENT);
        closeBtn.setMinWidth(0);
        closeBtn.setMinimumWidth(0);
        closeBtn.setGravity(Gravity.CENTER);
        closeBtn.setPadding(padH / 2, 0, padH, 0);
        toolbar.addView(closeBtn, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.MATCH_PARENT));

        // WebView wrapper: intercepts swipe-to-dismiss over the WebView area.
        // When the WebView is scrolled to the top and the user drags downward,
        // steal the touch sequence and slide the sheet down.
        FrameLayout webViewWrapper = new FrameLayout(activity) {
            private boolean intercepting;

            @Override
            public boolean onInterceptTouchEvent(MotionEvent ev) {
                switch (ev.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        interceptDownY[0] = ev.getRawY();
                        intercepting = false;
                        break;
                    case MotionEvent.ACTION_MOVE:
                        if (!intercepting) {
                            float dy = ev.getRawY() - interceptDownY[0];
                            // Intercept downward drags when WebView is at scroll top.
                            if (dy > touchSlop && popupWebView.getScrollY() == 0) {
                                intercepting = true;
                                dragStartRawY[0] = ev.getRawY();
                                if (vt[0] != null) vt[0].recycle();
                                vt[0] = VelocityTracker.obtain();
                                vt[0].addMovement(ev);
                                content.animate().cancel();
                            }
                        }
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        intercepting = false;
                        break;
                }
                return intercepting;
            }

            @Override
            public boolean onTouchEvent(MotionEvent ev) {
                if (!intercepting) return false;
                switch (ev.getAction()) {
                    case MotionEvent.ACTION_MOVE:
                        float delta = ev.getRawY() - dragStartRawY[0];
                        if (delta > 0) content.setTranslationY(delta);
                        if (vt[0] != null) vt[0].addMovement(ev);
                        return true;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        intercepting = false;
                        float totalDelta = ev.getRawY() - dragStartRawY[0];
                        float yVelocity = 0;
                        if (vt[0] != null) {
                            vt[0].addMovement(ev);
                            vt[0].computeCurrentVelocity(1000);
                            yVelocity = vt[0].getYVelocity();
                            vt[0].recycle();
                            vt[0] = null;
                        }
                        if (totalDelta > sheetH[0] * 0.3f || yVelocity > 1000) {
                            doAnimatedDismiss[0].run();
                        } else {
                            content.animate().translationY(0).setDuration(200).start();
                        }
                        return true;
                }
                return true;
            }
        };
        webViewWrapper.addView(popupWebView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        content.addView(webViewWrapper, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        // Popup WebView clients
        popupWebView.setBackgroundColor(Color.WHITE);
        popupWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onCloseWindow(WebView window) {
                Dialog d = popupDialogs.remove(window);
                if (d != null) d.dismiss();
            }

            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // target="_blank" links inside the popup: capture URL and open in system browser.
                // A temporary WebView is needed to receive the transport URL from the system.
                final WebView tempView = new WebView(activity);
                tempView.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, String url) {
                        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        activity.startActivity(intent);
                        tempView.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(tempView);
                resultMsg.sendToTarget();
                return true;
            }
        });
        popupWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (urlInterceptor != null && urlInterceptor.shouldHandleExternally(url)) {
                    doAnimatedDismiss[0].run();
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                String host = Uri.parse(url).getHost();
                if (host != null && !host.isEmpty()) titleView.setText(host);
            }
        });

        // Wrap sheet in a full-screen transparent root so the dialog window can be
        // MATCH_PARENT × MATCH_PARENT; the sheet aligns itself to the bottom.
        // This lets onMeasure in content drive the height after every rotation.
        FrameLayout dialogRoot = new FrameLayout(activity);
        FrameLayout.LayoutParams contentLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT);
        contentLp.gravity = Gravity.BOTTOM;
        dialogRoot.addView(content, contentLp);
        dialog.setContentView(dialogRoot);

        Window window = dialog.getWindow();
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT);
            // No FLAG_DIM_BEHIND — we manage the dim ourselves via dimView.
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setDimAmount(0f);
            // Resize the dialog window to the visible area above the keyboard
            window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }

        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) { doAnimatedDismiss[0].run(); }
        });

        // Animate slide-down on back key instead of instant dismiss
        dialog.setOnKeyListener(new DialogInterface.OnKeyListener() {
            @Override
            public boolean onKey(DialogInterface d, int keyCode, KeyEvent event) {
                if (keyCode == KeyEvent.KEYCODE_BACK
                        && event.getAction() == KeyEvent.ACTION_UP) {
                    doAnimatedDismiss[0].run();
                    return true;
                }
                return false;
            }
        });

        dialog.setOnDismissListener(new DialogInterface.OnDismissListener() {
            @Override
            public void onDismiss(DialogInterface d) {
                // Remove the dim overlay from the decor view.
                activityDecor.removeView(dimView);
                popupDialogs.remove(popupWebView);
                popupWebView.destroy();
            }
        });

        // Slide-up entrance animation
        dialog.show();
        content.setTranslationY(sheetH[0]);
        content.animate().translationY(0).setDuration(350).start();

        return dialog;
    }

    // Delegate all standard WebChromeClient callbacks

    @Override
    public void onProgressChanged(WebView view, int newProgress) {
        delegate.onProgressChanged(view, newProgress);
    }

    @Override
    public void onReceivedTitle(WebView view, String title) {
        delegate.onReceivedTitle(view, title);
    }

    @Override
    public void onReceivedIcon(WebView view, Bitmap icon) {
        delegate.onReceivedIcon(view, icon);
    }

    @Override
    public void onReceivedTouchIconUrl(WebView view, String url, boolean precomposed) {
        delegate.onReceivedTouchIconUrl(view, url, precomposed);
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        delegate.onShowCustomView(view, callback);
    }

    @Override
    public void onHideCustomView() {
        delegate.onHideCustomView();
    }

    @Override
    public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
        return delegate.onJsAlert(view, url, message, result);
    }

    @Override
    public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
        return delegate.onJsConfirm(view, url, message, result);
    }

    @Override
    public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
        return delegate.onJsPrompt(view, url, message, defaultValue, result);
    }

    @Override
    public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
        return delegate.onConsoleMessage(consoleMessage);
    }

    @Override
    public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback,
            FileChooserParams fileChooserParams) {
        return delegate.onShowFileChooser(webView, filePathCallback, fileChooserParams);
    }

    @Override
    public void onPermissionRequest(PermissionRequest request) {
        delegate.onPermissionRequest(request);
    }

    @Override
    public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
        delegate.onGeolocationPermissionsShowPrompt(origin, callback);
    }

}
