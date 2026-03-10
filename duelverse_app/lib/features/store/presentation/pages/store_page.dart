import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// Store page - subscription plans, DuelCoins purchases.
class StorePage extends StatelessWidget {
  const StorePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Loja')),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.store_rounded, size: 64,
                color: AppTheme.primaryColor),
            SizedBox(height: 16),
            Text('Loja', style: TextStyle(fontSize: 24,
                fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            SizedBox(height: 8),
            Text('Em breve - Planos e DuelCoins',
                style: TextStyle(color: AppTheme.textMuted)),
          ],
        ),
      ),
    );
  }
}
