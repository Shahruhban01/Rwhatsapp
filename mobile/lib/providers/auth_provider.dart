import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config.dart';

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier();
});

class AuthState {
  final bool loading;
  final String? error;
  final String? jwt;
  final UserModel? user;
  final List<ActiveSession> sessions;

  AuthState({
    this.loading = false,
    this.error,
    this.jwt,
    this.user,
    this.sessions = const [],
  });

  AuthState copyWith({
    bool? loading,
    String? error,
    String? jwt,
    UserModel? user,
    List<ActiveSession>? sessions,
  }) {
    return AuthState(
      loading: loading ?? this.loading,
      error: error,
      jwt: jwt ?? this.jwt,
      user: user ?? this.user,
      sessions: sessions ?? this.sessions,
    );
  }
}

class ActiveSession {
  final String sessionId;
  final String deviceName;
  final String platform;
  final String ipAddress;
  final String? createdAt;
  final String? lastActiveAt;

  ActiveSession({
    required this.sessionId,
    required this.deviceName,
    required this.platform,
    required this.ipAddress,
    this.createdAt,
    this.lastActiveAt,
  });

  factory ActiveSession.fromJson(Map<String, dynamic> json) {
    return ActiveSession(
      sessionId: json['sessionId'] ?? '',
      deviceName: json['deviceName'] ?? '',
      platform: json['platform'] ?? '',
      ipAddress: json['ipAddress'] ?? '',
      createdAt: json['createdAt'],
      lastActiveAt: json['lastActiveAt'],
    );
  }
}

class UserModel {
  final String userId;
  final String username;
  final String name;
  final String about;
  final String? profilePhotoUrl;

  UserModel({
    required this.userId,
    required this.username,
    required this.name,
    required this.about,
    this.profilePhotoUrl,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      userId: json['userId'] ?? '',
      username: json['username'] ?? '',
      name: json['name'] ?? '',
      about: json['about'] ?? '',
      profilePhotoUrl: json['profilePhotoUrl'],
    );
  }

  UserModel copyWith({
    String? username,
    String? name,
    String? about,
    String? profilePhotoUrl,
  }) {
    return UserModel(
      userId: this.userId,
      username: username ?? this.username,
      name: name ?? this.name,
      about: about ?? this.about,
      profilePhotoUrl: profilePhotoUrl ?? this.profilePhotoUrl,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  final Dio _dio = Dio();

  AuthNotifier() : super(AuthState()) {
    _initDio();
    trySilentLogin();
  }

  void _initDio() {
    _dio.options.baseUrl = AppConfig.apiUrl;
    _dio.options.connectTimeout = const Duration(seconds: 5);
    _dio.options.receiveTimeout = const Duration(seconds: 5);

    // Request interceptor to attach JWT
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('jwt');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
      onError: (e, handler) async {
        // If 401 Unauthorized, try to refresh token
        if (e.response?.statusCode == 401) {
          final prefs = await SharedPreferences.getInstance();
          final refreshToken = prefs.getString('refreshToken');
          if (refreshToken != null) {
            try {
              final refreshDio = Dio(BaseOptions(baseUrl: AppConfig.apiUrl));
              final res = await refreshDio.post('/auth/refresh', data: {
                'refreshToken': refreshToken,
              });
              final newJwt = res.data['jwt'];
              await prefs.setString('jwt', newJwt);

              // Retry original request with new JWT
              e.requestOptions.headers['Authorization'] = 'Bearer $newJwt';
              final response = await _dio.fetch(e.requestOptions);
              return handler.resolve(response);
            } catch (err) {
              // Refresh failed, logout
              await logout();
            }
          }
        }
        return handler.next(e);
      },
    ));
  }

  Future<void> trySilentLogin() async {
    state = state.copyWith(loading: true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final refreshToken = prefs.getString('refreshToken');

      if (refreshToken == null) {
        state = state.copyWith(loading: false);
        return;
      }

      // Hit refresh to get active JWT
      final res = await _dio.post('/auth/refresh', data: {'refreshToken': refreshToken});
      final jwtToken = res.data['jwt'];
      await prefs.setString('jwt', jwtToken);

      // Load profile details
      final profileRes = await _dio.get('/profile');
      final userModel = UserModel.fromJson(profileRes.data);

      state = AuthState(jwt: jwtToken, user: userModel, loading: false);
    } catch (e) {
      print('Silent login failed: $e');
      state = state.copyWith(loading: false);
    }
  }

  Future<void> loginWithAccessKey(String accessKey) async {
    state = state.copyWith(loading: true);
    try {
      final deviceName = defaultTargetPlatform == TargetPlatform.android ? 'Android Phone' : 'iOS Device';
      final platform = defaultTargetPlatform == TargetPlatform.android ? 'android' : 'ios';

      final res = await _dio.post('/auth/access-key', data: {
        'accessKey': accessKey,
        'deviceName': deviceName,
        'platform': platform,
      });

      final jwtToken = res.data['jwt'];
      final refreshToken = res.data['refreshToken'];
      final userJson = res.data['user'];

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('jwt', jwtToken);
      await prefs.setString('refreshToken', refreshToken);

      state = AuthState(
        jwt: jwtToken,
        user: UserModel.fromJson(userJson),
        loading: false,
      );
    } on DioException catch (e) {
      final errMsg = e.response?.data['error'] ?? 'Login failed';
      state = state.copyWith(loading: false, error: errMsg);
      throw errMsg;
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
      throw e.toString();
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post('/auth/logout');
    } catch (e) {
      print('Server logout error: $e');
    } finally {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('jwt');
      await prefs.remove('refreshToken');
      state = AuthState();
    }
  }

  Future<bool> checkUsernameAvailable(String username) async {
    try {
      final res = await _dio.post('/profile/username/check', data: {'username': username});
      return res.data['available'] ?? false;
    } catch (e) {
      return false;
    }
  }

  Future<void> reserveUsername(String username) async {
    state = state.copyWith(loading: true);
    try {
      final res = await _dio.post('/profile/username/reserve', data: {'username': username});
      if (res.statusCode == 200 && state.user != null) {
        state = state.copyWith(
          user: state.user!.copyWith(username: username),
          loading: false,
        );
      }
    } on DioException catch (e) {
      final errMsg = e.response?.data['error'] ?? 'Failed to claim username';
      state = state.copyWith(loading: false, error: errMsg);
      throw errMsg;
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
      throw e.toString();
    }
  }

  Future<void> scanQrCode(String qrSessionId) async {
    try {
      await _dio.post('/auth/qr/scan', data: {'qrSessionId': qrSessionId});
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to scan QR';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> confirmQrLogin(String qrSessionId) async {
    try {
      final deviceName = defaultTargetPlatform == TargetPlatform.android ? 'Android Phone' : 'iOS Device';
      final platform = defaultTargetPlatform == TargetPlatform.android ? 'android' : 'ios';

      await _dio.post('/auth/qr/confirm', data: {
        'qrSessionId': qrSessionId,
        'deviceName': deviceName,
        'platform': platform,
      });
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to confirm QR login';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> fetchSessions() async {
    try {
      final res = await _dio.get('/auth/sessions');
      final list = (res.data as List).map((x) => ActiveSession.fromJson(x)).toList();
      state = state.copyWith(sessions: list);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load linked devices';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> logoutSession(String sessionId) async {
    try {
      await _dio.post('/auth/sessions/logout', data: {'sessionId': sessionId});
      final updated = state.sessions.where((x) => x.sessionId != sessionId).toList();
      state = state.copyWith(sessions: updated);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to log out device';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<String> submitLinkCode(String linkCode) async {
    try {
      final res = await _dio.post('/auth/qr/link-code', data: {'linkCode': linkCode});
      return res.data['qrSessionId'];
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Invalid or expired link code';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> updateProfileMetadata({String? name, String? about}) async {
    try {
      await _dio.put('/profile', data: {
        if (name != null) 'name': name,
        if (about != null) 'about': about,
      });
      if (state.user != null) {
        final updatedUser = UserModel(
          userId: state.user!.userId,
          username: state.user!.username,
          name: name ?? state.user!.name,
          about: about ?? state.user!.about,
          profilePhotoUrl: state.user!.profilePhotoUrl,
        );
        state = state.copyWith(user: updatedUser);
      }
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to update profile';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<List<UserModel>> fetchBlockedUsers() async {
    try {
      final res = await _dio.get('/profile/blocked');
      return (res.data as List).map((x) {
        return UserModel(
          userId: x['userId'] ?? '',
          username: x['username'] ?? '',
          name: x['name'] ?? '',
          about: '',
          profilePhotoUrl: x['profilePhotoUrl'],
        );
      }).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to load blocked contacts';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> blockUser(String targetUserId) async {
    try {
      await _dio.post('/profile/block', data: {'targetUserId': targetUserId});
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to block user';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> unblockUser(String targetUserId) async {
    try {
      await _dio.post('/profile/unblock', data: {'targetUserId': targetUserId});
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to unblock user';
    } catch (e) {
      throw e.toString();
    }
  }
}
