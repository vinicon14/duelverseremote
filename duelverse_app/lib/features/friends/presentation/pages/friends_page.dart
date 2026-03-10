import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../core/services/supabase_service.dart';

/// Friends page - view friends list, online status, send/accept requests.
class FriendsPage extends StatefulWidget {
  const FriendsPage({super.key});

  @override
  State<FriendsPage> createState() => _FriendsPageState();
}

class _FriendsPageState extends State<FriendsPage> {
  List<Map<String, dynamic>> _friends = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadFriends();
  }

  Future<void> _loadFriends() async {
    final userId = SupabaseService.currentUserId;
    if (userId == null) return;

    try {
      final data = await SupabaseService.client
          .from('friendships')
          .select('*, friend:profiles!friendships_friend_id_fkey(*)')
          .eq('user_id', userId)
          .eq('status', 'accepted');

      if (mounted) {
        setState(() {
          _friends = List<Map<String, dynamic>>.from(data);
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
        title: ShaderMask(
          shaderCallback: (bounds) =>
              AppTheme.mysticGradient.createShader(bounds),
          child: const Text(
            'Amigos',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_rounded),
            onPressed: () {
              // TODO: Add friend dialog
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _friends.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.people_rounded, size: 64,
                          color: AppTheme.primaryColor.withOpacity(0.3)),
                      const SizedBox(height: 16),
                      const Text('Nenhum amigo ainda',
                          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600,
                              color: AppTheme.textSecondary)),
                      const SizedBox(height: 8),
                      const Text('Adicione amigos para jogar juntos!',
                          style: TextStyle(color: AppTheme.textMuted)),
                    ],
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _friends.length,
                  itemBuilder: (context, index) {
                    final friend = _friends[index]['friend'] ?? {};
                    final username = friend['username'] ?? 'Duelista';
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: AppTheme.primaryColor,
                        child: Text(username[0].toUpperCase(),
                            style: const TextStyle(color: Colors.white)),
                      ),
                      title: Text(username,
                          style: const TextStyle(color: AppTheme.textPrimary)),
                      trailing: IconButton(
                        icon: const Icon(Icons.chat_rounded, color: AppTheme.primaryColor),
                        onPressed: () => context.push('/chat/${friend['user_id']}'),
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                        side: const BorderSide(color: AppTheme.borderColor),
                      ),
                      tileColor: AppTheme.cardColor,
                    );
                  },
                ),
    );
  }
}
