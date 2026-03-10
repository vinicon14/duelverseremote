import 'package:supabase_flutter/supabase_flutter.dart';

/// Centralized Supabase client access and helper methods.
class SupabaseService {
  SupabaseService._();

  static SupabaseClient get client => Supabase.instance.client;

  static User? get currentUser => client.auth.currentUser;

  static String? get currentUserId => currentUser?.id;

  static bool get isAuthenticated => currentUser != null;

  static Stream<AuthState> get authStateChanges =>
      client.auth.onAuthStateChange;

  // Auth methods
  static Future<AuthResponse> signInWithEmail({
    required String email,
    required String password,
  }) async {
    return await client.auth.signInWithPassword(
      email: email,
      password: password,
    );
  }

  static Future<AuthResponse> signUpWithEmail({
    required String email,
    required String password,
    String? username,
  }) async {
    return await client.auth.signUp(
      email: email,
      password: password,
      data: username != null ? {'username': username} : null,
    );
  }

  static Future<void> signOut() async {
    await client.auth.signOut();
  }

  static Future<void> resetPassword(String email) async {
    await client.auth.resetPasswordForEmail(email);
  }

  // Profile methods
  static Future<Map<String, dynamic>?> getProfile(String userId) async {
    final response = await client
        .from('profiles')
        .select()
        .eq('user_id', userId)
        .single();
    return response;
  }

  static Future<void> updateProfile({
    required String userId,
    required Map<String, dynamic> data,
  }) async {
    await client.from('profiles').update(data).eq('user_id', userId);
  }

  // DuelCoins
  static Future<int> getDuelCoinsBalance(String userId) async {
    final response = await client
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', userId)
        .single();
    return response['duelcoins_balance'] ?? 0;
  }

  // Realtime subscriptions
  static RealtimeChannel subscribeToChannel(String channelName) {
    return client.channel(channelName);
  }

  // RPC calls
  static Future<dynamic> rpc(String functionName,
      {Map<String, dynamic>? params}) async {
    return await client.rpc(functionName, params: params ?? {});
  }
}
