import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/chat_provider.dart';

class SearchUserDialog extends ConsumerStatefulWidget {
  const SearchUserDialog({super.key});

  @override
  ConsumerState<SearchUserDialog> createState() => _SearchUserDialogState();
}

class _SearchUserDialogState extends ConsumerState<SearchUserDialog> {
  final _usernameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    super.dispose();
  }

  Future<void> _handleStartChat() async {
    if (!_formKey.currentState!.validate()) return;
    
    final username = _usernameController.text.trim().replaceAll('@', '').toLowerCase();

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final notifier = ref.read(chatProvider.notifier);
      final chatId = await notifier.startChatWithUser(username);
      
      if (mounted) {
        Navigator.of(context).pop(chatId); // Return the created chatId
      }
    } catch (err) {
      setState(() {
        _errorMessage = err.toString();
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF202C33),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      title: const Text(
        'New Chat',
        style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold),
      ),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter the contact\'s username to start messaging:',
              style: TextStyle(color: Color(0xFF8696A0), fontSize: 13),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _usernameController,
              autofocus: true,
              style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 14),
              decoration: InputDecoration(
                hintText: 'username',
                hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                prefixText: '@ ',
                prefixStyle: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold),
                filled: true,
                fillColor: const Color(0xFF0B141A),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFF00A884), width: 1.5),
                ),
              ),
              validator: (val) {
                if (val == null || val.trim().isEmpty) {
                  return 'Please enter a username';
                }
                return null;
              },
            ),
            if (_errorMessage != null) ...[
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('CANCEL', style: TextStyle(color: Color(0xFF8696A0))),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _handleStartChat,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF00A884),
            foregroundColor: Colors.white,
            disabledBackgroundColor: const Color(0xFF00A884).withOpacity(0.3),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Text('START', style: TextStyle(fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }
}
