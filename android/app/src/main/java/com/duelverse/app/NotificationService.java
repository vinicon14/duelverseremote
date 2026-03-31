package com.duelverse.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class NotificationService extends Service {
    private static final String TAG = "NotificationService";
    private static final String PREFS_NAME = "duelverse_native";
    private static final String PREF_ACCESS_TOKEN = "access_token";
    private static final String PREF_REFRESH_TOKEN = "refresh_token";
    private static final String PREF_USER_ID = "user_id";
    private static final String PREF_SEEN_IDS = "seen_notification_ids";
    private static final String PREF_BASELINE_READY = "notification_baseline_ready";
    private static final String ACTION_START = "com.duelverse.app.action.START_NOTIFICATIONS";
    private static final String ACTION_STOP = "com.duelverse.app.action.STOP_NOTIFICATIONS";
    private static final String ACTION_RESTART = "com.duelverse.app.action.RESTART_NOTIFICATIONS";
    private static final String API_BASE_URL = "https://xxttwzewtqxvpgefggah.supabase.co";
    private static final String API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4dHR3emV3dHF4dnBnZWZnZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjY5NzQsImV4cCI6MjA3NTQ0Mjk3NH0.jhVKEu8tyid1gMnAxXZJdfrYt0a55eNpJT17hSdqtPQ";
    private static final String USER_CHANNEL_ID = "duelverse_notifications";
    private static final String SERVICE_CHANNEL_ID = "duelverse_background_service";
    private static final int FOREGROUND_NOTIFICATION_ID = 9001;
    private static final long POLL_INTERVAL_MS = 30000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SharedPreferences preferences;
    private NotificationManagerCompat notificationManager;
    private boolean serviceStoppedByUser = false;

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            executor.execute(() -> {
                try {
                    pollNotifications(false);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to poll notifications", e);
                } finally {
                    handler.postDelayed(this, POLL_INTERVAL_MS);
                }
            });
        }
    };

    public static void startService(Context context) {
        Intent intent = new Intent(context, NotificationService.class);
        intent.setAction(ACTION_START);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stopService(Context context) {
        Intent intent = new Intent(context, NotificationService.class);
        intent.setAction(ACTION_STOP);
        context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        notificationManager = NotificationManagerCompat.from(this);
        createNotificationChannels();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;

        if (ACTION_STOP.equals(action)) {
            serviceStoppedByUser = true;
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return START_NOT_STICKY;
        }

        serviceStoppedByUser = false;
        startForeground(FOREGROUND_NOTIFICATION_ID, buildForegroundNotification());
        startPolling();

        if (ACTION_RESTART.equals(action)) {
            executor.execute(() -> {
                try {
                    pollNotifications(true);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to refresh notifications after restart", e);
                }
            });
        }

        return START_STICKY;
    }

    private void startPolling() {
        handler.removeCallbacks(pollRunnable);
        handler.post(pollRunnable);
    }

    private void pollNotifications(boolean notifyImmediately) throws Exception {
        String userId = preferences.getString(PREF_USER_ID, null);
        if (userId == null || userId.isEmpty()) {
            Log.d(TAG, "No native session, stopping service");
            stopSelf();
            return;
        }

        JSONArray notifications = fetchNotifications(userId, false);
        if (notifications == null) {
            return;
        }

        Set<String> seenIds = new HashSet<>(preferences.getStringSet(PREF_SEEN_IDS, new HashSet<>()));
        boolean baselineReady = preferences.getBoolean(PREF_BASELINE_READY, false);
        boolean shouldNotify = baselineReady || notifyImmediately;

        for (int i = notifications.length() - 1; i >= 0; i--) {
            JSONObject notification = notifications.getJSONObject(i);
            String notificationId = notification.optString("id");
            if (notificationId.isEmpty() || seenIds.contains(notificationId)) {
                continue;
            }

            seenIds.add(notificationId);

            if (shouldNotify) {
                showUserNotification(
                    notificationId,
                    notification.optString("title", "Duelverse"),
                    notification.optString("message", "Você recebeu uma nova notificação.")
                );
            }
        }

        preferences.edit()
            .putStringSet(PREF_SEEN_IDS, seenIds)
            .putBoolean(PREF_BASELINE_READY, true)
            .apply();
    }

    private JSONArray fetchNotifications(String userId, boolean hasRetriedAfterRefresh) throws Exception {
        String accessToken = preferences.getString(PREF_ACCESS_TOKEN, null);
        if (accessToken == null || accessToken.isEmpty()) {
            if (refreshSession()) {
                return fetchNotifications(userId, true);
            }
            return null;
        }

        URL url = new URL(API_BASE_URL + "/rest/v1/notifications?select=id,title,message,created_at,read&user_id=eq." + userId + "&read=is.false&order=created_at.desc&limit=20");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();

        try {
            connection.setRequestMethod("GET");
            connection.setRequestProperty("apikey", API_KEY);
            connection.setRequestProperty("Authorization", "Bearer " + accessToken);
            connection.setRequestProperty("Accept", "application/json");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);

            int statusCode = connection.getResponseCode();
            if ((statusCode == HttpURLConnection.HTTP_UNAUTHORIZED || statusCode == HttpURLConnection.HTTP_FORBIDDEN) && !hasRetriedAfterRefresh && refreshSession()) {
                return fetchNotifications(userId, true);
            }

            if (statusCode < 200 || statusCode >= 300) {
                Log.e(TAG, "Notifications poll failed with status " + statusCode);
                return null;
            }

            return new JSONArray(readStream(connection.getInputStream()));
        } finally {
            connection.disconnect();
        }
    }

    private boolean refreshSession() {
        String refreshToken = preferences.getString(PREF_REFRESH_TOKEN, null);
        if (refreshToken == null || refreshToken.isEmpty()) {
            return false;
        }

        HttpURLConnection connection = null;

        try {
            URL url = new URL(API_BASE_URL + "/auth/v1/token?grant_type=refresh_token");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setRequestProperty("apikey", API_KEY);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);

            JSONObject body = new JSONObject();
            body.put("refresh_token", refreshToken);

            try (OutputStream os = connection.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int statusCode = connection.getResponseCode();
            if (statusCode < 200 || statusCode >= 300) {
                Log.e(TAG, "Session refresh failed with status " + statusCode);
                return false;
            }

            JSONObject json = new JSONObject(readStream(connection.getInputStream()));
            String newAccessToken = json.optString("access_token", "");
            String newRefreshToken = json.optString("refresh_token", refreshToken);

            if (newAccessToken.isEmpty()) {
                return false;
            }

            preferences.edit()
                .putString(PREF_ACCESS_TOKEN, newAccessToken)
                .putString(PREF_REFRESH_TOKEN, newRefreshToken)
                .apply();

            return true;
        } catch (Exception e) {
            Log.e(TAG, "Unable to refresh native auth session", e);
            return false;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private Notification buildForegroundNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, SERVICE_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("Duelverse em segundo plano")
            .setContentText("Monitorando convites, torneios e mensagens.")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build();
    }

    private void showUserNotification(String id, String title, String message) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "POST_NOTIFICATIONS not granted, skipping native alert");
            return;
        }

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            id.hashCode(),
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, USER_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .build();

        notificationManager.notify(id.hashCode(), notification);
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel userChannel = new NotificationChannel(
            USER_CHANNEL_ID,
            "DuelVerse Notificações",
            NotificationManager.IMPORTANCE_HIGH
        );
        userChannel.setDescription("Convites, mensagens e alertas importantes");
        userChannel.enableVibration(true);

        NotificationChannel serviceChannel = new NotificationChannel(
            SERVICE_CHANNEL_ID,
            "DuelVerse em segundo plano",
            NotificationManager.IMPORTANCE_LOW
        );
        serviceChannel.setDescription("Mantém o monitoramento de notificações com o app fechado");

        manager.createNotificationChannel(userChannel);
        manager.createNotificationChannel(serviceChannel);
    }

    private String readStream(InputStream inputStream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (!serviceStoppedByUser && hasStoredSession()) {
            scheduleRestart();
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(pollRunnable);
        if (!serviceStoppedByUser && hasStoredSession()) {
            scheduleRestart();
        }
        executor.shutdownNow();
        super.onDestroy();
    }

    private boolean hasStoredSession() {
        String userId = preferences.getString(PREF_USER_ID, null);
        return userId != null && !userId.isEmpty();
    }

    private void scheduleRestart() {
        AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) {
            return;
        }

        Intent restartIntent = new Intent(this, NotificationService.class);
        restartIntent.setAction(ACTION_RESTART);

        PendingIntent pendingIntent = PendingIntent.getService(
            this,
            1001,
            restartIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long triggerAtMillis = System.currentTimeMillis() + 1500L;
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}