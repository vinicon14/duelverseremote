import 'dart:io';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Service for handling push notifications via Firebase Cloud Messaging
/// and local notifications.
class NotificationService {
  NotificationService._();

  static final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static Future<void> initialize() async {
    // Initialize local notifications
    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosSettings = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    const initSettings = InitializationSettings(
      android: androidSettings,
      iOS: iosSettings,
    );

    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onNotificationTapped,
    );

    // Request permissions on iOS
    if (Platform.isIOS) {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              IOSFlutterLocalNotificationsPlugin>()
          ?.requestPermissions(
            alert: true,
            badge: true,
            sound: true,
          );
    }

    // Request permissions on Android 13+
    if (Platform.isAndroid) {
      await _localNotifications
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
    }

    // TODO: Initialize Firebase Messaging
    // await FirebaseMessaging.instance.requestPermission();
    // FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    // FirebaseMessaging.onBackgroundMessage(_handleBackgroundMessage);
  }

  static void _onNotificationTapped(NotificationResponse response) {
    // Handle notification tap - navigate to appropriate screen
    final payload = response.payload;
    if (payload != null) {
      // Parse payload and navigate
      // e.g., {"type": "duel_invite", "duel_id": "123"}
    }
  }

  /// Show a local notification
  static Future<void> showNotification({
    required int id,
    required String title,
    required String body,
    String? payload,
  }) async {
    const androidDetails = AndroidNotificationDetails(
      'duelverse_channel',
      'Duelverse',
      channelDescription: 'Duelverse game notifications',
      importance: Importance.high,
      priority: Priority.high,
      showWhen: true,
      icon: '@mipmap/ic_launcher',
    );

    const iosDetails = DarwinNotificationDetails(
      presentAlert: true,
      presentBadge: true,
      presentSound: true,
    );

    const details = NotificationDetails(
      android: androidDetails,
      iOS: iosDetails,
    );

    await _localNotifications.show(id, title, body, details, payload: payload);
  }

  /// Show duel invite notification
  static Future<void> showDuelInvite({
    required String senderName,
    required String duelId,
  }) async {
    await showNotification(
      id: duelId.hashCode,
      title: '⚔️ Convite de Duelo',
      body: '$senderName te desafiou para um duelo!',
      payload: '{"type":"duel_invite","duel_id":"$duelId"}',
    );
  }

  /// Show tournament update notification
  static Future<void> showTournamentUpdate({
    required String tournamentName,
    required String message,
    required String tournamentId,
  }) async {
    await showNotification(
      id: tournamentId.hashCode,
      title: '🏆 $tournamentName',
      body: message,
      payload: '{"type":"tournament","tournament_id":"$tournamentId"}',
    );
  }

  /// Show friend request notification
  static Future<void> showFriendRequest({
    required String senderName,
    required String requestId,
  }) async {
    await showNotification(
      id: requestId.hashCode,
      title: '👋 Pedido de Amizade',
      body: '$senderName quer ser seu amigo!',
      payload: '{"type":"friend_request","request_id":"$requestId"}',
    );
  }

  /// Show chat message notification
  static Future<void> showChatMessage({
    required String senderName,
    required String message,
    required String chatId,
  }) async {
    await showNotification(
      id: chatId.hashCode,
      title: senderName,
      body: message,
      payload: '{"type":"chat","chat_id":"$chatId"}',
    );
  }
}
