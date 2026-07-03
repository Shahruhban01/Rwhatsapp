import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
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
  bool _isUploading = false;

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

    typingRef.set({
      'isTyping': true,
      'startedAt': DateTime.now().millisecondsSinceEpoch,
    });

    _typingTimer?.cancel();
    _typingTimer = Timer(const Duration(seconds: 2), () {
      typingRef.remove();
    });
  }

  Future<void> _handleSend() async {
    final text = _messageController.text.trim();
    if (text.isEmpty) return;

    _messageController.clear();
    _typingTimer?.cancel();
    final myUser = ref.read(authProvider).user;
    if (myUser != null) {
      FirebaseDatabase.instance.ref('typing/${widget.chatId}/${myUser.userId}').remove();
    }

    try {
      await ref.read(chatProvider.notifier).sendTextMessage(text);
      Timer(const Duration(milliseconds: 100), _scrollToBottom);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  Future<void> _pickAndSendMedia(ImageSource source) async {
    final picker = ImagePicker();
    final XFile? file = await picker.pickImage(source: source, imageQuality: 85);
    if (file == null) return;

    setState(() => _isUploading = true);
    try {
      final uploadRes = await ref.read(chatProvider.notifier).uploadFile(file.path, file.name);
      final url = uploadRes['url'];
      final size = uploadRes['fileSize'] ?? 0;
      
      await ref.read(chatProvider.notifier).sendMediaMessage(url, 'image', file.name, size);
      Timer(const Duration(milliseconds: 100), _scrollToBottom);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Media send failed: $e'), backgroundColor: Colors.redAccent),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
  }

  Future<void> _pickAndSendDocument() async {
    try {
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'ppt', 'pptx'],
      );
      if (result == null || result.files.single.path == null) return;

      final file = result.files.single;
      final path = file.path!;

      setState(() => _isUploading = true);

      final uploadRes = await ref.read(chatProvider.notifier).uploadFile(path, file.name);
      final url = uploadRes['url'];
      final size = uploadRes['fileSize'] ?? file.size;

      await ref.read(chatProvider.notifier).sendMediaMessage(url, 'document', file.name, size);
      Timer(const Duration(milliseconds: 100), _scrollToBottom);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Document send failed: $e'), backgroundColor: Colors.redAccent),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isUploading = false);
      }
    }
  }

  void _showAttachmentMenu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF222E35),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library, color: Color(0xFF00A884)),
              title: const Text('Gallery', style: TextStyle(color: Color(0xFFE9EDEF))),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendMedia(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt, color: Color(0xFF00A884)),
              title: const Text('Camera', style: TextStyle(color: Color(0xFFE9EDEF))),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendMedia(ImageSource.camera);
              },
            ),
            ListTile(
              leading: const Icon(Icons.insert_drive_file, color: Color(0xFF00A884)),
              title: const Text('Document', style: TextStyle(color: Color(0xFFE9EDEF))),
              onTap: () {
                Navigator.pop(context);
                _pickAndSendDocument();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _showMessageMenu(MessageModel msg, bool isMe) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF222E35),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Reactions Quick Bar
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: ['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) {
                  return GestureDetector(
                    onTap: () {
                      Navigator.pop(context);
                      ref.read(chatProvider.notifier).reactToMessage(msg.messageId, emoji);
                    },
                    child: Text(emoji, style: const TextStyle(fontSize: 26)),
                  );
                }).toList(),
              ),
            ),
            const Divider(color: Color(0xFF374248)),
            ListTile(
              leading: const Icon(Icons.copy, color: Color(0xFF8696A0)),
              title: const Text('Copy Text', style: TextStyle(color: Color(0xFFE9EDEF))),
              onTap: () {
                Navigator.pop(context);
                Clipboard.setData(ClipboardData(text: msg.content));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Message copied to clipboard')),
                );
              },
            ),
            if (isMe && !msg.isDeletedForEveryone)
              ListTile(
                leading: const Icon(Icons.delete, color: Colors.redAccent),
                title: const Text('Delete for Everyone', style: TextStyle(color: Colors.redAccent)),
                onTap: () async {
                  Navigator.pop(context);
                  try {
                    await ref.read(chatProvider.notifier).deleteMessageForEveryone(msg.messageId);
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent),
                      );
                    }
                  }
                },
              ),
          ],
        ),
      ),
    );
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
                  if (recipientId.isNotEmpty)
                    StreamBuilder<DatabaseEvent>(
                      stream: FirebaseDatabase.instance.ref('presence/$recipientId').onValue,
                      builder: (context, snapshot) {
                        if (snapshot.hasData && snapshot.data!.snapshot.value != null) {
                          final data = Map<dynamic, dynamic>.from(snapshot.data!.snapshot.value as Map);
                          final state = data['state'] ?? 'offline';

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
                    ? const Center(
                        child: Text(
                          'No messages yet. Send a greeting!',
                          style: TextStyle(color: Color(0xFF8696A0), fontSize: 13),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.all(16),
                        itemCount: chatState.messages.length,
                        itemBuilder: (context, index) {
                          final msg = chatState.messages[index];
                          final isMe = msg.senderId == authState.user?.userId;

                          // Format reactions map locally
                          final reactionEmojis = <String>[];
                          if (msg.reactions != null) {
                            msg.reactions!.forEach((emoji, userIds) {
                              if (userIds is List && userIds.isNotEmpty) {
                                reactionEmojis.add(emoji);
                              }
                            });
                          }

                          return Align(
                            alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                            child: GestureDetector(
                              onLongPress: () => _showMessageMenu(msg, isMe),
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding: const EdgeInsets.all(8),
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
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (msg.type == 'image' && msg.mediaUrl != null) ...[
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(6),
                                        child: Image.network(
                                          msg.mediaUrl!,
                                          fit: BoxFit.cover,
                                          errorBuilder: (c, o, s) => Container(
                                            height: 150,
                                            color: Colors.black26,
                                            child: const Icon(Icons.broken_image, color: Colors.grey),
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                    ],
                                    if (msg.type == 'document' && msg.mediaUrl != null) ...[
                                      GestureDetector(
                                        onTap: () async {
                                          final uri = Uri.parse(msg.mediaUrl!);
                                          if (await canLaunchUrl(uri)) {
                                            await launchUrl(uri, mode: LaunchMode.externalApplication);
                                          }
                                        },
                                        child: Container(
                                          padding: const EdgeInsets.all(8),
                                          decoration: BoxDecoration(
                                            color: Colors.black26,
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Row(
                                            children: [
                                              const Icon(Icons.insert_drive_file, color: Color(0xFF00A884), size: 36),
                                              const SizedBox(width: 10),
                                              Expanded(
                                                child: Column(
                                                  crossAxisAlignment: CrossAxisAlignment.start,
                                                  children: [
                                                    Text(
                                                      msg.content.isNotEmpty ? msg.content : 'Document',
                                                      maxLines: 1,
                                                      overflow: TextOverflow.ellipsis,
                                                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                                    ),
                                                    const SizedBox(height: 2),
                                                    Text(
                                                      msg.mediaSize != null ? '${(msg.mediaSize! / 1024).toStringAsFixed(1)} KB' : '',
                                                      style: const TextStyle(color: Colors.white60, fontSize: 11),
                                                    ),
                                                  ],
                                                ),
                                              ),
                                              const Icon(Icons.download, color: Colors.white70),
                                            ],
                                          ),
                                        ),
                                      ),
                                      const SizedBox(height: 6),
                                    ],
                                    Padding(
                                      padding: const EdgeInsets.only(right: 48, bottom: 4),
                                      child: Text(
                                        msg.content,
                                        style: TextStyle(
                                          color: msg.isDeletedForEveryone ? const Color(0xFF8696A0) : const Color(0xFFE9EDEF),
                                          fontSize: 14,
                                          fontStyle: msg.isDeletedForEveryone ? FontStyle.italic : FontStyle.normal,
                                        ),
                                      ),
                                    ),
                                    // Timestamp and receipt
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.end,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          _formatTime(msg.sentAt),
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
                                    // Render Reactions row if any reactions are present
                                    if (reactionEmojis.isNotEmpty) ...[
                                      const SizedBox(height: 4),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF111B21),
                                          borderRadius: BorderRadius.circular(10),
                                        ),
                                        child: Row(
                                          mainAxisSize: MainAxisSize.min,
                                          children: reactionEmojis.map((e) => Text(e, style: const TextStyle(fontSize: 12))).toList(),
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
          ),

          // Uploading indicator
          if (_isUploading)
            Container(
              padding: const EdgeInsets.all(8),
              color: const Color(0xFF111B21),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00A884)),
                  ),
                  SizedBox(width: 10),
                  Text('Sending file...', style: TextStyle(color: Color(0xFF8696A0), fontSize: 13)),
                ],
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
                  onPressed: _showAttachmentMenu,
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
