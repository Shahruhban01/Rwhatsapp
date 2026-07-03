import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';

class ArchivedChatsScreen extends ConsumerWidget {
  const ArchivedChatsScreen({super.key});

  String _formatTime(DateTime? date) {
    if (date == null) return '';
    return DateFormat('hh:mm a').format(date);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chatState = ref.watch(chatProvider);
    final currentUser = ref.watch(authProvider).user;

    if (currentUser == null) {
      return const Scaffold(body: Center(child: Text('Unauthorized')));
    }

    // Filter archived chats
    final archivedChats = chatState.chats.where((chat) {
      return chat.archivedByUserIds.contains(currentUser.userId);
    }).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('Archived', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
      ),
      body: archivedChats.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.archive_outlined, size: 80, color: const Color(0xFF8696A0).withOpacity(0.3)),
                  const SizedBox(height: 16),
                  const Text(
                    'No archived chats',
                    style: TextStyle(color: Color(0xFF8696A0), fontSize: 15, fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 8),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 40.0),
                    child: Text(
                      'These chats stay archived and muted when new messages are received.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Color(0xFF8696A0), fontSize: 12),
                    ),
                  ),
                ],
              ),
            )
          : ListView.builder(
              itemCount: archivedChats.length,
              itemBuilder: (context, index) {
                final chat = archivedChats[index];

                // Determine dynamic title and avatar
                String title = 'Chat';
                String subtitle = '';
                if (chat.type == 'one_to_one') {
                  final recipient = chat.metadata?['recipientProfile'];
                  title = recipient?['name'] ?? 'WhatsApp User';
                  subtitle = '@${recipient?['username'] ?? ''}';
                } else {
                  title = chat.metadata?['groupName'] ?? 'Group Chat';
                  subtitle = 'Group';
                }

                if (chat.lastMessage != null) {
                  subtitle = chat.lastMessage!['content'] ?? '';
                }

                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: const Color(0xFF2A3942),
                    child: Text(
                      title.isNotEmpty ? title[0].toUpperCase() : 'C',
                      style: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold),
                    ),
                  ),
                  title: Text(title, style: const TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.w500)),
                  subtitle: Text(
                    subtitle,
                    style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: Text(
                    _formatTime(chat.lastMessageAt),
                    style: const TextStyle(fontSize: 11, color: Color(0xFF8696A0)),
                  ),
                  onTap: () => context.push('/chat/${chat.chatId}'),
                  onLongPress: () {
                    // Show Unarchive option
                    showModalBottomSheet(
                      context: context,
                      backgroundColor: const Color(0xFF222E35),
                      builder: (context) => SafeArea(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ListTile(
                              leading: const Icon(Icons.unarchive, color: Color(0xFFE9EDEF)),
                              title: const Text('Unarchive Chat', style: TextStyle(color: Color(0xFFE9EDEF))),
                              onTap: () async {
                                Navigator.pop(context);
                                try {
                                  await ref.read(chatProvider.notifier).unarchiveChat(chat.chatId);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Chat unarchived')),
                                    );
                                  }
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
                  },
                );
              },
            ),
    );
  }
}
