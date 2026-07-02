import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import 'search_user_dialog.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  String _formatTime(DateTime? time) {
    if (time == null) return '';
    final hour = time.hour.toString().padLeft(2, '0');
    final minute = time.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final chatState = ref.watch(chatProvider);
    final user = authState.user;

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('WhatsApp Clone', style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(
            onPressed: () => context.push('/link-device'),
            icon: const Icon(Icons.qr_code_scanner, color: Color(0xFFE9EDEF)),
            tooltip: 'Link Web Device',
          ),
          PopupMenuButton<String>(
            color: const Color(0xFF222E35),
            icon: const Icon(Icons.more_vert, color: Color(0xFFE9EDEF)),
            onSelected: (value) async {
              if (value == 'linked_devices') {
                Future.delayed(Duration.zero, () {
                  if (context.mounted) {
                    context.push('/linked-devices');
                  }
                });
              } else if (value == 'settings') {
                Future.delayed(Duration.zero, () {
                  if (context.mounted) {
                    context.push('/settings');
                  }
                });
              } else if (value == 'logout') {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) {
                  context.go('/login');
                }
              }
            },
            itemBuilder: (BuildContext context) {
              return [
                const PopupMenuItem<String>(
                  value: 'linked_devices',
                  child: Text('Linked Devices', style: TextStyle(color: Color(0xFFE9EDEF))),
                ),
                const PopupMenuItem<String>(
                  value: 'settings',
                  child: Text('Settings', style: TextStyle(color: Color(0xFFE9EDEF))),
                ),
                const PopupMenuItem<String>(
                  value: 'logout',
                  child: Text('Log Out', style: TextStyle(color: Color(0xFFE9EDEF))),
                ),
              ];
            },
          ),
        ],
      ),
      body: chatState.loadingChats
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A884)))
          : chatState.chats.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.chat_bubble_outline_rounded, color: Color(0xFF00A884), size: 48),
                        const SizedBox(height: 16),
                        const Text(
                          'No chats yet',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFFE9EDEF)),
                        ),
                        const SizedBox(height: 8),
                        const Text(
                          'Search other users by username using the action button below to start messaging.',
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: Color(0xFF8696A0)),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.builder(
                  itemCount: chatState.chats.length,
                  itemBuilder: (context, index) {
                    final chat = chatState.chats[index];
                    final hasUnread = chat.lastMessage != null &&
                        chat.lastMessage!['senderId'] != user?.userId &&
                        chat.lastMessage!['status'] != 'read';

                    return ListTile(
                      onTap: () {
                        // Select the chat and go to active chat screen
                        ref.read(chatProvider.notifier).selectChat(chat.chatId);
                        context.push('/chat/${chat.chatId}');
                      },
                      leading: CircleAvatar(
                        backgroundColor: const Color(0xFF2A3942),
                        radius: 24,
                        child: Text(
                          chat.metadata?['recipientName'] != null
                              ? chat.metadata!['recipientName'][0].toUpperCase()
                              : 'U',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF00A884)),
                        ),
                      ),
                      title: Text(
                        chat.metadata?['recipientName'] ?? 'Chat',
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFFE9EDEF)),
                      ),
                      subtitle: Text(
                        chat.lastMessage != null ? chat.lastMessage!['content'] : 'No messages yet',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: hasUnread ? const Color(0xFFE9EDEF) : const Color(0xFF8696A0),
                          fontWeight: hasUnread ? FontWeight.bold : FontWeight.normal,
                        ),
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            _formatTime(chat.lastMessageAt),
                            style: const TextStyle(fontSize: 11, color: Color(0xFF8696A0)),
                          ),
                          if (hasUnread) ...[
                            const SizedBox(height: 6),
                            Container(
                              width: 10,
                              height: 10,
                              decoration: const BoxDecoration(
                                color: Color(0xFF00A884),
                                shape: BoxShape.circle,
                              ),
                            ),
                          ],
                        ],
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () async {
          final resultChatId = await showDialog<String>(
            context: context,
            builder: (context) => const SearchUserDialog(),
          );

          if (resultChatId != null && context.mounted) {
            context.push('/chat/$resultChatId');
          }
        },
        backgroundColor: const Color(0xFF00A884),
        foregroundColor: Colors.white,
        child: const Icon(Icons.message),
      ),
    );
  }
}
