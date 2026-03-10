/// Environment configuration for Supabase and other services.
/// In production, use --dart-define or .env file loading.
class EnvConfig {
  EnvConfig._();

  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://xxttwzewtqxvpgefggah.supabase.co',
  );

  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'YOUR_SUPABASE_ANON_KEY_HERE',
  );
}
