package com.duelverse.app;

import android.app.AlarmManager;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
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
    private static final String PREF_SEEN_INVITE_IDS = "seen_invite_ids";
    private static final String PREF_BASELINE_READY = "notification_baseline_ready";
    private static final String PREF_INVITE_BASELINE_READY = "invite_baseline_ready";
    private static final String ACTION_START = "com.duelverse.app.action.START_NOTIFICATIONS";
    private static final String ACTION_STOP = "com.duelverse.app.action.STOP_NOTIFICATIONS";
    private static final String ACTION_RESTART = "com.duelverse.app.action.RESTART_NOTIFICATIONS";
    private static final String ACTION_ACCEPT_DUEL = "com.duelverse.app.action.ACCEPT_DUEL";
    private static final String ACTION_REJECT_DUEL = "com.duelverse.app.action.REJECT_DUEL";
    private static final String API_BASE_URL = "https://xxttwzewtqxvpgefggah.supabase.co";
    private static final String API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4dHR3emV3dHF4dnBnZWZnZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NjY5NzQsImV4cCI6MjA3NTQ0Mjk3NH0.jhVKEu8tyid1gMnAxXZJdfrYt0a55eNpJT17hSdqtPQ";
    private static final String USER_CHANNEL_ID = "duelverse_notifications";
    private static final String DUEL_CHANNEL_ID = "duelverse_duel_invites";
    private static final String SERVICE_CHANNEL_ID = "duelverse_background_service";
    private static final int FOREGROUND_NOTIFICATION_ID = 9001;
    private static final long POLL_INTERVAL_MS = 15000L; // 15 seconds for faster duel invite detection

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private SharedPreferences preferences;
    private NotificationManagerCompat notificationManager;
    private boolean serviceStoppedByUser = false;
    private MediaPlayer mediaPlayer;
    private final Object mediaPlayerLock = new Object();

    private final Runnable pollRunnable = new Runnable() {
        @Override
        public void run() {
            executor.execute(() -> {
                try {
                    pollNotifications(false);
                    pollDuelInvites();
                } catch (Exception e) {
                    Log.e(TAG, "Failed to poll", e);
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

        if (ACTION_ACCEPT_DUEL.equals(action)) {
            String inviteId = intent.getStringExtra("invite_id");
            String duelId = intent.getStringExtra("duel_id");
            if (inviteId != null) {
                executor.execute(() -> handleDuelAction(inviteId, duelId, "accepted"));
            }
            return START_STICKY;
        }

        if (ACTION_REJECT_DUEL.equals(action)) {
            String inviteId = intent.getStringExtra("invite_id");
            String duelId = intent.getStringExtra("duel_id");
            if (inviteId != null) {
                executor.execute(() -> handleDuelAction(inviteId, duelId, "rejected"));
            }
            return START_STICKY;
        }

        serviceStoppedByUser = false;
        startForeground(FOREGROUND_NOTIFICATION_ID, buildForegroundNotification());
        startPolling();

        if (ACTION_RESTART.equals(action)) {
            executor.execute(() -> {
                try {
                    pollNotifications(true);
                    pollDuelInvites();
                } catch (Exception e) {
                    Log.e(TAG, "Failed to refresh after restart", e);
                }
            });
        }

        return START_STICKY;
    }

    private void startPolling() {
        handler.removeCallbacks(pollRunnable);
        handler.post(pollRunnable);
    }

    private void handleDuelAction(String inviteId, String duelId, String newStatus) {
        try {
            stopCustomRingtone();
            String accessToken = preferences.getString(PREF_ACCESS_TOKEN, null);
            if (accessToken == null) return;

            // Update invite status
            URL url = new URL(API_BASE_URL + "/rest/v1/duel_invites?id=eq." + inviteId);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("apikey", API_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setDoOutput(true);

            JSONObject body = new JSONObject();
            body.put("status", newStatus);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            conn.getResponseCode();
            conn.disconnect();

            // Cancel the notification
            notificationManager.cancel(inviteId.hashCode());

            // If accepted, open the app to the duel room
            if ("accepted".equals(newStatus) && duelId != null) {
                Intent openApp = new Intent(this, MainActivity.class);
                openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                openApp.putExtra("navigate_to", "/duel/" + duelId);
                startActivity(openApp);
            }

            // If rejected, also delete the waiting duel
            if ("rejected".equals(newStatus) && duelId != null) {
                URL duelUrl = new URL(API_BASE_URL + "/rest/v1/live_duels?id=eq." + duelId + "&status=eq.waiting");
                HttpURLConnection duelConn = (HttpURLConnection) duelUrl.openConnection();
                duelConn.setRequestMethod("DELETE");
                duelConn.setRequestProperty("apikey", API_KEY);
                duelConn.setRequestProperty("Authorization", "Bearer " + accessToken);
                duelConn.getResponseCode();
                duelConn.disconnect();
            }

            Log.d(TAG, "Duel invite " + inviteId + " -> " + newStatus);
        } catch (Exception e) {
            Log.e(TAG, "Failed to handle duel action", e);
        }
    }

    private void pollDuelInvites() {
        try {
            String userId = preferences.getString(PREF_USER_ID, null);
            String accessToken = preferences.getString(PREF_ACCESS_TOKEN, null);
            if (userId == null || accessToken == null) return;

            URL url = new URL(API_BASE_URL + "/rest/v1/duel_invites?select=id,sender_id,duel_id,status,created_at&receiver_id=eq." + userId + "&status=eq.pending&order=created_at.desc&limit=5");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", API_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int status = conn.getResponseCode();
            if (status == 401 || status == 403) {
                if (refreshSession()) {
                    pollDuelInvites();
                }
                conn.disconnect();
                return;
            }

            if (status < 200 || status >= 300) {
                conn.disconnect();
                return;
            }

            JSONArray invites = new JSONArray(readStream(conn.getInputStream()));
            conn.disconnect();

            Set<String> seenInviteIds = new HashSet<>(preferences.getStringSet(PREF_SEEN_INVITE_IDS, new HashSet<>()));
            boolean baselineReady = preferences.getBoolean(PREF_INVITE_BASELINE_READY, false);

            for (int i = 0; i < invites.length(); i++) {
                JSONObject invite = invites.getJSONObject(i);
                String inviteId = invite.optString("id");
                String duelId = invite.optString("duel_id");
                String senderId = invite.optString("sender_id");

                if (inviteId.isEmpty() || seenInviteIds.contains(inviteId)) continue;
                seenInviteIds.add(inviteId);

                if (baselineReady) {
                    String senderName = fetchUsername(senderId, accessToken);
                    String tcgType = fetchDuelTcgType(duelId, accessToken);
                    showDuelInviteNotification(inviteId, duelId, senderName, tcgType);
                }
            }

            preferences.edit()
                .putStringSet(PREF_SEEN_INVITE_IDS, seenInviteIds)
                .putBoolean(PREF_INVITE_BASELINE_READY, true)
                .apply();

        } catch (Exception e) {
            Log.e(TAG, "Failed to poll duel invites", e);
        }
    }

    private String fetchUsername(String userId, String accessToken) {
        try {
            URL url = new URL(API_BASE_URL + "/rest/v1/profiles?select=username&user_id=eq." + userId + "&limit=1");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", API_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);

            if (conn.getResponseCode() == 200) {
                JSONArray arr = new JSONArray(readStream(conn.getInputStream()));
                if (arr.length() > 0) {
                    return arr.getJSONObject(0).optString("username", "Duelista");
                }
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Failed to fetch username", e);
        }
        return "Duelista";
    }

    private String fetchDuelTcgType(String duelId, String accessToken) {
        try {
            URL url = new URL(API_BASE_URL + "/rest/v1/live_duels?select=tcg_type&id=eq." + duelId + "&limit=1");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", API_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            if (conn.getResponseCode() == 200) {
                JSONArray arr = new JSONArray(readStream(conn.getInputStream()));
                if (arr.length() > 0) {
                    return arr.getJSONObject(0).optString("tcg_type", "yugioh");
                }
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Failed to fetch duel tcg_type", e);
        }
        return "yugioh";
    }

    private String fetchRingtoneUrl(String tcgType, String accessToken) {
        String settingKey;
        switch (tcgType) {
            case "magic": settingKey = "ringtone_mtg"; break;
            case "pokemon": settingKey = "ringtone_pkm"; break;
            default: settingKey = "ringtone_ygo"; break;
        }
        try {
            URL url = new URL(API_BASE_URL + "/rest/v1/system_settings?select=value&key=eq." + settingKey + "&limit=1");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", API_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            if (conn.getResponseCode() == 200) {
                JSONArray arr = new JSONArray(readStream(conn.getInputStream()));
                if (arr.length() > 0) {
                    String val = arr.getJSONObject(0).optString("value", "");
                    if (!val.isEmpty()) {
                        int qIdx = val.indexOf("?t=");
                        return qIdx > 0 ? val.substring(0, qIdx) : val;
                    }
                }
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Failed to fetch ringtone URL for " + tcgType, e);
        }
        return null;
    }

    private void playCustomRingtone(String audioUrl) {
        stopCustomRingtone();
        synchronized (mediaPlayerLock) {
            try {
                mediaPlayer = new MediaPlayer();
                mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
                mediaPlayer.setDataSource(audioUrl);
                mediaPlayer.setLooping(true);
                mediaPlayer.prepareAsync();
                mediaPlayer.setOnPreparedListener(mp -> mp.start());
                mediaPlayer.setOnErrorListener((mp, what, extra) -> {
                    Log.e(TAG, "MediaPlayer error: " + what + "/" + extra);
                    return false;
                });
            } catch (Exception e) {
                Log.e(TAG, "Failed to play custom ringtone", e);
                mediaPlayer = null;
            }
        }
    }

    private void stopCustomRingtone() {
        synchronized (mediaPlayerLock) {
            if (mediaPlayer != null) {
                try {
                    if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                    mediaPlayer.release();
                } catch (Exception e) {
                    Log.w(TAG, "Error stopping MediaPlayer", e);
                }
                mediaPlayer = null;
            }
        }
    }

    private void wakeScreenAndOpenApp(String duelId, String inviteId, String senderName, String tcgType) {
        try {
            // Wake the screen
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wakeLock = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "duelverse:duelcall"
                );
                wakeLock.acquire(60000); // Keep screen on for 60s
            }

            // Dismiss keyguard
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                // requestDismissKeyguard needs an activity, handled by MainActivity
            }

            // Launch MainActivity with duel invite data
            Intent launchIntent = new Intent(this, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            launchIntent.putExtra("duel_invite", true);
            launchIntent.putExtra("invite_id", inviteId);
            launchIntent.putExtra("duel_id", duelId);
            launchIntent.putExtra("sender_name", senderName);
            launchIntent.putExtra("tcg_type", tcgType);
            startActivity(launchIntent);

            Log.d(TAG, "Woke screen and launched app for duel invite from " + senderName);
        } catch (Exception e) {
            Log.e(TAG, "Failed to wake screen / open app", e);
        }
    }

    private void showDuelInviteNotification(String inviteId, String duelId, String senderName, String tcgType) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        // Wake screen and open app automatically (like a phone call)
        wakeScreenAndOpenApp(duelId, inviteId, senderName, tcgType);

        // Accept action
        Intent acceptIntent = new Intent(this, NotificationService.class);
        acceptIntent.setAction(ACTION_ACCEPT_DUEL);
        acceptIntent.putExtra("invite_id", inviteId);
        acceptIntent.putExtra("duel_id", duelId);
        PendingIntent acceptPending = PendingIntent.getService(this, inviteId.hashCode() + 1, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Reject action
        Intent rejectIntent = new Intent(this, NotificationService.class);
        rejectIntent.setAction(ACTION_REJECT_DUEL);
        rejectIntent.putExtra("invite_id", inviteId);
        rejectIntent.putExtra("duel_id", duelId);
        PendingIntent rejectPending = PendingIntent.getService(this, inviteId.hashCode() + 2, rejectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Full-screen intent to open app like a call
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("duel_invite", true);
        fullScreenIntent.putExtra("invite_id", inviteId);
        fullScreenIntent.putExtra("duel_id", duelId);
        fullScreenIntent.putExtra("sender_name", senderName);
        fullScreenIntent.putExtra("tcg_type", tcgType);
        PendingIntent fullScreenPending = PendingIntent.getActivity(this, inviteId.hashCode() + 3,
            fullScreenIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String accessToken = preferences.getString(PREF_ACCESS_TOKEN, null);
        String ringtoneUrl = accessToken != null ? fetchRingtoneUrl(tcgType, accessToken) : null;

        String tcgLabel;
        switch (tcgType) {
            case "magic": tcgLabel = "MTG"; break;
            case "pokemon": tcgLabel = "PKM"; break;
            default: tcgLabel = "YGO"; break;
        }

        Notification notification = new NotificationCompat.Builder(this, DUEL_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("⚔️ Desafio de Duelo! [" + tcgLabel + "]")
            .setContentText(senderName + " te desafiou para um duelo de " + tcgLabel + "!")
            .setStyle(new NotificationCompat.BigTextStyle()
                .bigText(senderName + " te desafiou para um duelo de " + tcgLabel + "! Toque para aceitar ou recusar."))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(false)
            .setOngoing(true)
            .setContentIntent(fullScreenPending)
            .setFullScreenIntent(fullScreenPending, true) // Opens app like a phone call
            .setSound(null)
            .setVibrate(new long[]{0, 500, 200, 500, 200, 500})
            .addAction(android.R.drawable.ic_menu_call, "✅ Aceitar", acceptPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "❌ Recusar", rejectPending)
            .setTimeoutAfter(60000)
            .build();

        notificationManager.notify(inviteId.hashCode(), notification);

        if (ringtoneUrl != null && !ringtoneUrl.isEmpty()) {
            playCustomRingtone(ringtoneUrl);
            handler.postDelayed(this::stopCustomRingtone, 60000);
        }
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
            .setSound(null)
            .setDefaults(NotificationCompat.DEFAULT_VIBRATE)
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
        userChannel.setSound(null, null);

        NotificationChannel duelChannel = new NotificationChannel(
            DUEL_CHANNEL_ID,
            "Convites de Duelo",
            NotificationManager.IMPORTANCE_HIGH
        );
        duelChannel.setDescription("Notificações de convite para duelo com som de chamada");
        duelChannel.enableVibration(true);
        duelChannel.setVibrationPattern(new long[]{0, 500, 200, 500, 200, 500});
        duelChannel.setSound(null, null);

        NotificationChannel serviceChannel = new NotificationChannel(
            SERVICE_CHANNEL_ID,
            "DuelVerse em segundo plano",
            NotificationManager.IMPORTANCE_LOW
        );
        serviceChannel.setDescription("Mantém o monitoramento de notificações com o app fechado");

        manager.createNotificationChannel(userChannel);
        manager.createNotificationChannel(duelChannel);
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
        stopCustomRingtone();
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