import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

/// Friend chat page - private chat between two friends.
class FriendChatPage extends StatelessWidget {
  final String friendId;

  const FriendChatPage({super.key, required this.friendId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Chat')),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.chat_rounded, size: 64, color: AppTheme.primaryColor),
            SizedBox(height: 16),
            Text('Chat Privado', style: TextStyle(fontSize: 24,
                fontWeight: FontWeight.w700, color: AppTheme.textPrimary)),
            SizedBox(height: 8),
            Text('Em desenvolvimento...', style: TextStyle(color: AppTheme.textMuted)),
          ],
        ),
      ),
    );
  }
}
