import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

class TournamentDetailPage extends StatefulWidget {
  final String tournamentId;

  const TournamentDetailPage({super.key, required this.tournamentId});

  @override
  State<TournamentDetailPage> createState() => _TournamentDetailPageState();
}

class _TournamentDetailPageState extends State<TournamentDetailPage> {
  Map<String, dynamic>? _tournament;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchTournament();
  }

  Future<void> _fetchTournament() async {
    try {
      final data = await SupabaseService.client
          .from('tournaments')
          .select('*, tournament_participants(count)')
          .eq('id', widget.tournamentId)
          .single();

      if (mounted) {
        setState(() {
          _tournament = data;
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
      appBar: AppBar(
        title: Text(_tournament?['name'] ?? 'Torneio'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _tournament == null
              ? const Center(child: Text('Torneio não encontrado'))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Tournament header
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          gradient: AppTheme.mysticGradient,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: Column(
                          children: [
                            const Icon(
                              Icons.emoji_events_rounded,
                              color: Colors.white,
                              size: 48,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _tournament!['name'] ?? '',
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Prêmio: ${_tournament!['prize_pool'] ?? 0} DC',
                              style: const TextStyle(
                                fontSize: 18,
                                color: Colors.white70,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Description
                      if (_tournament!['description'] != null) ...[
                        const Text(
                          'Descrição',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _tournament!['description'],
                          style: const TextStyle(
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 20),
                      ],

                      // Info cards
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            children: [
                              _InfoRow(
                                icon: Icons.people,
                                label: 'Participantes',
                                value:
                                    '${_tournament!['tournament_participants']?[0]?['count'] ?? 0}/${_tournament!['max_participants'] ?? 32}',
                              ),
                              const Divider(),
                              _InfoRow(
                                icon: Icons.monetization_on,
                                label: 'Taxa de Inscrição',
                                value:
                                    '${_tournament!['entry_fee'] ?? 0} DC',
                              ),
                              const Divider(),
                              _InfoRow(
                                icon: Icons.calendar_today,
                                label: 'Status',
                                value: _tournament!['status'] ?? 'upcoming',
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Join button
                      if (_tournament!['status'] == 'upcoming')
                        SizedBox(
                          width: double.infinity,
                          height: 52,
                          child: ElevatedButton(
                            onPressed: () {
                              // TODO: Implement join tournament
                            },
                            child: const Text('Participar do Torneio'),
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 20, color: AppTheme.primaryColor),
          const SizedBox(width: 12),
          Text(
            label,
            style: const TextStyle(color: AppTheme.textSecondary),
          ),
          const Spacer(),
          Text(
            value,
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              color: AppTheme.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}
