import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:image_picker/image_picker.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/status_provider.dart';
import 'search_user_dialog.dart';
import 'status_viewer_screen.dart';
import 'status_preview_screen.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  int _currentTab = 0;
  final _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text.trim().toLowerCase();
      });
    });
    // Fetch initial statuses
    Future.microtask(() => ref.read(statusProvider.notifier).fetchStatuses());
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  String _formatTime(DateTime? date) {
    if (date == null) return '';
    return DateFormat('hh:mm a').format(date);
  }

  Future<void> _pickImageStatus() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(source: ImageSource.gallery, imageQuality: 75);
    if (image == null) return;

    if (mounted) {
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => StatusPreviewScreen(
            imagePath: image.path,
            imageName: image.name,
          ),
        ),
      );
    }
  }

  void _showChatOptions(ChatModel chat) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF222E35),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.archive, color: Color(0xFFE9EDEF)),
              title: const Text('Archive Chat', style: TextStyle(color: Color(0xFFE9EDEF))),
              onTap: () async {
                Navigator.pop(context);
                try {
                  await ref.read(chatProvider.notifier).archiveChat(chat.chatId);
                  if (mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Chat archived')),
                    );
                  }
                } catch (e) {
                  if (mounted) {
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

  Widget _buildChatsTab(ChatState chatState, UserModel? currentUser) {
    if (currentUser == null) return const Center(child: Text('Unauthorized'));

    // Filter out archived chats
    final activeChats = chatState.chats.where((chat) {
      return !chat.archivedByUserIds.contains(currentUser.userId);
    }).toList();

    // Filter by search query
    final filteredChats = activeChats.where((chat) {
      String name = 'Chat';
      if (chat.type == 'one_to_one') {
        final recipient = chat.metadata?['recipientProfile'];
        name = (recipient?['name'] ?? '').toLowerCase();
      } else {
        name = (chat.metadata?['groupName'] ?? '').toLowerCase();
      }
      return name.contains(_searchQuery);
    }).toList();

    final archivedCount = chatState.chats.where((chat) {
      return chat.archivedByUserIds.contains(currentUser.userId);
    }).length;

    return Column(
      children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.all(10.0),
          child: TextField(
            controller: _searchController,
            style: const TextStyle(color: Color(0xFFE9EDEF)),
            decoration: InputDecoration(
              hintText: 'Search chats...',
              hintStyle: const TextStyle(color: Color(0xFF8696A0)),
              prefixIcon: const Icon(Icons.search, color: Color(0xFF8696A0)),
              filled: true,
              fillColor: const Color(0xFF202C33),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 0, horizontal: 16),
            ),
          ),
        ),

        // Archived row
        if (archivedCount > 0)
          ListTile(
            leading: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4.0),
              child: Icon(Icons.archive_outlined, color: Color(0xFF00A884)),
            ),
            title: const Text(
              'Archived',
              style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold),
            ),
            trailing: Text(
              '$archivedCount',
              style: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold, fontSize: 13),
            ),
            onTap: () => context.push('/archived-chats'),
          ),

        Expanded(
          child: chatState.loadingChats
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF00A884)))
              : filteredChats.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.chat_bubble_outline_rounded, color: Color(0xFF00A884), size: 48),
                            const SizedBox(height: 16),
                            Text(
                              _searchQuery.isNotEmpty ? 'No chats match "$_searchQuery"' : 'No chats yet',
                              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Color(0xFFE9EDEF)),
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.builder(
                      itemCount: filteredChats.length,
                      itemBuilder: (context, index) {
                        final chat = filteredChats[index];
                        final hasUnread = chat.lastMessage != null &&
                            chat.lastMessage!['senderId'] != currentUser.userId &&
                            chat.lastMessage!['status'] != 'read';

                        // Resolve metadata
                        String title = 'Chat';
                        String subtitle = 'No messages yet';
                        if (chat.type == 'one_to_one') {
                          final recipient = chat.metadata?['recipientProfile'];
                          title = recipient?['name'] ?? 'WhatsApp User';
                        } else {
                          title = chat.metadata?['groupName'] ?? 'Group Chat';
                        }

                        if (chat.lastMessage != null) {
                          subtitle = chat.lastMessage!['content'] ?? '';
                          if (chat.lastMessage!['type'] != 'text') {
                            subtitle = '[${chat.lastMessage!['type']}]';
                          }
                        }

                        return ListTile(
                          onTap: () {
                            ref.read(chatProvider.notifier).selectChat(chat.chatId);
                            context.push('/chat/${chat.chatId}');
                          },
                          onLongPress: () => _showChatOptions(chat),
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFF2A3942),
                            radius: 24,
                            child: Text(
                              title.isNotEmpty ? title[0].toUpperCase() : 'U',
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Color(0xFF00A884)),
                            ),
                          ),
                          title: Text(
                            title,
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFFE9EDEF)),
                          ),
                          subtitle: Text(
                            subtitle,
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
        ),
      ],
    );
  }

  Widget _buildUpdatesTab(StatusState statusState, UserModel? currentUser) {
    if (currentUser == null) return const SizedBox();

    // Find own status
    final ownStatusIndex = statusState.statuses.indexWhere((x) => x.userId == currentUser.userId);
    final ownStatus = ownStatusIndex != -1 ? statusState.statuses[ownStatusIndex] : null;

    // Contact statuses
    final contactStatuses = statusState.statuses.where((x) => x.userId != currentUser.userId).toList();

    return RefreshIndicator(
      onRefresh: () => ref.read(statusProvider.notifier).fetchStatuses(),
      color: const Color(0xFF00A884),
      backgroundColor: const Color(0xFF202C33),
      child: ListView(
        children: [
          // Own status entry
          ListTile(
            leading: Stack(
              children: [
                CircleAvatar(
                  backgroundColor: const Color(0xFF2A3942),
                  radius: 26,
                  child: Text(
                    currentUser.name.isNotEmpty ? currentUser.name[0].toUpperCase() : 'U',
                    style: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold, fontSize: 18),
                  ),
                ),
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: CircleAvatar(
                    backgroundColor: const Color(0xFF00A884),
                    radius: 9,
                    child: const Icon(Icons.add, size: 14, color: Colors.white),
                  ),
                ),
              ],
            ),
            title: const Text('My Status', style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold)),
            subtitle: Text(
              ownStatus != null ? 'Tap to view status updates' : 'Tap to add status update',
              style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
            ),
            onTap: () {
              if (ownStatus != null) {
                Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => StatusViewerScreen(userStatus: ownStatus)),
                );
              } else {
                context.push('/status/create');
              }
            },
          ),

          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Text(
              'Recent updates',
              style: TextStyle(color: Color(0xFF8696A0), fontSize: 13, fontWeight: FontWeight.bold),
            ),
          ),

          if (contactStatuses.isEmpty)
            const Padding(
              padding: EdgeInsets.all(24.0),
              child: Center(
                child: Text('No status updates yet.', style: TextStyle(color: Color(0xFF8696A0))),
              ),
            )
          else
            ...contactStatuses.map((status) {
              // Check if all stories are viewed
              final hasUnviewed = status.stories.any((s) => !s.views.contains(currentUser.userId));

              return ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: hasUnviewed ? const Color(0xFF00A884) : const Color(0xFF8696A0),
                      width: 2,
                    ),
                  ),
                  child: CircleAvatar(
                    backgroundColor: const Color(0xFF2A3942),
                    radius: 22,
                    child: Text(
                      status.name.isNotEmpty ? status.name[0].toUpperCase() : 'U',
                      style: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                title: Text(status.name, style: const TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold)),
                subtitle: const Text('Tap to view', style: TextStyle(color: Color(0xFF8696A0), fontSize: 13)),
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => StatusViewerScreen(userStatus: status)),
                  );
                },
              );
            }),

          // WhatsApp Channels Section (aesthetic mockup)
          const Divider(color: Color(0xFF202C33), height: 32),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Channels', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 16, fontWeight: FontWeight.bold)),
                Icon(Icons.add, color: Color(0xFF8696A0)),
              ],
            ),
          ),
          const Padding(
            padding: EdgeInsets.all(16.0),
            child: Text(
              'Stay updated on topics that matter to you. Find channels to follow below.',
              style: TextStyle(color: Color(0xFF8696A0), fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommunitiesTab() {
    return ListView(
      children: [
        // New Community Item
        ListTile(
          leading: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFF00A884).withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.add_to_photos, color: Color(0xFF00A884)),
          ),
          title: const Text('New Community', style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold)),
          onTap: () {},
        ),
        const Divider(height: 1, color: Color(0xFF202C33)),

        // Mock Community 1
        Container(
          color: const Color(0xFF111B21),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ListTile(
                leading: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2A3942),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.groups, color: Color(0xFF8696A0)),
                ),
                title: const Text('Rwhatsapp Developer Workspace', style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold)),
                subtitle: const Text('Announcement group for developers', style: TextStyle(color: Color(0xFF8696A0), fontSize: 13)),
              ),
              const Padding(
                padding: EdgeInsets.only(left: 72.0),
                child: Divider(height: 1, color: Color(0xFF202C33)),
              ),
              ListTile(
                contentPadding: const EdgeInsets.only(left: 72, right: 16),
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFF202C33),
                  radius: 16,
                  child: Icon(Icons.campaign, color: Color(0xFF00A884), size: 18),
                ),
                title: const Text('Announcements', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 14, fontWeight: FontWeight.w500)),
                subtitle: const Text('Ruhban: Welcome to the new app version!', style: TextStyle(color: Color(0xFF8696A0), fontSize: 12)),
                trailing: const Text('10:45 AM', style: TextStyle(color: Color(0xFF8696A0), fontSize: 11)),
                onTap: () {},
              ),
              ListTile(
                contentPadding: const EdgeInsets.only(left: 72, right: 16),
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFF202C33),
                  radius: 16,
                  child: Icon(Icons.chat_bubble_outline, color: Color(0xFF8696A0), size: 18),
                ),
                title: const Text('General chat', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 14, fontWeight: FontWeight.w500)),
                subtitle: const Text('Basita: Let\'s test document sharing', style: TextStyle(color: Color(0xFF8696A0), fontSize: 12)),
                trailing: const Text('Yesterday', style: TextStyle(color: Color(0xFF8696A0), fontSize: 11)),
                onTap: () {},
              ),
            ],
          ),
        ),
        const Divider(height: 8, color: Color(0xFF0B141A)),

        // Mock Community 2
        Container(
          color: const Color(0xFF111B21),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ListTile(
                leading: Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2A3942),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.palette, color: Color(0xFF8696A0)),
                ),
                title: const Text('UI/UX Design Studio', style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold)),
                subtitle: const Text('Figma design systems and resources', style: TextStyle(color: Color(0xFF8696A0), fontSize: 13)),
              ),
              const Padding(
                padding: EdgeInsets.only(left: 72.0),
                child: Divider(height: 1, color: Color(0xFF202C33)),
              ),
              ListTile(
                contentPadding: const EdgeInsets.only(left: 72, right: 16),
                leading: const CircleAvatar(
                  backgroundColor: Color(0xFF202C33),
                  radius: 16,
                  child: Icon(Icons.campaign, color: Color(0xFF00A884), size: 18),
                ),
                title: const Text('Announcements', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 14, fontWeight: FontWeight.w500)),
                subtitle: const Text('Dala: Status viewing design polished', style: TextStyle(color: Color(0xFF8696A0), fontSize: 12)),
                trailing: const Text('Wednesday', style: TextStyle(color: Color(0xFF8696A0), fontSize: 11)),
                onTap: () {},
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCallsTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.call, size: 80, color: const Color(0xFF8696A0).withOpacity(0.2)),
          const SizedBox(height: 16),
          const Text(
            'No calls',
            style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 16, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 48.0),
            child: Text(
              'To call contacts who have WhatsApp, start a chat and tap the call button.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF8696A0), fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final chatState = ref.watch(chatProvider);
    final statusState = ref.watch(statusProvider);
    final currentUser = authState.user;

    final unreadChatsCount = chatState.chats.where((chat) {
      return chat.lastMessage != null &&
          chat.lastMessage!['senderId'] != currentUser?.userId &&
          chat.lastMessage!['status'] != 'read';
    }).length;

    final hasUnviewedStatus = statusState.statuses
        .where((x) => x.userId != currentUser?.userId)
        .any((s) => s.stories.any((story) => !story.views.contains(currentUser?.userId)));

    Widget body;
    switch (_currentTab) {
      case 0:
        body = _buildChatsTab(chatState, currentUser);
        break;
      case 1:
        body = _buildUpdatesTab(statusState, currentUser);
        break;
      case 2:
        body = _buildCommunitiesTab();
        break;
      case 3:
        body = _buildCallsTab();
        break;
      default:
        body = const SizedBox();
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('WhatsApp', style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold, fontSize: 20)),
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
      body: body,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentTab,
        onTap: (index) {
          setState(() {
            _currentTab = index;
          });
        },
        backgroundColor: const Color(0xFF202C33),
        selectedItemColor: const Color(0xFF00A884),
        unselectedItemColor: const Color(0xFF8696A0),
        type: BottomNavigationBarType.fixed,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelStyle: const TextStyle(fontSize: 12),
        items: [
          BottomNavigationBarItem(
            icon: unreadChatsCount > 0
                ? Badge(
                    label: Text('$unreadChatsCount'),
                    backgroundColor: const Color(0xFF00A884),
                    textColor: Colors.white,
                    child: const Icon(Icons.chat),
                  )
                : const Icon(Icons.chat),
            activeIcon: const Icon(Icons.chat, color: Color(0xFF00A884)),
            label: 'Chats',
          ),
          BottomNavigationBarItem(
            icon: hasUnviewedStatus
                ? const Badge(
                    backgroundColor: Color(0xFF00A884),
                    child: Icon(Icons.update),
                  )
                : const Icon(Icons.update),
            activeIcon: const Icon(Icons.update, color: Color(0xFF00A884)),
            label: 'Updates',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.groups),
            activeIcon: Icon(Icons.groups, color: Color(0xFF00A884)),
            label: 'Communities',
          ),
          const BottomNavigationBarItem(
            icon: Icon(Icons.call),
            activeIcon: Icon(Icons.call, color: Color(0xFF00A884)),
            label: 'Calls',
          ),
        ],
      ),
      floatingActionButton: _currentTab == 0
          ? FloatingActionButton(
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
            )
          : _currentTab == 1
              ? Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    FloatingActionButton.small(
                      onPressed: () => context.push('/status/create'),
                      backgroundColor: const Color(0xFF202C33),
                      foregroundColor: const Color(0xFF00A884),
                      child: const Icon(Icons.edit),
                    ),
                    const SizedBox(height: 12),
                    FloatingActionButton(
                      onPressed: _pickImageStatus,
                      backgroundColor: const Color(0xFF00A884),
                      foregroundColor: Colors.white,
                      child: const Icon(Icons.camera_alt),
                    ),
                  ],
                )
              : null,
    );
  }
}
