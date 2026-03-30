package com.duelverse.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;

import java.util.ArrayList;

public class MainActivity extends AppCompatActivity {

    private static final String DEFAULT_URL = "https://duelverse.site";
    private static final int INITIAL_PERMISSIONS_REQUEST_CODE = 1001;

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(settings.getUserAgentString() + " DuelVerseApp/1.0 LovableApp/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new OAuthAwareWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        webView.addJavascriptInterface(new DuelVerseNativeBridge(), "DuelVerseNative");

        createNotificationChannel();
        requestInitialPermissions();
        webView.loadUrl(resolveLaunchUrl(getIntent()));
        startNotificationService();
    }

    private String resolveLaunchUrl(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        return data != null ? data.toString() : DEFAULT_URL;
    }

    private boolean isAppUrl(Uri uri) {
        if (uri == null) return false;

        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (scheme == null || host == null) return false;

        return "https".equalsIgnoreCase(scheme)
            && (
                "duelverse.site".equalsIgnoreCase(host)
                || "duelverseremote.lovable.app".equalsIgnoreCase(host)
                || host.endsWith(".lovable.app")
                || host.endsWith(".lovableproject.com")
            );
    }

    private boolean shouldOpenExternally(Uri uri) {
        if (uri == null) return false;

        String path = uri.getPath();
        if (path != null && path.startsWith("/~oauth")) {
            return true;
        }

        return !isAppUrl(uri);
    }

    private void openExternalUrl(Uri uri) {
        String[] browserPackages = new String[] {
            "com.android.chrome",
            "org.mozilla.firefox",
            "com.microsoft.emmx",
            "com.opera.browser",
            "com.sec.android.app.sbrowser"
        };

        for (String browserPackage : browserPackages) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.setPackage(browserPackage);

                if (intent.resolveActivity(getPackageManager()) != null) {
                    startActivity(intent);
                    return;
                }
            } catch (ActivityNotFoundException ignored) {
            }
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "duelverse_notifications",
                "DuelVerse Notificações",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notificações de duelos, torneios e amigos");
            channel.enableVibration(true);
            channel.setShowBadge(true);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void requestInitialPermissions() {
        ArrayList<String> permissions = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.CAMERA);
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.RECORD_AUDIO);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                permissions.toArray(new String[0]),
                INITIAL_PERMISSIONS_REQUEST_CODE
            );
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                INITIAL_PERMISSIONS_REQUEST_CODE
            );
        }
    }

    private void startNotificationService() {
        Intent serviceIntent = new Intent(this, NotificationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);

        String launchUrl = resolveLaunchUrl(intent);
        if (webView != null) {
            webView.loadUrl(launchUrl);
        }
    }

    private class OAuthAwareWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request != null ? request.getUrl() : null;

            if (uri == null) {
                return false;
            }

            if (shouldOpenExternally(uri)) {
                openExternalUrl(uri);
                return true;
            }

            return false;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = url != null ? Uri.parse(url) : null;

            if (uri == null) {
                return false;
            }

            if (shouldOpenExternally(uri)) {
                openExternalUrl(uri);
                return true;
            }

            return false;
        }
    }

    private class DuelVerseNativeBridge {
        @JavascriptInterface
        public void showNotification(String title, String body) {
            NotificationHelper.showNotification(MainActivity.this, title, body);
        }

        @JavascriptInterface
        public boolean hasNotificationPermission() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                return true;
            }

            return ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(() -> MainActivity.this.requestNotificationPermission());
        }

        @JavascriptInterface
        public void setUserId(String userId) {
            getSharedPreferences("duelverse", MODE_PRIVATE)
                .edit()
                .putString("user_id", userId)
                .apply();
        }

        @JavascriptInterface
        public void setAuthSession(String userId, String accessToken, String refreshToken) {
            getSharedPreferences("duelverse", MODE_PRIVATE)
                .edit()
                .putString("user_id", userId)
                .putString("access_token", accessToken)
                .putString("refresh_token", refreshToken)
                .apply();
        }

        @JavascriptInterface
        public void clearAuthSession() {
            getSharedPreferences("duelverse", MODE_PRIVATE)
                .edit()
                .remove("user_id")
                .remove("access_token")
                .remove("refresh_token")
                .remove("last_notified_notification_id")
                .apply();
        }
    }
}
