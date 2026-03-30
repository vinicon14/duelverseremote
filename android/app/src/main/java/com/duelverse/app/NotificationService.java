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
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

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
        try {
            SharedPreferences prefs = getSharedPreferences("duelverse", MODE_PRIVATE);
            String userId = prefs.getString("user_id", null);

            if (userId == null || userId.isEmpty()) {
                Log.d(TAG, "No user_id saved, skipping poll");
                return;
            }

            String urlStr = SUPABASE_URL + "/rest/v1/notifications"
                + "?user_id=eq." + userId
                + "&read=eq.false"
                + "&order=created_at.desc"
                + "&limit=5"
                + "&select=id,title,message,created_at";

            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("apikey", SUPABASE_ANON_KEY);
            conn.setRequestProperty("Authorization", "Bearer " + SUPABASE_ANON_KEY);
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

                JSONArray notifications = new JSONArray(response.toString());
                if (notifications.length() > 0) {
                    JSONObject latest = notifications.getJSONObject(0);
                    String id = latest.getString("id");

                    if (!id.equals(lastNotificationId)) {
                        lastNotificationId = id;
                        String title = latest.getString("title");
                        String message = latest.getString("message");

                        NotificationHelper.showNotification(NotificationService.this, title, message);
                    }
                }
            }

            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Error checking notifications: " + e.getMessage());
        }
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