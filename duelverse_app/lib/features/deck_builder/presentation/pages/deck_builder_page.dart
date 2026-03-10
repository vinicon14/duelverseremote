import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

/// Deck Builder page - allows users to search cards, build and save decks.
class DeckBuilderPage extends StatefulWidget {
  const DeckBuilderPage({super.key});

  @override
  State<DeckBuilderPage> createState() => _DeckBuilderPageState();
}

class _DeckBuilderPageState extends State<DeckBuilderPage> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _searchResults = [];
  List<Map<String, dynamic>> _mainDeck = [];
  List<Map<String, dynamic>> _extraDeck = [];
  List<Map<String, dynamic>> _sideDeck = [];
  bool _isSearching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _searchCards(String query) async {
    if (query.length < 3) return;
    setState(() => _isSearching = true);

    try {
      // Search using YGOProDeck API
      final response = await SupabaseService.client.functions.invoke(
        'recognize-cards',
        body: {'query': query},
      );
      // TODO: Implement card search via API
      setState(() => _isSearching = false);
    } catch (e) {
      setState(() => _isSearching = false);
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
            'Deck Builder',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.save_rounded),
            onPressed: () {
              // TODO: Save deck
            },
          ),
          IconButton(
            icon: const Icon(Icons.folder_open_rounded),
            onPressed: () {
              // TODO: Load deck
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Buscar cartas...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _isSearching
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      )
                    : null,
              ),
              onChanged: _searchCards,
            ),
          ),

          // Deck stats
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                _DeckCounter(
                  label: 'Main',
                  count: _mainDeck.length,
                  max: 60,
                  color: AppTheme.primaryColor,
                ),
                const SizedBox(width: 12),
                _DeckCounter(
                  label: 'Extra',
                  count: _extraDeck.length,
                  max: 15,
                  color: AppTheme.accentColor,
                ),
                const SizedBox(width: 12),
                _DeckCounter(
                  label: 'Side',
                  count: _sideDeck.length,
                  max: 15,
                  color: AppTheme.secondaryColor,
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Deck content area
          Expanded(
            child: _mainDeck.isEmpty && _extraDeck.isEmpty && _sideDeck.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.style_rounded,
                          size: 64,
                          color: AppTheme.primaryColor.withOpacity(0.3),
                        ),
                        const SizedBox(height: 16),
                        const Text(
                          'Seu deck está vazio',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Busque cartas acima para adicionar ao deck',
                          style: TextStyle(
                            color: AppTheme.textMuted,
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_mainDeck.isNotEmpty) ...[
                        const Text(
                          'Main Deck',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 8),
                        // TODO: Card grid
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _DeckCounter extends StatelessWidget {
  final String label;
  final int count;
  final int max;
  final Color color;

  const _DeckCounter({
    required this.label,
    required this.count,
    required this.max,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Column(
          children: [
            Text(
              '$count/$max',
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                color: color.withOpacity(0.7),
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
