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
    final authState = ref.watch(authProvider);

    // Setup router
    final router = GoRouter(
      initialLocation: authState.jwt != null ? '/dashboard' : '/login',
      redirect: (context, state) {
        final loggedIn = ref.read(authProvider).jwt != null;
        final user = ref.read(authProvider).user;
        final goingToLogin = state.matchedLocation == '/login';

        // 1. If not logged in and not going to login page, send to login
        if (!loggedIn && !goingToLogin) {
          return '/login';
        }

        // 2. If logged in but username is not configured, redirect to username setup
        if (loggedIn) {
          final hasNoUsername = user != null && user.username.isEmpty;
          if (hasNoUsername && state.matchedLocation != '/setup-username') {
            return '/setup-username';
          }
          // If already has username, don't let them stay on setup or login
          if (!hasNoUsername && (goingToLogin || state.matchedLocation == '/setup-username')) {
            return '/dashboard';
          }
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
          path: '/chat/:chatId',
          builder: (context, state) {
            final chatId = state.pathParameters['chatId']!;
            return ChatScreen(chatId: chatId);
          },
        ),
      ],
    );

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
