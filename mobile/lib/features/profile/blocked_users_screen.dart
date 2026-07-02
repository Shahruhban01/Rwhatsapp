import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';

class BlockedUsersScreen extends ConsumerStatefulWidget {
  const BlockedUsersScreen({super.key});

  @override
  ConsumerState<BlockedUsersScreen> createState() => _BlockedUsersScreenState();
}

class _BlockedUsersScreenState extends ConsumerState<BlockedUsersScreen> {
  List<UserModel> _blockedUsers = [];
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _loadBlockedUsers());
  }

  Future<void> _loadBlockedUsers() async {
    setState(() => _loading = true);
    try {
      final list = await ref.read(authProvider.notifier).fetchBlockedUsers();
      setState(() => _blockedUsers = list);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _unblockUser(String targetUserId) async {
    setState(() => _loading = true);
    try {
      await ref.read(authProvider.notifier).unblockUser(targetUserId);
      await _loadBlockedUsers();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('User unblocked successfully'), backgroundColor: Color(0xFF00A884)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _showBlockUserDialog() {
    final searchController = TextEditingController();
    List<UserRecord> searchResults = [];
    bool isSearching = false;

    showDialog(
      context: context,
      builder: (dialogCtx) => StatefulBuilder(
        builder: (context, setStateBuilder) => AlertDialog(
          backgroundColor: const Color(0xFF202C33),
          title: const Text('Block a User', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 16)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: searchController,
                autofocus: true,
                style: const TextStyle(color: Color(0xFFE9EDEF)),
                decoration: InputDecoration(
                  hintText: 'Enter username to search...',
                  hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                  enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF00A884))),
                  focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF00A884), width: 2)),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.search, color: Color(0xFF00A884)),
                    onPressed: () async {
                      final q = searchController.text.trim();
                      if (q.isEmpty) return;
                      setStateBuilder(() => isSearching = true);
                      try {
                        // Use search users from chat provider
                        final list = await ref.read(chatProvider.notifier).fetchUsers(search: q);
                        setStateBuilder(() {
                          searchResults = list;
                          isSearching = false;
                        });
                      } catch (err) {
                        setStateBuilder(() => isSearching = false);
                      }
                    },
                  ),
                ),
                onSubmitted: (_) async {
                  final q = searchController.text.trim();
                  if (q.isEmpty) return;
                  setStateBuilder(() => isSearching = true);
                  try {
                    final list = await ref.read(chatProvider.notifier).fetchUsers(search: q);
                    setStateBuilder(() {
                      searchResults = list;
                      isSearching = false;
                    });
                  } catch (err) {
                    setStateBuilder(() => isSearching = false);
                  }
                },
              ),
              const SizedBox(height: 12),
              if (isSearching)
                const Center(child: CircularProgressIndicator(color: Color(0xFF00A884)))
              else if (searchResults.isEmpty && searchController.text.isNotEmpty)
                const Text('No users found.', style: TextStyle(color: Color(0xFF8696A0), fontSize: 13))
              else
                SizedBox(
                  height: 180,
                  width: double.maxFinite,
                  child: ListView.builder(
                    itemCount: searchResults.length,
                    itemBuilder: (context, i) {
                      final item = searchResults[i];
                      return ListTile(
                        title: Text(item.name, style: const TextStyle(color: Color(0xFFE9EDEF))),
                        subtitle: Text('@${item.username}', style: const TextStyle(color: Color(0xFF8696A0))),
                        trailing: const Text('BLOCK', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
                        onTap: () async {
                          Navigator.pop(dialogCtx);
                          setState(() => _loading = true);
                          try {
                            await ref.read(authProvider.notifier).blockUser(item.userId);
                            await _loadBlockedUsers();
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('User blocked successfully'), backgroundColor: Color(0xFF00A884)),
                              );
                            }
                          } catch (err) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(err.toString()), backgroundColor: Colors.redAccent),
                              );
                            }
                          } finally {
                            if (mounted) {
                              setState(() => _loading = false);
                            }
                          }
                        },
                      );
                    },
                  ),
                )
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx),
              child: const Text('CLOSE', style: TextStyle(color: Color(0xFF8696A0))),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('Blocked Contacts', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_alt_1, color: Color(0xFFE9EDEF)),
            onPressed: _showBlockUserDialog,
          ),
        ],
      ),
      body: Stack(
        children: [
          _blockedUsers.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.block_flipped, size: 80, color: const Color(0xFF8696A0).withOpacity(0.3)),
                      const SizedBox(height: 16),
                      const Text(
                        'No blocked contacts',
                        style: TextStyle(color: Color(0xFF8696A0), fontSize: 15, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 8),
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 40.0),
                        child: Text(
                          'Blocked contacts will no longer be able to call you or send you messages.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFF8696A0), fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.builder(
                  itemCount: _blockedUsers.length,
                  itemBuilder: (context, index) {
                    final target = _blockedUsers[index];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: const Color(0xFF2A3942),
                        child: Text(
                          target.name.isNotEmpty ? target.name[0].toUpperCase() : 'U',
                          style: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold),
                        ),
                      ),
                      title: Text(target.name, style: const TextStyle(color: Color(0xFFE9EDEF))),
                      subtitle: Text('@${target.username}', style: const TextStyle(color: Color(0xFF8696A0))),
                      trailing: TextButton(
                        onPressed: () => _unblockUser(target.userId),
                        child: const Text('UNBLOCK', style: TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold)),
                      ),
                    );
                  },
                ),
          if (_loading)
            Positioned.fill(
              child: Container(
                color: Colors.black38,
                child: const Center(child: CircularProgressIndicator(color: Color(0xFF00A884))),
              ),
            )
        ],
      ),
    );
  }
}
