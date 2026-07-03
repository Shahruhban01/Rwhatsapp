import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/chat_provider.dart';

class SearchUserDialog extends ConsumerStatefulWidget {
  const SearchUserDialog({super.key});

  @override
  ConsumerState<SearchUserDialog> createState() => _SearchUserDialogState();
}

class _SearchUserDialogState extends ConsumerState<SearchUserDialog> {
  final _searchController = TextEditingController();
  List<UserRecord> _users = [];
  bool _isLoading = false;
  String? _errorMessage;
  String? _startingUsername;
  Timer? _debounce;

  bool _isGroupMode = false;
  final Set<UserRecord> _selectedParticipants = {};
  final _groupNameController = TextEditingController();
  bool _creatingGroup = false;

  @override
  void initState() {
    super.initState();
    _fetchUsers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _groupNameController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _fetchUsers({String search = ''}) async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final notifier = ref.read(chatProvider.notifier);
      final users = await notifier.fetchUsers(search: search);
      if (mounted) {
        setState(() {
          _users = users;
          _isLoading = false;
        });
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _errorMessage = err.toString();
          _isLoading = false;
        });
      }
    }
  }

  void _onSearchChanged(String val) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      _fetchUsers(search: val.trim().toLowerCase());
    });
  }

  Future<void> _handleStartChat(String username) async {
    setState(() => _startingUsername = username);
    try {
      final notifier = ref.read(chatProvider.notifier);
      final chatId = await notifier.startChatWithUser(username);
      if (mounted) {
        Navigator.of(context).pop(chatId);
      }
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(err.toString()),
            backgroundColor: Colors.redAccent,
          ),
        );
        setState(() => _startingUsername = null);
      }
    }
  }

  void _showGroupNameDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF222E35),
        title: const Text('New Group', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Participants: ${_selectedParticipants.map((e) => e.name).join(", ")}',
              style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _groupNameController,
              autofocus: true,
              style: const TextStyle(color: Colors.white),
              decoration: const InputDecoration(
                hintText: 'Enter group name...',
                hintStyle: TextStyle(color: Color(0xFF8696A0)),
                enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF00A884))),
                focusedBorder: UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF00A884))),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF8696A0))),
          ),
          ElevatedButton(
            onPressed: _creatingGroup ? null : _handleCreateGroup,
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00A884)),
            child: _creatingGroup
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Create', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _handleCreateGroup() async {
    final groupName = _groupNameController.text.trim();
    if (groupName.isEmpty) return;

    // Pop naming dialog
    Navigator.pop(context);

    setState(() => _creatingGroup = true);
    try {
      final ids = _selectedParticipants.map((p) => p.userId).toList();
      final chatId = await ref.read(chatProvider.notifier).startGroupChat(groupName, ids);
      if (mounted) {
        Navigator.of(context).pop(chatId);
      }
    } catch (err) {
      if (mounted) {
        setState(() => _creatingGroup = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(err.toString()), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF111B21),
      insetPadding: const EdgeInsets.all(0),
      child: SizedBox(
        width: double.infinity,
        height: MediaQuery.of(context).size.height * 0.85,
        child: Scaffold(
          backgroundColor: const Color(0xFF111B21),
          appBar: AppBar(
            backgroundColor: const Color(0xFF202C33),
            leading: IconButton(
              icon: const Icon(Icons.arrow_back, color: Color(0xFFE9EDEF)),
              onPressed: () {
                if (_isGroupMode) {
                  setState(() {
                    _isGroupMode = false;
                    _selectedParticipants.clear();
                  });
                } else {
                  Navigator.of(context).pop();
                }
              },
            ),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _isGroupMode ? 'New Group' : 'New Chat',
                  style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 16, fontWeight: FontWeight.bold),
                ),
                if (_isGroupMode)
                  Text(
                    '${_selectedParticipants.length} of ${_users.length} selected',
                    style: const TextStyle(color: Color(0xFF8696A0), fontSize: 12),
                  ),
              ],
            ),
          ),
          body: Column(
            children: [
              if (!_isGroupMode)
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  color: const Color(0xFF111B21),
                  child: TextField(
                    controller: _searchController,
                    onChanged: _onSearchChanged,
                    autofocus: true,
                    style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'Search by username...',
                      hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                      prefixIcon: const Icon(Icons.search, color: Color(0xFF8696A0), size: 20),
                      filled: true,
                      fillColor: const Color(0xFF202C33),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                        borderSide: BorderSide.none,
                      ),
                    ),
                  ),
                ),
              Expanded(
                child: _buildBody(),
              ),
            ],
          ),
          floatingActionButton: (_isGroupMode && _selectedParticipants.isNotEmpty)
              ? FloatingActionButton(
                  onPressed: _showGroupNameDialog,
                  backgroundColor: const Color(0xFF00A884),
                  foregroundColor: Colors.white,
                  child: const Icon(Icons.arrow_forward),
                )
              : null,
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading && _users.isEmpty) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF00A884)),
      );
    }

    if (_errorMessage != null && _users.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 40),
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => _fetchUsers(),
                child: const Text('Retry', style: TextStyle(color: Color(0xFF00A884))),
              ),
            ],
          ),
        ),
      );
    }

    if (_users.isEmpty) {
      return Center(
        child: Text(
          _searchController.text.isNotEmpty ? 'No users found' : 'No other users yet',
          style: const TextStyle(color: Color(0xFF8696A0), fontSize: 14),
        ),
      );
    }

    final displayUsers = _users;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (!_isGroupMode) ...[
          ListTile(
            leading: const CircleAvatar(
              backgroundColor: Color(0xFF00A884),
              child: Icon(Icons.group_add, color: Colors.white),
            ),
            title: const Text('New Group', style: TextStyle(color: Color(0xFFE9EDEF), fontWeight: FontWeight.bold)),
            onTap: () {
              setState(() {
                _isGroupMode = true;
              });
            },
          ),
          const Divider(height: 1, color: Color(0xFF202C33)),
        ],
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            '${displayUsers.length} user${displayUsers.length != 1 ? "s" : ""} on this server',
            style: const TextStyle(
              color: Color(0xFF00A884),
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        Expanded(
          child: ListView.separated(
            itemCount: displayUsers.length,
            separatorBuilder: (_, __) => const Divider(
              height: 0,
              color: Color(0xFF202C33),
              indent: 72,
            ),
            itemBuilder: (context, index) {
              final user = displayUsers[index];
              final isStarting = _startingUsername == user.username;
              final isSelected = _selectedParticipants.contains(user);

              return ListTile(
                onTap: isStarting
                    ? null
                    : _isGroupMode
                        ? () {
                            setState(() {
                              if (isSelected) {
                                _selectedParticipants.remove(user);
                              } else {
                                _selectedParticipants.add(user);
                              }
                            });
                          }
                        : () => _handleStartChat(user.username),
                leading: CircleAvatar(
                  backgroundColor: const Color(0xFF2A3942),
                  radius: 24,
                  child: Text(
                    user.name.isNotEmpty ? user.name[0].toUpperCase() : 'U',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF00A884),
                    ),
                  ),
                ),
                title: Text(
                  user.name,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFE9EDEF),
                  ),
                ),
                subtitle: Text(
                  '@${user.username}',
                  style: const TextStyle(fontSize: 13, color: Color(0xFF8696A0)),
                ),
                trailing: _isGroupMode
                    ? Checkbox(
                        value: isSelected,
                        activeColor: const Color(0xFF00A884),
                        onChanged: (val) {
                          setState(() {
                            if (val == true) {
                              _selectedParticipants.add(user);
                            } else {
                              _selectedParticipants.remove(user);
                            }
                          });
                        },
                      )
                    : isStarting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFF00A884),
                            ),
                          )
                        : null,
              );
            },
          ),
        ),
      ],
    );
  }
}
