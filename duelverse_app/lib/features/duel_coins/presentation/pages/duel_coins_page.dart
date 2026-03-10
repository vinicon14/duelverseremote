import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

/// DuelCoins page - balance, transfer, transaction history.
class DuelCoinsPage extends StatefulWidget {
  const DuelCoinsPage({super.key});

  @override
  State<DuelCoinsPage> createState() => _DuelCoinsPageState();
}

class _DuelCoinsPageState extends State<DuelCoinsPage> {
  int _balance = 0;
  List<Map<String, dynamic>> _transactions = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    final userId = SupabaseService.currentUserId;
    if (userId == null) return;

    try {
      final balance = await SupabaseService.getDuelCoinsBalance(userId);
      final txData = await SupabaseService.client
          .from('duelcoins_transactions')
          .select()
          .or('sender_id.eq.$userId,receiver_id.eq.$userId')
          .order('created_at', ascending: false)
          .limit(20);

      if (mounted) {
        setState(() {
          _balance = balance;
          _transactions = List<Map<String, dynamic>>.from(txData);
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
      appBar: AppBar(title: const Text('DuelCoins')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  // Balance card
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      gradient: AppTheme.goldGradient,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      children: [
                        const Icon(Icons.monetization_on, color: Colors.white, size: 48),
                        const SizedBox(height: 12),
                        Text(
                          '$_balance DC',
                          style: const TextStyle(
                            fontSize: 36,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                        const Text(
                          'Saldo Atual',
                          style: TextStyle(color: Colors.white70, fontSize: 14),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Actions
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () {
                            // TODO: Transfer
                          },
                          icon: const Icon(Icons.send_rounded),
                          label: const Text('Transferir'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            // TODO: Buy
                          },
                          icon: const Icon(Icons.add_circle_outline),
                          label: const Text('Comprar'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Transaction history
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Histórico',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_transactions.isEmpty)
                    const Text('Nenhuma transação', style: TextStyle(color: AppTheme.textMuted))
                  else
                    ...(_transactions.map((tx) {
                      final isSender = tx['sender_id'] == SupabaseService.currentUserId;
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.cardColor,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: AppTheme.borderColor),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              isSender ? Icons.arrow_upward : Icons.arrow_downward,
                              color: isSender ? AppTheme.errorColor : AppTheme.successColor,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                tx['description'] ?? tx['transaction_type'] ?? 'Transação',
                                style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              '${isSender ? "-" : "+"}${tx['amount'] ?? 0} DC',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: isSender ? AppTheme.errorColor : AppTheme.successColor,
                              ),
                            ),
                          ],
                        ),
                      );
                    })),
                ],
              ),
            ),
    );
  }
}
