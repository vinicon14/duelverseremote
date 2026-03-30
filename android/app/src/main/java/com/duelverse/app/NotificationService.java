package com.duelverse.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;

import java.io.BufferedReader;
import java.io.OutputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

public class NotificationService extends Service {

    private static final String TAG = "DuelVerseNotifService";
    private static final long POLL_INTERVAL = 30000; // 30 seconds
    private static final String SERVICE_CHANNEL_ID = "duelverse_service";
    private static final String SUPABASE_URL = "https://xxttwzewtqxvpgefggah.supabase.co";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4dHR3emV3dHF4dnBnZWZnZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjY5NzQsImV4cCI6MjA3NTQ0Mjk3NH0.jhVKEu8tyid1gMnAxXZJdfrYt0a55eNpJT17hSdqtPQ";

    private Handler handler;
    private Runnable pollRunnable;
    private String lastNotificationId = "";

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createServiceChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Start as foreground service with minimal notification
        Notification notification = new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("DuelVerse")
            .setContentText("Monitorando notificações...")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .setOngoing(true)
            .build();

        startForeground(9999, notification);

        // Start polling
        startPolling();

        return START_STICKY;
    }

    private void createServiceChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                SERVICE_CHANNEL_ID,
                "Serviço de Notificações",
                NotificationManager.IMPORTANCE_MIN
            );
            channel.setShowBadge(false);
            channel.setSound(null, null);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startPolling() {
        pollRunnable = new Runnable() {
            @Override
            public void run() {
                new Thread(() -> checkForNotifications()).start();
                handler.postDelayed(this, POLL_INTERVAL);
            }
        };
        handler.post(pollRunnable);
    }

    private void checkForNotifications() {
        SharedPreferences prefs = getSharedPreferences("duelverse", MODE_PRIVATE);

        try {
            String userId = prefs.getString("user_id", null);
            String accessToken = prefs.getString("access_token", null);
            String refreshToken = prefs.getString("refresh_token", null);

            if (userId == null || userId.isEmpty() || refreshToken == null || refreshToken.isEmpty()) {
                Log.d(TAG, "Missing auth session, skipping poll");
                return;
            }

            if (accessToken == null || accessToken.isEmpty() || isJwtExpired(accessToken)) {
                accessToken = refreshAccessToken(refreshToken, prefs);
            }

            if (accessToken == null || accessToken.isEmpty()) {
                Log.d(TAG, "Unable to obtain valid access token");
                return;
            }

            JSONArray notifications = fetchUnreadNotifications(userId, accessToken);

            if (notifications == null) {
                accessToken = refreshAccessToken(refreshToken, prefs);
                if (accessToken == null || accessToken.isEmpty()) {
                    return;
                }
                notifications = fetchUnreadNotifications(userId, accessToken);
            }

            if (notifications == null || notifications.length() == 0) {
                return;
            }

            JSONObject latest = notifications.getJSONObject(0);
            String id = latest.getString("id");
            String persistedLastId = prefs.getString("last_notified_notification_id", "");

            if (persistedLastId == null || persistedLastId.isEmpty()) {
                prefs.edit().putString("last_notified_notification_id", id).apply();
                lastNotificationId = id;
                return;
            }

            if (!id.equals(persistedLastId) && !id.equals(lastNotificationId)) {
                lastNotificationId = id;
                prefs.edit().putString("last_notified_notification_id", id).apply();

                String title = latest.optString("title", "Nova notificação");
                String message = latest.optString("message", "Você recebeu uma nova notificação.");

                NotificationHelper.showNotification(NotificationService.this, title, message);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error checking notifications: " + e.getMessage());
        }
    }

    private JSONArray fetchUnreadNotifications(String userId, String accessToken) {
        HttpURLConnection conn = null;

        try {
            String urlStr = SUPABASE_URL + "/rest/v1/notifications"
                + "?user_id=eq." + userId
                + "&or=(read.eq.false,read.is.null)"
                + "&order=created_at.desc"
                + "&limit=5"
                + "&select=id,title,message,created_at";

            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int responseCode = conn.getResponseCode();
            if (responseCode == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();
                return new JSONArray(response.toString());
            }

            Log.e(TAG, "Notifications fetch failed: HTTP " + responseCode);
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Notifications fetch exception: " + e.getMessage());
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private String refreshAccessToken(String refreshToken, SharedPreferences prefs) {
        HttpURLConnection conn = null;

        try {
            URL url = new URL(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token");
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            JSONObject payload = new JSONObject();
            payload.put("refresh_token", refreshToken);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                Log.e(TAG, "Token refresh failed: HTTP " + responseCode);
                return null;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
            reader.close();

            JSONObject session = new JSONObject(response.toString());
            String newAccessToken = session.optString("access_token", null);
            String newRefreshToken = session.optString("refresh_token", refreshToken);

            if (newAccessToken != null && !newAccessToken.isEmpty()) {
                prefs.edit()
                    .putString("access_token", newAccessToken)
                    .putString("refresh_token", newRefreshToken)
                    .apply();
            }

            return newAccessToken;
        } catch (Exception e) {
            Log.e(TAG, "Token refresh exception: " + e.getMessage());
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private boolean isJwtExpired(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) {
                return true;
            }

            byte[] decoded = Base64.getUrlDecoder().decode(parts[1]);
            JSONObject payload = new JSONObject(new String(decoded, StandardCharsets.UTF_8));
            long exp = payload.optLong("exp", 0L);
            long now = System.currentTimeMillis() / 1000L;

            return exp <= (now + 60);
        } catch (Exception e) {
            return true;
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Intent restartServiceIntent = new Intent(getApplicationContext(), NotificationService.class);
        restartServiceIntent.setPackage(getPackageName());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(restartServiceIntent);
        } else {
            startService(restartServiceIntent);
        }

        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (handler != null && pollRunnable != null) {
            handler.removeCallbacks(pollRunnable);
        }
        super.onDestroy();
    }
}