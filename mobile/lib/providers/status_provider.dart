import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'auth_provider.dart';
import '../config.dart';

final statusProvider = StateNotifierProvider<StatusNotifier, StatusState>((ref) {
  final auth = ref.watch(authProvider);
  return StatusNotifier(auth);
});

class StatusState {
  final List<UserStatusModel> statuses;
  final bool loading;
  final String? error;

  StatusState({
    this.statuses = const [],
    this.loading = false,
    this.error,
  });

  StatusState copyWith({
    List<UserStatusModel>? statuses,
    bool? loading,
    String? error,
  }) {
    return StatusState(
      statuses: statuses ?? this.statuses,
      loading: loading ?? this.loading,
      error: error,
    );
  }
}

class UserStatusModel {
  final String userId;
  final String name;
  final String username;
  final String? profilePhotoUrl;
  final List<StatusItemModel> stories;

  UserStatusModel({
    required this.userId,
    required this.name,
    required this.username,
    this.profilePhotoUrl,
    required this.stories,
  });

  factory UserStatusModel.fromJson(Map<String, dynamic> json) {
    return UserStatusModel(
      userId: json['userId'] ?? '',
      name: json['name'] ?? '',
      username: json['username'] ?? '',
      profilePhotoUrl: json['profilePhotoUrl'],
      stories: (json['stories'] as List? ?? [])
          .map((x) => StatusItemModel.fromJson(x as Map<String, dynamic>))
          .toList(),
    );
  }
}

class StatusItemModel {
  final String storyId;
  final String type;
  final String? mediaUrl;
  final String? caption;
  final String? content;
  final String? textBackgroundColor;
  final DateTime createdAt;
  final List<String> views;

  StatusItemModel({
    required this.storyId,
    required this.type,
    this.mediaUrl,
    this.caption,
    this.content,
    this.textBackgroundColor,
    required this.createdAt,
    required this.views,
  });

  factory StatusItemModel.fromJson(Map<String, dynamic> json) {
    // Parse timestamp
    DateTime time = DateTime.now();
    if (json['createdAt'] != null) {
      if (json['createdAt']['_seconds'] != null) {
        time = DateTime.fromMillisecondsSinceEpoch(json['createdAt']['_seconds'] * 1000);
      } else {
        time = DateTime.parse(json['createdAt']);
      }
    }

    return StatusItemModel(
      storyId: json['storyId'] ?? '',
      type: json['type'] ?? 'text',
      mediaUrl: json['mediaUrl'],
      caption: json['caption'],
      content: json['content'],
      textBackgroundColor: json['textBackgroundColor'],
      createdAt: time,
      views: List<String>.from(json['views'] ?? []),
    );
  }
}

class StatusNotifier extends StateNotifier<StatusState> {
  final AuthState _authState;
  final Dio _dio = Dio();

  StatusNotifier(this._authState) : super(StatusState()) {
    _initDio();
    fetchStatuses();
  }

  void _initDio() {
    _dio.options.baseUrl = AppConfig.apiUrl;
    _dio.options.connectTimeout = const Duration(seconds: 5);
    _dio.options.receiveTimeout = const Duration(seconds: 5);

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('jwt');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        return handler.next(options);
      },
    ));
  }

  Future<void> fetchStatuses() async {
    if (_authState.user == null) return;
    state = state.copyWith(loading: true);

    try {
      final res = await _dio.get('/stories');
      final list = (res.data as List).map((x) => UserStatusModel.fromJson(x)).toList();
      state = state.copyWith(statuses: list, loading: false);
    } catch (e) {
      state = state.copyWith(error: e.toString(), loading: false);
    }
  }

  Future<void> postTextStatus(String text, String hexColor) async {
    try {
      await _dio.post('/stories', data: {
        'type': 'text',
        'content': text,
        'textBackgroundColor': hexColor,
      });
      await fetchStatuses();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to post status';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> postMediaStatus(String mediaUrl, String caption) async {
    try {
      await _dio.post('/stories', data: {
        'type': 'image',
        'mediaUrl': mediaUrl,
        'caption': caption,
      });
      await fetchStatuses();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to post status';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> viewStatus(String storyId) async {
    try {
      await _dio.post('/stories/$storyId/view');
      // Update local state without full reload
      final updated = state.statuses.map((u) {
        final storiesUpdated = u.stories.map((s) {
          if (s.storyId == storyId && _authState.user != null) {
            final views = List<String>.from(s.views);
            if (!views.contains(_authState.user!.userId)) {
              views.add(_authState.user!.userId);
            }
            return StatusItemModel(
              storyId: s.storyId,
              type: s.type,
              mediaUrl: s.mediaUrl,
              caption: s.caption,
              content: s.content,
              textBackgroundColor: s.textBackgroundColor,
              createdAt: s.createdAt,
              views: views,
            );
          }
          return s;
        }).toList();
        return UserStatusModel(
          userId: u.userId,
          name: u.name,
          username: u.username,
          profilePhotoUrl: u.profilePhotoUrl,
          stories: storiesUpdated,
        );
      }).toList();
      state = state.copyWith(statuses: updated);
    } catch (_) {}
  }

  Future<void> deleteStatus(String storyId) async {
    try {
      await _dio.delete('/stories/$storyId');
      // Update local state by removing the story
      final updated = state.statuses.map((u) {
        final storiesUpdated = u.stories.where((s) => s.storyId != storyId).toList();
        return UserStatusModel(
          userId: u.userId,
          name: u.name,
          username: u.username,
          profilePhotoUrl: u.profilePhotoUrl,
          stories: storiesUpdated,
        );
      }).where((u) => u.stories.isNotEmpty).toList();
      state = state.copyWith(statuses: updated);
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to delete status';
    } catch (e) {
      throw e.toString();
    }
  }
}
