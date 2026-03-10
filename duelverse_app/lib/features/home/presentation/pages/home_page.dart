import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String _username = '';
  int _duelcoinsBalance = 0;
  int _wins = 0;
  int _losses = 0;
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
      final profile = await SupabaseService.getProfile(userId);
      if (profile != null && mounted) {
        setState(() {
          _username = profile['username'] ?? 'Duelista';
          _duelcoinsBalance = profile['duelcoins_balance'] ?? 0;
          _wins = profile['wins'] ?? 0;
          _losses = profile['losses'] ?? 0;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : RefreshIndicator(
                onRefresh: _loadProfile,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Header
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Olá, $_username! 👋',
                                style: const TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                'Pronto para duelar?',
                                style: TextStyle(
                                  color: AppTheme.textSecondary,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                          // DuelCoins balance
                          GestureDetector(
                            onTap: () => context.push('/duel-coins'),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                gradient: AppTheme.goldGradient,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Row(
                                children: [
                                  const Icon(
                                    Icons.monetization_on,
                                    color: Colors.white,
                                    size: 18,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    '$_duelcoinsBalance DC',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 14,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // Stats cards
                      Row(
                        children: [
                          Expanded(
                            child: _StatCard(
                              icon: Icons.emoji_events,
                              label: 'Vitórias',
                              value: '$_wins',
                              color: AppTheme.successColor,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _StatCard(
                              icon: Icons.close,
                              label: 'Derrotas',
                              value: '$_losses',
                              color: AppTheme.errorColor,
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: _StatCard(
                              icon: Icons.percent,
                              label: 'Win Rate',
                              value: _wins + _losses > 0
                                  ? '${((_wins / (_wins + _losses)) * 100).toStringAsFixed(0)}%'
                                  : '0%',
                              color: AppTheme.secondaryColor,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // Quick actions
                      const Text(
                        'Ações Rápidas',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        mainAxisSpacing: 12,
                        crossAxisSpacing: 12,
                        childAspectRatio: 1.4,
                        children: [
                          _QuickActionCard(
                            icon: Icons.sports_kabaddi_rounded,
                            label: 'Novo Duelo',
                            gradient: AppTheme.mysticGradient,
                            onTap: () => context.go('/duels'),
                          ),
                          _QuickActionCard(
                            icon: Icons.emoji_events_rounded,
                            label: 'Torneios',
                            gradient: AppTheme.goldGradient,
                            onTap: () => context.go('/tournaments'),
                          ),
                          _QuickActionCard(
                            icon: Icons.style_rounded,
                            label: 'Deck Builder',
                            gradient: const LinearGradient(
                              colors: [
                                Color(0xFF3B82F6),
                                Color(0xFF1D4ED8),
                              ],
                            ),
                            onTap: () => context.go('/deck-builder'),
                          ),
                          _QuickActionCard(
                            icon: Icons.people_rounded,
                            label: 'Amigos',
                            gradient: const LinearGradient(
                              colors: [
                                Color(0xFF22C55E),
                                Color(0xFF16A34A),
                              ],
                            ),
                            onTap: () => context.go('/friends'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),

                      // More options
                      const Text(
                        'Mais',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _MenuTile(
                        icon: Icons.leaderboard_rounded,
                        label: 'Ranking',
                        onTap: () => context.push('/ranking'),
                      ),
                      _MenuTile(
                        icon: Icons.store_rounded,
                        label: 'Loja',
                        onTap: () => context.push('/store'),
                      ),
                      _MenuTile(
                        icon: Icons.chat_rounded,
                        label: 'Chat Global',
                        onTap: () => context.push('/chat'),
                      ),
                      _MenuTile(
                        icon: Icons.monetization_on_rounded,
                        label: 'DuelCoins',
                        onTap: () => context.push('/duel-coins'),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _StatCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.cardColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderColor),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: 8),
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              color: AppTheme.textMuted,
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final LinearGradient gradient;
  final VoidCallback onTap;

  const _QuickActionCard({
    required this.icon,
    required this.label,
    required this.gradient,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(16),
          boxShadow: [
            BoxShadow(
              color: gradient.colors.first.withOpacity(0.3),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white, size: 32),
            const SizedBox(height: 8),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _MenuTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: AppTheme.primaryColor.withOpacity(0.1),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: AppTheme.primaryColor, size: 20),
        ),
        title: Text(
          label,
          style: const TextStyle(
            color: AppTheme.textPrimary,
            fontWeight: FontWeight.w500,
          ),
        ),
        trailing: const Icon(
          Icons.chevron_right,
          color: AppTheme.textMuted,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppTheme.borderColor),
        ),
        tileColor: AppTheme.cardColor,
      ),
    );
  }
}
