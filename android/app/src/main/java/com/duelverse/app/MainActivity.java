package com.duelverse.app;

import android.annotation.SuppressLint;
import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;

import android.Manifest;

public class MainActivity extends AppCompatActivity {

    private static final String CHANNEL_ID = "duelverse_notifications";
    private static final String PREFS_NAME = "duelverse_native";
    private static final String PREF_FSI_PROMPTED = "full_screen_intent_prompted";
    private static final String BASE_URL = "https://duelverse.site";
    private static final int PERMISSION_REQUEST_CODE = 100;

    private WebView webView;
    private int notificationId = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        createNotificationChannel();

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
        settings.setUserAgentString(settings.getUserAgentString() + " DuelVerseApp/1.0");

        webView.addJavascriptInterface(new DuelVerseNativeBridge(), "DuelVerseNative");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        requestAppPermissions();

        SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (preferences.getString("user_id", null) != null) {
            NotificationService.startService(this);
            requestFullScreenIntentPermissionIfNeeded(preferences);
        }

        handleDuelInviteIntent(getIntent());
        loadUrl(resolveInitialPath(getIntent()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDuelInviteIntent(intent);
        loadUrl(resolveInitialPath(intent));
    }

    private void requestFullScreenIntentPermissionIfNeeded(SharedPreferences preferences) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.canUseFullScreenIntent()) {
            return;
        }

        boolean alreadyPrompted = preferences.getBoolean(PREF_FSI_PROMPTED, false);
        if (alreadyPrompted) {
            return;
        }

        preferences.edit().putBoolean(PREF_FSI_PROMPTED, true).apply();

        try {
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
            settingsIntent.setData(Uri.parse("package:" + getPackageName()));
            settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(settingsIntent);
        } catch (Exception ignored) {
        }
    }

    private String resolveInitialPath(Intent intent) {
        if (intent == null) {
            return "/";
        }

        String navigateTo = intent.getStringExtra("navigate_to");
        if (navigateTo != null && !navigateTo.trim().isEmpty()) {
            return navigateTo;
        }

        return "/";
    }

    private void loadUrl(String path) {
        if (webView == null) {
            return;
        }

        String normalizedPath = (path == null || path.trim().isEmpty()) ? "/" : path.trim();
        if (!normalizedPath.startsWith("/")) {
            normalizedPath = "/" + normalizedPath;
        }

        webView.loadUrl(BASE_URL + normalizedPath);
    }

    private void handleDuelInviteIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("duel_invite", false)) {
            return;
        }

        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        }
    }

    private void requestAppPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.POST_NOTIFICATIONS,
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO
                }, PERMISSION_REQUEST_CODE);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, new String[]{
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO
                }, PERMISSION_REQUEST_CODE);
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "DuelVerse Notificações",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Notificações de duelos, torneios e mensagens");
            channel.enableVibration(true);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
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

    public class DuelVerseNativeBridge {
        @JavascriptInterface
        public void showNotification(String title, String body) {
            NotificationCompat.Builder builder = new NotificationCompat.Builder(MainActivity.this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setVibrate(new long[]{0, 500, 200, 500});

            NotificationManagerCompat manager = NotificationManagerCompat.from(MainActivity.this);
            if (ActivityCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                manager.notify(notificationId++, builder.build());
            }
        }

        @JavascriptInterface
        public void setAuthSession(String accessToken, String refreshToken, String userId) {
            SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            preferences.edit()
                .putString("access_token", accessToken)
                .putString("refresh_token", refreshToken)
                .putString("user_id", userId)
                .apply();

            NotificationService.startService(MainActivity.this);
            requestFullScreenIntentPermissionIfNeeded(preferences);
        }

        @JavascriptInterface
        public void clearAuthSession() {
            SharedPreferences preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            preferences.edit()
                .remove("access_token")
                .remove("refresh_token")
                .remove("user_id")
                .remove("seen_notification_ids")
                .remove("notification_baseline_ready")
                .remove(PREF_FSI_PROMPTED)
                .apply();

            NotificationService.stopService(MainActivity.this);
        }
    }
}

