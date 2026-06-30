import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_database/firebase_database.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';

class ChatScreen extends ConsumerStatefulWidget {
  final String chatId;

  const ChatScreen({super.key, required this.chatId});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _typingTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(chatProvider.notifier).selectChat(widget.chatId);
    });
  }

  @override
  void dispose() {
    _messageController.dispose();
    _scrollController.dispose();
    _typingTimer?.cancel();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  void _onTextChanged(String val) {
    final myUser = ref.read(authProvider).user;
    if (myUser == null) return;

    final typingRef = FirebaseDatabase.instance.ref('typing/${widget.chatId}/${myUser.userId}');

    // Set typing state
    typingRef.set({
      'isTyping': true,
      'startedAt': DateTime.now().millisecondsSinceEpoch,
    });

    // Debounce to stop typing indicator
    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), () {
      typingRef.remove();
    });
  }

  Future<void> _handleSend() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    _messageController.clear();
    
    // Stop typing immediately
    _typingTimer?.cancel();
    final myUser = ref.read(authProvider).user;
    if (myUser != null) {
      FirebaseDatabase.instance.ref('typing/${widget.chatId}/${myUser.userId}').remove();
    }

    await ref.read(chatProvider.notifier).sendTextMessage(text);
    
    // Scroll down
    Timer(const Duration(milliseconds: 100), _scrollToBottom);
  }

  String _formatTime(DateTime time) {
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatProvider);
    final authState = ref.watch(authProvider);

    final activeChat = chatState.chats.firstWhere(
      (c) => c.chatId == widget.chatId,
      orElse: () => ChatModel(
        chatId: widget.chatId,
        type: 'one_to_one',
        participantIds: [],
        createdAt: DateTime.now(),
        createdBy: '',
      ),
    );

    final recipientId = activeChat.participantIds.firstWhere(
      (id) => id != authState.user?.userId,
      orElse: () => '',
    );

    // Auto-scroll when messages arrive
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (chatState.messages.isNotEmpty) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        titleSpacing: 0,
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
        title: Row(
          children: [
            CircleAvatar(
              backgroundColor: Colors.grey,
              radius: 18,
              child: Text(
                activeChat.metadata?['recipientName'] != null
                    ? activeChat.metadata!['recipientName'][0].toUpperCase()
                    : 'U',
                style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    activeChat.metadata?['recipientName'] ?? 'Chat',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFFE9EDEF)),
                  ),
                  const SizedBox(height: 2),
                  // Real-time recipient presence status using RTDB streams
                  if (recipientId.isNotEmpty)
                    StreamBuilder<DatabaseEvent>(
                      stream: FirebaseDatabase.instance.ref('presence/$recipientId').onValue,
                      builder: (context, snapshot) {
                        if (snapshot.hasData && snapshot.data!.snapshot.value != null) {
                          final data = Map<dynamic, dynamic>.from(snapshot.data!.snapshot.value as Map);
                          final state = data['state'] ?? 'offline';

                          // Check if currently typing
                          return StreamBuilder<DatabaseEvent>(
                            stream: FirebaseDatabase.instance.ref('typing/${widget.chatId}/$recipientId').onValue,
                            builder: (context, typingSnapshot) {
                              final isTyping = typingSnapshot.hasData &&
                                  typingSnapshot.data!.snapshot.value != null &&
                                  (Map<dynamic, dynamic>.from(typingSnapshot.data!.snapshot.value as Map)['isTyping'] ?? false);

                              if (isTyping) {
                                return const Text(
                                  'typing...',
                                  style: TextStyle(fontSize: 11, color: Color(0xFF00A884), fontWeight: FontWeight.w600),
                                );
                              }

                              if (state == 'online') {
                                return const Text(
                                  'online',
                                  style: TextStyle(fontSize: 11, color: Color(0xFF8696A0)),
                                );
                              }

                              if (data['lastActive'] != null) {
                                final lastSeenTime = DateTime.fromMillisecondsSinceEpoch(data['lastActive']);
                                final formatted = '${lastSeenTime.hour.toString().padLeft(2, '0')}:${lastSeenTime.minute.toString().padLeft(2, '0')}';
                                return Text(
                                  'last seen at $formatted',
                                  style: const TextStyle(fontSize: 11, color: Color(0xFF8696A0)),
                                );
                              }
                              return const Text(
                                'offline',
                                style: TextStyle(fontSize: 11, color: Color(0xFF8696A0)),
                              );
                            },
                          );
                        }
                        return const Text(
                          'offline',
                          style: TextStyle(fontSize: 11, color: Color(0xFF8696A0)),
                        );
                      },
                    ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(icon: const Icon(Icons.videocam), onPressed: () {}),
          IconButton(icon: const Icon(Icons.call), onPressed: () {}),
          IconButton(icon: const Icon(Icons.more_vert), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          // 1. Message Bubble list
          Expanded(
            child: chatState.loadingMessages
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A884)))
                : chatState.messages.isEmpty
                    ? Center(
                        child: Text(
                          'No messages yet. Send a greeting!',
                          style: TextStyle(color: const Color(0xFF8696A0).withValues(alpha: 0.8), fontSize: 13),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: chatState.messages.length,
                        itemBuilder: (context, index) {
                          final msg = chatState.messages[index];
                          final isMe = msg.senderId == authState.user?.userId;

                          return Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.only(left: 12, right: 12, top: 8, bottom: 20),
                              constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.7),
                              decoration: BoxDecoration(
                                color: isMe ? const Color(0xFF005C4B) : const Color(0xFF202C33),
                                borderRadius: BorderRadius.only(
                                  topLeft: const Radius.circular(8),
                                  topRight: const Radius.circular(8),
                                  bottomLeft: isMe ? const Radius.circular(8) : Radius.zero,
                                  bottomRight: isMe ? Radius.zero : const Radius.circular(8),
                                ),
                              ),
                              child: Stack(
                                children: [
                                  Padding(
                                    padding: const EdgeInsets.only(right: 48),
                                    child: Text(
                                      msg.content,
                                      style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 14),
                                    ),
                                  ),
                                  PositionPoint(isMe: isMe, msg: msg, formatTime: _formatTime(msg.sentAt)),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
          ),

          // 2. Chat Input Container
          Container(
            padding: const EdgeInsets.all(8),
            color: const Color(0xFF111B21),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.emoji_emotions_outlined, color: Color(0xFF8696A0)),
                  onPressed: () {},
                ),
                IconButton(
                  icon: const Icon(Icons.attach_file, color: Color(0xFF8696A0)),
                  onPressed: () {},
                ),
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    onChanged: _onTextChanged,
                    style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 15),
                    decoration: InputDecoration(
                      hintText: 'Type a message',
                      hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                      filled: true,
                      fillColor: const Color(0xFF2A3942),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                CircleAvatar(
                  backgroundColor: const Color(0xFF00A884),
                  radius: 22,
                  child: IconButton(
                    icon: const Icon(Icons.send, color: Colors.white, size: 18),
                    onPressed: _handleSend,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class PositionPoint extends StatelessWidget {
  final bool isMe;
  final MessageModel msg;
  final String formatTime;

  const PositionPoint({super.key, required this.isMe, required this.msg, required this.formatTime});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: 0,
      bottom: -16,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            formatTime,
            style: const TextStyle(color: Color(0xFF8696A0), fontSize: 9),
          ),
          if (isMe) ...[
            const SizedBox(width: 3),
            Icon(
              msg.status == 'read'
                  ? Icons.done_all
                  : msg.status == 'delivered'
                      ? Icons.done_all
                      : Icons.done,
              size: 13,
              color: msg.status == 'read' ? const Color(0xFF53BDEB) : const Color(0xFF8696A0),
            ),
          ],
        ],
      ),
    );
  }
}
