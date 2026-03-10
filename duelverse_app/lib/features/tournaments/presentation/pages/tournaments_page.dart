import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

class TournamentsPage extends StatefulWidget {
  const TournamentsPage({super.key});

  @override
  State<TournamentsPage> createState() => _TournamentsPageState();
}

class _TournamentsPageState extends State<TournamentsPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Map<String, dynamic>> _tournaments = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _fetchTournaments();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchTournaments() async {
    try {
      final data = await SupabaseService.client
          .from('tournaments')
          .select('*, tournament_participants(count)')
          .order('start_date', ascending: true);

      if (mounted) {
        setState(() {
          _tournaments = List<Map<String, dynamic>>.from(data);
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  List<Map<String, dynamic>> _filterByStatus(String status) {
    return _tournaments.where((t) => t['status'] == status).toList();
  }

  @override
  Widget build(BuildContext context) {
    final upcoming = _filterByStatus('upcoming');
    final active = _filterByStatus('active');
    final completed = _filterByStatus('completed');

    return Scaffold(
      appBar: AppBar(
        title: ShaderMask(
          shaderCallback: (bounds) =>
              AppTheme.mysticGradient.createShader(bounds),
          child: const Text(
            'Torneios',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(text: 'Em Breve (${upcoming.length})'),
            Tab(text: 'Ativos (${active.length})'),
            Tab(text: 'Finalizados (${completed.length})'),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _TournamentList(
                  tournaments: upcoming,
                  emptyMessage: 'Nenhum torneio disponível',
                ),
                _TournamentList(
                  tournaments: active,
                  emptyMessage: 'Nenhum torneio ativo',
                ),
                _TournamentList(
                  tournaments: completed,
                  emptyMessage: 'Nenhum torneio finalizado',
                ),
              ],
            ),
    );
  }
}

class _TournamentList extends StatelessWidget {
  final List<Map<String, dynamic>> tournaments;
  final String emptyMessage;

  const _TournamentList({
    required this.tournaments,
    required this.emptyMessage,
  });

  @override
  Widget build(BuildContext context) {
    if (tournaments.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.emoji_events_rounded,
              size: 64,
              color: AppTheme.primaryColor.withOpacity(0.3),
            ),
            const SizedBox(height: 16),
            Text(
              emptyMessage,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: tournaments.length,
      itemBuilder: (context, index) {
        final tournament = tournaments[index];
        return _TournamentCard(tournament: tournament);
      },
    );
  }
}

class _TournamentCard extends StatelessWidget {
  final Map<String, dynamic> tournament;

  const _TournamentCard({required this.tournament});

  @override
  Widget build(BuildContext context) {
    final name = tournament['name'] ?? 'Torneio';
    final description = tournament['description'] ?? '';
    final prizePool = tournament['prize_pool'] ?? 0;
    final maxParticipants = tournament['max_participants'] ?? 32;
    final participantCount =
        tournament['tournament_participants']?[0]?['count'] ?? 0;
    final isWeekly = tournament['is_weekly'] == true;
    final status = tournament['status'] ?? 'upcoming';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: () => context.push('/tournaments/${tournament['id']}'),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      name,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ),
                  if (isWeekly)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.accentColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        '🏆 Semanal',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppTheme.accentColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                ],
              ),
              if (description.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  description,
                  style: const TextStyle(
                    color: AppTheme.textSecondary,
                    fontSize: 13,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
              const SizedBox(height: 12),
              Row(
                children: [
                  _InfoChip(
                    icon: Icons.monetization_on,
                    label: '$prizePool DC',
                    color: AppTheme.accentColor,
                  ),
                  const SizedBox(width: 12),
                  _InfoChip(
                    icon: Icons.people,
                    label: '$participantCount/$maxParticipants',
                    color: AppTheme.secondaryColor,
                  ),
                  const Spacer(),
                  _StatusBadge(status: status),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _InfoChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            color: color,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final String status;

  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    Color color;
    String label;

    switch (status) {
      case 'upcoming':
        color = AppTheme.secondaryColor;
        label = 'Em Breve';
        break;
      case 'active':
        color = AppTheme.successColor;
        label = 'Ativo';
        break;
      case 'completed':
        color = AppTheme.textMuted;
        label = 'Finalizado';
        break;
      default:
        color = AppTheme.textMuted;
        label = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
