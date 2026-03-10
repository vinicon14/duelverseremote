import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

/// Profile page - view/edit user profile, avatar, stats, settings.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  Map<String, dynamic>? _profile;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final userId = SupabaseService.currentUserId;
    if (userId == null) return;

    try {
      final data = await SupabaseService.getProfile(userId);
      if (mounted) {
        setState(() {
          _profile = data;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _signOut() async {
    await SupabaseService.signOut();
    if (mounted) context.go('/auth');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Perfil'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_rounded),
            onPressed: () {
              // TODO: Settings page
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Avatar
                  CircleAvatar(
                    radius: 50,
                    backgroundColor: AppTheme.primaryColor,
                    child: Text(
                      (_profile?['username'] ?? 'D')[0].toUpperCase(),
                      style: const TextStyle(
                        fontSize: 36,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _profile?['username'] ?? 'Duelista',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    SupabaseService.currentUser?.email ?? '',
                    style: const TextStyle(color: AppTheme.textMuted),
                  ),
                  const SizedBox(height: 24),

                  // Stats
                  Row(
                    children: [
                      _StatTile(
                        label: 'Vitórias',
                        value: '${_profile?['wins'] ?? 0}',
                        color: AppTheme.successColor,
                      ),
                      _StatTile(
                        label: 'Derrotas',
                        value: '${_profile?['losses'] ?? 0}',
                        color: AppTheme.errorColor,
                      ),
                      _StatTile(
                        label: 'DuelCoins',
                        value: '${_profile?['duelcoins_balance'] ?? 0}',
                        color: AppTheme.accentColor,
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Menu items
                  _MenuItem(
                    icon: Icons.edit_rounded,
                    label: 'Editar Perfil',
                    onTap: () {
                      // TODO: Edit profile
                    },
                  ),
                  _MenuItem(
                    icon: Icons.lock_rounded,
                    label: 'Alterar Senha',
                    onTap: () {
                      // TODO: Change password
                    },
                  ),
                  _MenuItem(
                    icon: Icons.history_rounded,
                    label: 'Histórico de Transações',
                    onTap: () {
                      // TODO: Transaction history
                    },
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _signOut,
                      icon: const Icon(Icons.logout_rounded, color: AppTheme.errorColor),
                      label: const Text('Sair', style: TextStyle(color: AppTheme.errorColor)),
                      style: OutlinedButton.styleFrom(
                        side: const BorderSide(color: AppTheme.errorColor),
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatTile({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 4),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppTheme.cardColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.borderColor),
        ),
        child: Column(
          children: [
            Text(value, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: color)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 11, color: AppTheme.textMuted)),
          ],
        ),
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _MenuItem({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        leading: Icon(icon, color: AppTheme.primaryColor),
        title: Text(label, style: const TextStyle(color: AppTheme.textPrimary)),
        trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppTheme.borderColor),
        ),
        tileColor: AppTheme.cardColor,
      ),
    );
  }
}
