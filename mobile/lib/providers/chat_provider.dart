import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'auth_provider.dart';

import '../config.dart';

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  final auth = ref.watch(authProvider);
  return ChatNotifier(auth);
});

class ChatState {
  final List<ChatModel> chats;
  final String? activeChatId;
  final List<MessageModel> messages;
  final bool loadingChats;
  final bool loadingMessages;
  final String? error;

  ChatState({
    this.chats = const [],
    this.activeChatId,
    this.messages = const [],
    this.loadingChats = false,
    this.loadingMessages = false,
    this.error,
  });

  ChatState copyWith({
    List<ChatModel>? chats,
    String? activeChatId,
    List<MessageModel>? messages,
    bool? loadingChats,
    bool? loadingMessages,
    String? error,
  }) {
    return ChatState(
      chats: chats ?? this.chats,
      activeChatId: activeChatId ?? this.activeChatId,
      messages: messages ?? this.messages,
      loadingChats: loadingChats ?? this.loadingChats,
      loadingMessages: loadingMessages ?? this.loadingMessages,
      error: error,
    );
  }
}

class ChatModel {
  final String chatId;
  final String type;
  final List<String> participantIds;
  final Map<String, dynamic>? lastMessage;
  final DateTime? lastMessageAt;
  final DateTime createdAt;
  final String createdBy;
  final Map<String, dynamic>? metadata;
  final List<String> archivedByUserIds;

  ChatModel({
    required this.chatId,
    required this.type,
    required this.participantIds,
    this.lastMessage,
    this.lastMessageAt,
    required this.createdAt,
    required this.createdBy,
    this.metadata,
    this.archivedByUserIds = const [],
  });

  factory ChatModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return ChatModel(
      chatId: doc.id,
      type: data['type'] ?? 'one_to_one',
      participantIds: List<String>.from(data['participantIds'] ?? []),
      lastMessage: data['lastMessage'],
      lastMessageAt: data['lastMessageAt'] != null
          ? (data['lastMessageAt'] as Timestamp).toDate()
          : null,
      createdAt: data['createdAt'] != null
          ? (data['createdAt'] as Timestamp).toDate()
          : DateTime.now(),
      createdBy: data['createdBy'] ?? '',
      metadata: data['metadata'],
      archivedByUserIds: List<String>.from(data['archivedByUserIds'] ?? []),
    );
  }
}

class MessageModel {
  final String messageId;
  final String chatId;
  final String senderId;
  final String type;
  final String content;
  final String? mediaUrl;
  final String? mediaThumbnailUrl;
  final int? mediaSize;
  final String? mediaName;
  final int? mediaDuration;
  final Map<String, dynamic>? replyTo;
  final bool isEdited;
  final bool isDeletedForEveryone;
  final bool isPinned;
  final String status;
  final DateTime sentAt;
  final DateTime? deliveredAt;
  final DateTime? readAt;
  final Map<String, dynamic>? reactions;

  MessageModel({
    required this.messageId,
    required this.chatId,
    required this.senderId,
    required this.type,
    required this.content,
    this.mediaUrl,
    this.mediaThumbnailUrl,
    this.mediaSize,
    this.mediaName,
    this.mediaDuration,
    this.replyTo,
    required this.isEdited,
    required this.isDeletedForEveryone,
    required this.isPinned,
    required this.status,
    required this.sentAt,
    this.deliveredAt,
    this.readAt,
    this.reactions,
  });

  factory MessageModel.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    return MessageModel(
      messageId: doc.id,
      chatId: data['chatId'] ?? '',
      senderId: data['senderId'] ?? '',
      type: data['type'] ?? 'text',
      content: data['content'] ?? '',
      mediaUrl: data['mediaUrl'],
      mediaThumbnailUrl: data['mediaThumbnailUrl'],
      mediaSize: data['mediaSize'],
      mediaName: data['mediaName'],
      mediaDuration: data['mediaDuration'],
      replyTo: data['replyTo'],
      isEdited: data['isEdited'] ?? false,
      isDeletedForEveryone: data['isDeletedForEveryone'] ?? false,
      isPinned: data['isPinned'] ?? false,
      status: data['status'] ?? 'sent',
      sentAt: data['sentAt'] != null
          ? (data['sentAt'] as Timestamp).toDate()
          : DateTime.now(),
      deliveredAt: data['deliveredAt'] != null
          ? (data['deliveredAt'] as Timestamp).toDate()
          : null,
      readAt: data['readAt'] != null ? (data['readAt'] as Timestamp).toDate() : null,
      reactions: data['reactions'],
    );
  }
}

class UserRecord {
  final String userId;
  final String username;
  final String name;
  final String? profilePhotoUrl;
  final String about;

  UserRecord({
    required this.userId,
    required this.username,
    required this.name,
    this.profilePhotoUrl,
    this.about = '',
  });

  factory UserRecord.fromJson(Map<String, dynamic> json) {
    return UserRecord(
      userId: json['userId'] ?? '',
      username: json['username'] ?? '',
      name: json['name'] ?? '',
      profilePhotoUrl: json['profilePhotoUrl'],
      about: json['about'] ?? '',
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  final AuthState _authState;
  final Dio _dio = Dio();
  StreamSubscription? _chatsSubscription;
  StreamSubscription? _messagesSubscription;

  ChatNotifier(this._authState) : super(ChatState()) {
    _initDio();
    _startChatsListener();
  }

  void _initDio() {
    _dio.options.baseUrl = AppConfig.apiUrl;
    _dio.options.connectTimeout = const Duration(seconds: 5);
    _dio.options.receiveTimeout = const Duration(seconds: 5);

    // Attach Authorization header
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

  void _startChatsListener() {
    if (_authState.user == null) {
      _chatsSubscription?.cancel();
      return;
    }

    state = state.copyWith(loadingChats: true);

    final chatsQuery = FirebaseFirestore.instance
        .collection('chats')
        .where('participantIds', arrayContains: _authState.user!.userId);

    _chatsSubscription = chatsQuery.snapshots().listen((snapshot) async {
      final List<ChatModel> chatList = [];

      for (var doc in snapshot.docs) {
        final chat = ChatModel.fromFirestore(doc);
        
        // Dynamic fetch of recipient profile for 1:1 chats
        if (chat.type == 'one_to_one') {
          final recipientId = chat.participantIds.firstWhere(
            (id) => id != _authState.user!.userId,
            orElse: () => '',
          );

          if (recipientId.isNotEmpty) {
            try {
              final recipientDoc = await FirebaseFirestore.instance
                  .collection('users')
                  .doc(recipientId)
                  .get();

              if (recipientDoc.exists) {
                final rData = recipientDoc.data()!;
                chat.metadata?['recipientName'] = rData['name'];
                chat.metadata?['recipientUsername'] = rData['username'];
                chat.metadata?['recipientPhotoUrl'] = rData['profilePhotoUrl'];
              }
            } catch (e) {
              print('Failed to resolve recipient user metadata: $e');
            }
          }
        }

        chatList.add(chat);
      }

      // Sort locally by last message timestamp
      chatList.sort((a, b) {
        if (a.lastMessageAt == null) return 1;
        if (b.lastMessageAt == null) return -1;
        return b.lastMessageAt!.compareTo(a.lastMessageAt!);
      });

      state = state.copyWith(chats: chatList, loadingChats: false);
    }, onError: (err) {
      print('Chats listener error: $err');
      state = state.copyWith(loadingChats: false, error: err.toString());
    });
  }

  void selectChat(String chatId) {
    if (state.activeChatId == chatId) return;
    
    _messagesSubscription?.cancel();
    state = state.copyWith(activeChatId: chatId, loadingMessages: true, messages: []);

    // Listen to messages in the active chat
    final messagesQuery = FirebaseFirestore.instance
        .collection('messages')
        .doc(chatId)
        .collection('chatMessages')
        .orderBy('sentAt', descending: false);

    _messagesSubscription = messagesQuery.snapshots().listen((snapshot) {
      final List<MessageModel> messagesList = [];
      for (var doc in snapshot.docs) {
        messagesList.add(MessageModel.fromFirestore(doc));
      }

      state = state.copyWith(messages: messagesList, loadingMessages: false);
      markActiveChatAsRead();
    }, onError: (err) {
      print('Messages listener error: $err');
      state = state.copyWith(loadingMessages: false, error: err.toString());
    });
  }

  Future<List<UserRecord>> fetchUsers({String search = ''}) async {
    try {
      final params = search.isNotEmpty ? {'search': search} : null;
      final res = await _dio.get('/users', queryParameters: params);
      return (res.data as List).map((u) => UserRecord.fromJson(u as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to fetch users';
    }
  }

  Future<String> startChatWithUser(String username) async {
    state = state.copyWith(loadingChats: true);
    try {
      final res = await _dio.post('/chats', data: {'recipientUsername': username});
      final chatId = res.data['chatId'];
      selectChat(chatId);
      return chatId;
    } on DioException catch (e) {
      final errMsg = e.response?.data['error'] ?? 'Failed to start chat';
      state = state.copyWith(loadingChats: false, error: errMsg);
      throw errMsg;
    } catch (e) {
      state = state.copyWith(loadingChats: false, error: e.toString());
      throw e.toString();
    }
  }

  Future<void> sendTextMessage(String text) async {
    final chatId = state.activeChatId;
    if (chatId == null || _authState.user == null) return;

    try {
      await _dio.post('/chats/$chatId/messages', data: {
        'type': 'text',
        'content': text,
      });
    } on DioException catch (e) {
      final errMsg = e.response?.data['error'] ?? 'Failed to send message';
      state = state.copyWith(error: errMsg);
      throw errMsg;
    }
  }

  Future<void> markActiveChatAsRead() async {
    final chatId = state.activeChatId;
    if (chatId == null || _authState.user == null) return;

    try {
      await _dio.post('/chats/$chatId/messages/read');
    } catch (e) {
      print('Failed to mark messages as read: $e');
    }
  }

  Future<void> sendMediaMessage(String mediaUrl, String type, String name, int size) async {
    final chatId = state.activeChatId;
    if (chatId == null || _authState.user == null) return;

    try {
      await _dio.post('/chats/$chatId/messages', data: {
        'type': type,
        'content': '[$type]',
        'mediaUrl': mediaUrl,
        'mediaName': name,
        'mediaSize': size,
      });
    } on DioException catch (e) {
      final errMsg = e.response?.data['error'] ?? 'Failed to send media';
      state = state.copyWith(error: errMsg);
      throw errMsg;
    }
  }

  Future<Map<String, dynamic>> uploadFile(String filePath, String fileName) async {
    try {
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(filePath, filename: fileName),
      });

      final res = await _dio.post('/storage/upload', data: formData);
      return res.data; // { url, fileName, fileSize, mimeType }
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Upload failed';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> deleteMessageForEveryone(String messageId) async {
    final chatId = state.activeChatId;
    if (chatId == null || _authState.user == null) return;

    try {
      await _dio.delete('/chats/$chatId/messages/$messageId', queryParameters: {'mode': 'everyone'});
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to delete message';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> reactToMessage(String messageId, String emoji) async {
    final chatId = state.activeChatId;
    if (chatId == null || _authState.user == null) return;

    try {
      await _dio.post('/chats/$chatId/messages/$messageId/react', data: {'reaction': emoji});
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to react to message';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> archiveChat(String chatId) async {
    try {
      await _dio.post('/chats/$chatId/archive');
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to archive chat';
    } catch (e) {
      throw e.toString();
    }
  }

  Future<void> unarchiveChat(String chatId) async {
    try {
      await _dio.post('/chats/$chatId/unarchive');
    } on DioException catch (e) {
      throw e.response?.data['error'] ?? 'Failed to unarchive chat';
    } catch (e) {
      throw e.toString();
    }
  }

  @override
  void dispose() {
    _chatsSubscription?.cancel();
    _messagesSubscription?.cancel();
    super.dispose();
  }
}
