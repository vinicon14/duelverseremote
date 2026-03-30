package com.duelverse.app;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.PermissionRequest;
import android.webkit.JavascriptInterface;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.widget.Toast;
import android.Manifest;

public class MainActivity extends AppCompatActivity {

    private static final String DEFAULT_URL = "https://duelverse.site";
    private WebView webView;
    private static final int PERMISSION_REQUEST_CODE = 1001;

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

        // Add JavaScript bridge for native notifications
        webView.addJavascriptInterface(new DuelVerseNativeBridge(), "DuelVerseNative");

        webView.loadUrl(resolveLaunchUrl(getIntent()));

        // Create notification channel
        createNotificationChannel();

        // Request all permissions at startup
        requestAllPermissions();

        // Start background notification service
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

    private void openExternalUrl(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
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

    private void requestAllPermissions() {
        java.util.List<String> permissionsNeeded = new java.util.ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.CAMERA);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            permissionsNeeded.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                permissionsNeeded.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!permissionsNeeded.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                permissionsNeeded.toArray(new String[0]),
                PERMISSION_REQUEST_CODE);
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
        // Service continues running in background
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

            if (isAppUrl(uri)) {
                return false;
            }

            openExternalUrl(uri);
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = url != null ? Uri.parse(url) : null;

            if (uri == null || isAppUrl(uri)) {
                return false;
            }

            openExternalUrl(uri);
            return true;
        }
    }

    // JavaScript bridge class
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
