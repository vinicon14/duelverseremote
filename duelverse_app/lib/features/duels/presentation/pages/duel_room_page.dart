import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

/// Full-screen duel room for active card game duels.
/// This is the most complex page - handles game state, realtime updates,
/// card placement, life points, and video calls.
class DuelRoomPage extends StatefulWidget {
  final String duelId;

  const DuelRoomPage({super.key, required this.duelId});

  @override
  State<DuelRoomPage> createState() => _DuelRoomPageState();
}

class _DuelRoomPageState extends State<DuelRoomPage> {
  Map<String, dynamic>? _duel;
  bool _isLoading = true;
  int _myLifePoints = 8000;
  int _opponentLifePoints = 8000;

  @override
  void initState() {
    super.initState();
    // Keep screen awake during duels
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _loadDuel();
    _subscribeToUpdates();
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  Future<void> _loadDuel() async {
    try {
      final data = await SupabaseService.client
          .from('live_duels')
          .select()
          .eq('id', widget.duelId)
          .single();

      if (mounted) {
        setState(() {
          _duel = data;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _subscribeToUpdates() {
    SupabaseService.client
        .channel('duel_${widget.duelId}')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'live_duels',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: widget.duelId,
          ),
          callback: (payload) {
            if (mounted) {
              setState(() {
                _duel = payload.newRecord;
              });
            }
          },
        )
        .subscribe();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_duel == null) {
      return Scaffold(
        backgroundColor: AppTheme.backgroundColor,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text(
                'Duelo não encontrado',
                style: TextStyle(color: AppTheme.textPrimary, fontSize: 18),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Voltar'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.backgroundColor,
      body: SafeArea(
        child: Column(
          children: [
            // Top bar - Opponent info
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppTheme.surfaceColor,
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: AppTheme.textPrimary),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const CircleAvatar(
                    radius: 18,
                    backgroundColor: AppTheme.errorColor,
                    child: Icon(Icons.person, color: Colors.white, size: 20),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Oponente',
                      style: TextStyle(
                        color: AppTheme.textPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  // Opponent LP
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.errorColor.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'LP: $_opponentLifePoints',
                      style: const TextStyle(
                        color: AppTheme.errorColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Game field
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      AppTheme.errorColor.withOpacity(0.05),
                      AppTheme.backgroundColor,
                      AppTheme.primaryColor.withOpacity(0.05),
                    ],
                  ),
                ),
                child: Column(
                  children: [
                    // Opponent's field
                    Expanded(
                      child: _FieldZone(
                        label: 'Campo do Oponente',
                        isOpponent: true,
                      ),
                    ),
                    // Divider
                    Container(
                      height: 2,
                      color: AppTheme.borderColor,
                    ),
                    // My field
                    Expanded(
                      child: _FieldZone(
                        label: 'Meu Campo',
                        isOpponent: false,
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom bar - My info
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppTheme.surfaceColor,
              child: Row(
                children: [
                  // My LP
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryColor.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'LP: $_myLifePoints',
                      style: const TextStyle(
                        color: AppTheme.primaryColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const Spacer(),
                  // Action buttons
                  IconButton(
                    icon: const Icon(Icons.chat_bubble_outline, color: AppTheme.textMuted),
                    onPressed: () {
                      // TODO: Open duel chat
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.videocam_outlined, color: AppTheme.textMuted),
                    onPressed: () {
                      // TODO: Toggle video call
                    },
                  ),
                  IconButton(
                    icon: const Icon(Icons.style_rounded, color: AppTheme.primaryColor),
                    onPressed: () {
                      // TODO: Open deck viewer
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FieldZone extends StatelessWidget {
  final String label;
  final bool isOpponent;

  const _FieldZone({required this.label, required this.isOpponent});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Monster zones (5 slots)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(5, (index) => _CardSlot(label: 'M${index + 1}')),
          ),
          const SizedBox(height: 8),
          // Spell/Trap zones (5 slots)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: List.generate(5, (index) => _CardSlot(label: 'S${index + 1}')),
          ),
        ],
      ),
    );
  }
}

class _CardSlot extends StatelessWidget {
  final String label;

  const _CardSlot({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 50,
      height: 70,
      decoration: BoxDecoration(
        border: Border.all(color: AppTheme.borderColor),
        borderRadius: BorderRadius.circular(6),
        color: AppTheme.surfaceColor.withOpacity(0.3),
      ),
      child: Center(
        child: Text(
          label,
          style: const TextStyle(
            color: AppTheme.textMuted,
            fontSize: 10,
          ),
        ),
      ),
    );
  }
}
