import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../features/auth/presentation/pages/auth_page.dart';
import '../../features/home/presentation/pages/home_page.dart';
import '../../features/tournaments/presentation/pages/tournaments_page.dart';
import '../../features/tournaments/presentation/pages/tournament_detail_page.dart';
import '../../features/duels/presentation/pages/duels_page.dart';
import '../../features/duels/presentation/pages/duel_room_page.dart';
import '../../features/deck_builder/presentation/pages/deck_builder_page.dart';
import '../../features/friends/presentation/pages/friends_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';
import '../../features/store/presentation/pages/store_page.dart';
import '../../features/ranking/presentation/pages/ranking_page.dart';
import '../../features/chat/presentation/pages/global_chat_page.dart';
import '../../features/chat/presentation/pages/friend_chat_page.dart';
import '../../features/duel_coins/presentation/pages/duel_coins_page.dart';
import '../../shared/widgets/main_scaffold.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final session = Supabase.instance.client.auth.currentSession;
      final isLoggedIn = session != null;
      final isAuthRoute = state.matchedLocation == '/auth';

      if (!isLoggedIn && !isAuthRoute) {
        return '/auth';
      }
      if (isLoggedIn && isAuthRoute) {
        return '/';
      }
      return null;
    },
    routes: [
      // Auth route (no scaffold)
      GoRoute(
        path: '/auth',
        builder: (context, state) => const AuthPage(),
      ),

      // Main app with bottom navigation
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(
            path: '/',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: HomePage(),
            ),
          ),
          GoRoute(
            path: '/tournaments',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: TournamentsPage(),
            ),
            routes: [
              GoRoute(
                path: ':id',
                builder: (context, state) => TournamentDetailPage(
                  tournamentId: state.pathParameters['id']!,
                ),
              ),
            ],
          ),
          GoRoute(
            path: '/duels',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: DuelsPage(),
            ),
          ),
          GoRoute(
            path: '/deck-builder',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: DeckBuilderPage(),
            ),
          ),
          GoRoute(
            path: '/friends',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: FriendsPage(),
            ),
          ),
          GoRoute(
            path: '/profile',
            pageBuilder: (context, state) => const NoTransitionPage(
              child: ProfilePage(),
            ),
          ),
          GoRoute(
            path: '/store',
            builder: (context, state) => const StorePage(),
          ),
          GoRoute(
            path: '/ranking',
            builder: (context, state) => const RankingPage(),
          ),
          GoRoute(
            path: '/chat',
            builder: (context, state) => const GlobalChatPage(),
          ),
          GoRoute(
            path: '/chat/:friendId',
            builder: (context, state) => FriendChatPage(
              friendId: state.pathParameters['friendId']!,
            ),
          ),
          GoRoute(
            path: '/duel-coins',
            builder: (context, state) => const DuelCoinsPage(),
          ),
        ],
      ),

      // Duel room (full screen, no scaffold)
      GoRoute(
        path: '/duel/:id',
        builder: (context, state) => DuelRoomPage(
          duelId: state.pathParameters['id']!,
        ),
      ),
    ],
  );
});
