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

  @override
  void initState() {
    super.initState();
    _fetchUsers();
  }

  @override
  void dispose() {
    _searchController.dispose();
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

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF111B21),
      insetPadding: const EdgeInsets.all(0),
      child: SizedBox(
        width: double.infinity,
        height: MediaQuery.of(context).size.height * 0.85,
        child: Column(
          children: [
            Container(
              padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 8, bottom: 8),
              color: const Color(0xFF202C33),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: Color(0xFFE9EDEF)),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                  const Text(
                    'New Chat',
                    style: TextStyle(
                      color: Color(0xFFE9EDEF),
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            '${_users.length} user${_users.length != 1 ? 's' : ''} on this server',
            style: const TextStyle(
              color: Color(0xFF00A884),
              fontSize: 11,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        Expanded(
          child: ListView.separated(
            itemCount: _users.length,
            separatorBuilder: (_, __) => const Divider(
              height: 0,
              color: Color(0xFF202C33),
              indent: 72,
            ),
            itemBuilder: (context, index) {
              final user = _users[index];
              final isStarting = _startingUsername == user.username;

              return ListTile(
                onTap: isStarting ? null : () => _handleStartChat(user.username),
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
                trailing: isStarting
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
