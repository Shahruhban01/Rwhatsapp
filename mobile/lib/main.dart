import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'services/firebase_service.dart';
import 'providers/auth_provider.dart';
import 'features/auth/login_screen.dart';
import 'features/auth/username_screen.dart';
import 'features/auth/qr_scanner_screen.dart';
import 'features/auth/linked_devices_screen.dart';
import 'features/chat/dashboard_screen.dart';
import 'features/chat/chat_screen.dart';
import 'features/profile/settings_screen.dart';
import 'features/profile/profile_settings_screen.dart';
import 'features/profile/blocked_users_screen.dart';
import 'features/chat/archived_chats_screen.dart';
import 'features/chat/status_creator_screen.dart';

// Helper class to convert Stream to Listenable for GoRouter
class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream stream) {
    notifyListeners();
    _subscription = stream.asBroadcastStream().listen((_) => notifyListeners());
  }

  late final StreamSubscription _subscription;

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }
}

// Router provider to avoid re-creation of GoRouter instance on rebuild
final routerProvider = Provider<GoRouter>((ref) {
  final listenable = GoRouterRefreshStream(ref.read(authProvider.notifier).stream);
  ref.onDispose(() => listenable.dispose());

  return GoRouter(
    initialLocation: ref.read(authProvider).jwt != null ? '/dashboard' : '/login',
    refreshListenable: listenable,
    redirect: (context, state) {
      final authState = ref.read(authProvider);
      final loggedIn = authState.jwt != null;
      final goingToLogin = state.matchedLocation == '/login';

      if (!loggedIn && !goingToLogin) {
        return '/login';
      }

      if (loggedIn && goingToLogin) {
        return '/dashboard';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/setup-username',
        builder: (context, state) => const UsernameScreen(),
      ),
      GoRoute(
        path: '/dashboard',
        builder: (context, state) => const DashboardScreen(),
      ),
      GoRoute(
        path: '/link-device',
        builder: (context, state) => const QrScannerScreen(),
      ),
      GoRoute(
        path: '/linked-devices',
        builder: (context, state) => const LinkedDevicesScreen(),
      ),
      GoRoute(
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/settings/profile',
        builder: (context, state) => const ProfileSettingsScreen(),
      ),
      GoRoute(
        path: '/settings/blocked',
        builder: (context, state) => const BlockedUsersScreen(),
      ),
      GoRoute(
        path: '/archived-chats',
        builder: (context, state) => const ArchivedChatsScreen(),
      ),
      GoRoute(
        path: '/status/create',
        builder: (context, state) => const StatusCreatorScreen(),
      ),
      GoRoute(
        path: '/chat/:chatId',
        builder: (context, state) {
          final chatId = state.pathParameters['chatId']!;
          return ChatScreen(chatId: chatId);
        },
      ),
    ],
  );
});

void main() async {
  // 1. Initialize Firebase with Emulators configuration
  await FirebaseService.init();

  // 2. Start the App
  runApp(
    const ProviderScope(
      child: MyApp(),
    ),
  );
}

class MyApp extends ConsumerWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'WhatsApp Clone',
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF00A884),
          surface: Color(0xFF111B21),
          background: Color(0xFF0B141A),
        ),
        scaffoldBackgroundColor: const Color(0xFF0B141A),
        useMaterial3: true,
      ),
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
