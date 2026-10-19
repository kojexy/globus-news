package online.globus.news;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;

public class MainActivity extends Activity {
    private static final String HOST = "app.globus.local";
    private WebView reader;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        reader = new WebView(this);
        WebSettings settings = reader.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        reader.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!HOST.equals(uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.contains("..") || path.contains("\\")) return missing();
                String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : (path.endsWith(".js") || path.endsWith(".mjs")) ? "application/javascript" : path.endsWith(".json") || path.endsWith(".webmanifest") ? "application/json" : path.endsWith(".ttf") ? "font/ttf" : path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
                try {
                    HashMap<String,String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", "https://" + HOST);
                    return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers, getAssets().open("web" + path));
                } catch (IOException e) { return missing(); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return external(request.getUrl()); }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return external(Uri.parse(url)); }
        });
        reader.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean userGesture, Message message) {
                if (!userGesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { external(Uri.parse(url)); view.destroy(); return true; }
                    @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { external(request.getUrl()); view.destroy(); return true; }
                });
                ((WebView.WebViewTransport)message.obj).setWebView(popup);
                message.sendToTarget(); return true;
            }
        });
        setContentView(reader);
        reader.loadUrl("https://" + HOST + "/index.html");
        reader.requestFocus();
    }
    private WebResourceResponse missing() { return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0])); }
    private boolean external(Uri uri) {
        if (HOST.equals(uri.getHost())) return false;
        if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException e) { Toast.makeText(this, "На устройстве нет браузера для открытия оригинала", Toast.LENGTH_LONG).show(); }
        }
        return true;
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        String key = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_RIGHT: key = "ArrowRight"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: key = "ArrowLeft"; break;
            case KeyEvent.KEYCODE_DPAD_UP: key = "ArrowUp"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: key = "ArrowDown"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: key = "Enter"; break;
            case KeyEvent.KEYCODE_MENU:
                if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) reader.evaluateJavascript("window.globusToggleMenu && window.globusToggleMenu()", null);
                return true;
        }
        if (key != null) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && (event.getRepeatCount() == 0 || key.equals("ArrowDown") || key.equals("ArrowUp"))) reader.evaluateJavascript("window.globusRemoteKey && window.globusRemoteKey('" + key + "')", null);
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
    @Override public void onBackPressed() {
        reader.evaluateJavascript("window.globusBack ? window.globusBack() : false", result -> { if (!"true".equals(result)) finish(); });
    }
    @Override protected void onResume() {
        super.onResume();
        if (reader != null) reader.evaluateJavascript("window.globusResume && window.globusResume()", null);
    }
    @Override protected void onPause() {
        if (reader != null) reader.evaluateJavascript("window.globusPause && window.globusPause()", null);
        super.onPause();
    }
    @Override protected void onDestroy() { if (reader != null) { reader.stopLoading(); reader.destroy(); } super.onDestroy(); }
}
