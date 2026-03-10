import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

class DuelsPage extends StatefulWidget {
  const DuelsPage({super.key});

  @override
  State<DuelsPage> createState() => _DuelsPageState();
}

class _DuelsPageState extends State<DuelsPage> {
  bool _isCreating = false;

  Future<void> _createDuel({bool isRanked = false}) async {
    final userId = SupabaseService.currentUserId;
    if (userId == null) return;

    setState(() => _isCreating = true);

    try {
      final data = await SupabaseService.client
          .from('live_duels')
          .insert({
            'creator_id': userId,
            'status': 'waiting',
            'is_ranked': isRanked,
          })
          .select()
          .single();

      if (mounted) {
        context.push('/duel/${data['id']}');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erro ao criar duelo: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _isCreating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: ShaderMask(
          shaderCallback: (bounds) =>
              AppTheme.mysticGradient.createShader(bounds),
          child: const Text(
            'Duelos',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Create duel cards
            const Text(
              'Iniciar Duelo',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 16),

            // Casual duel
            _DuelTypeCard(
              icon: Icons.sports_kabaddi_rounded,
              title: 'Duelo Casual',
              description: 'Jogue sem afetar seu ranking',
              gradient: AppTheme.mysticGradient,
              onTap: _isCreating ? null : () => _createDuel(isRanked: false),
            ),
            const SizedBox(height: 12),

            // Ranked duel
            _DuelTypeCard(
              icon: Icons.military_tech_rounded,
              title: 'Duelo Ranqueado',
              description: 'Suba no ranking e ganhe recompensas',
              gradient: AppTheme.goldGradient,
              onTap: _isCreating ? null : () => _createDuel(isRanked: true),
            ),
            const SizedBox(height: 12),

            // Matchmaking
            _DuelTypeCard(
              icon: Icons.search_rounded,
              title: 'Matchmaking',
              description: 'Encontre um oponente automaticamente',
              gradient: const LinearGradient(
                colors: [Color(0xFF22C55E), Color(0xFF16A34A)],
              ),
              onTap: () {
                // TODO: Implement matchmaking
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Matchmaking em breve!')),
                );
              },
            ),

            const SizedBox(height: 24),

            // Active duels section
            const Text(
              'Duelos Ativos',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w600,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 12),

            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.sports_kabaddi_rounded,
                      size: 64,
                      color: AppTheme.primaryColor.withOpacity(0.3),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      'Nenhum duelo ativo',
                      style: TextStyle(
                        fontSize: 16,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DuelTypeCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final LinearGradient gradient;
  final VoidCallback? onTap;

  const _DuelTypeCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.gradient,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
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
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 36),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios, color: Colors.white54, size: 18),
          ],
        ),
      ),
    );
  }
}
