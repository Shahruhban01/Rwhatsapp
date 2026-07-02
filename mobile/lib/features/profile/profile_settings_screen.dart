import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';

class ProfileSettingsScreen extends ConsumerStatefulWidget {
  const ProfileSettingsScreen({super.key});

  @override
  ConsumerState<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends ConsumerState<ProfileSettingsScreen> {
  final _nameController = TextEditingController();
  final _aboutController = TextEditingController();
  bool _loading = false;

  void _showEditFieldDialog({
    required String title,
    required String hintText,
    required TextEditingController controller,
    required Future<void> Function(String) onSave,
  }) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF202C33),
        title: Text(title, style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 16)),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(color: Color(0xFFE9EDEF)),
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: const TextStyle(color: Color(0xFF8696A0)),
            enabledBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF00A884))),
            focusedBorder: const UnderlineInputBorder(borderSide: BorderSide(color: Color(0xFF00A884), width: 2)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('CANCEL', style: TextStyle(color: Color(0xFF8696A0))),
          ),
          TextButton(
            onPressed: () async {
              final val = controller.text.trim();
              if (val.isEmpty) return;
              Navigator.pop(context);
              setState(() => _loading = true);
              try {
                await onSave(val);
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
            },
            child: const Text('SAVE', style: TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final user = authState.user;

    if (user == null) {
      return const Scaffold(body: Center(child: Text('User details not loaded')));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('Profile', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            child: Column(
              children: [
                const SizedBox(height: 28),
                // Avatar Profile Pic
                Center(
                  child: Stack(
                    children: [
                      CircleAvatar(
                        backgroundColor: const Color(0xFF202C33),
                        radius: 80,
                        child: Text(
                          user.name.isNotEmpty ? user.name[0].toUpperCase() : 'U',
                          style: const TextStyle(fontSize: 64, fontWeight: FontWeight.bold, color: Color(0xFF00A884)),
                        ),
                      ),
                      Positioned(
                        bottom: 0,
                        right: 4,
                        child: CircleAvatar(
                          backgroundColor: const Color(0xFF00A884),
                          radius: 24,
                          child: IconButton(
                            icon: const Icon(Icons.camera_alt, color: Colors.white, size: 20),
                            onPressed: () {},
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 28),

                // Name field
                _buildProfileItem(
                  icon: Icons.person,
                  title: 'Name',
                  value: user.name,
                  description: 'This is not your username or PIN. This name will be visible to your WhatsApp contacts.',
                  onEdit: () {
                    _nameController.text = user.name;
                    _showEditFieldDialog(
                      title: 'Enter your name',
                      hintText: 'Name',
                      controller: _nameController,
                      onSave: (newName) async {
                        await ref.read(authProvider.notifier).updateProfileMetadata(name: newName);
                      },
                    );
                  },
                ),
                const Padding(
                  padding: EdgeInsets.only(left: 72.0),
                  child: Divider(color: Color(0xFF202C33), height: 1),
                ),

                // About field
                _buildProfileItem(
                  icon: Icons.info_outline,
                  title: 'About',
                  value: user.about.isNotEmpty ? user.about : 'Hey there! I am using WhatsApp.',
                  description: '',
                  onEdit: () {
                    _aboutController.text = user.about.isNotEmpty ? user.about : 'Hey there! I am using WhatsApp.';
                    _showEditFieldDialog(
                      title: 'Enter status',
                      hintText: 'About',
                      controller: _aboutController,
                      onSave: (newAbout) async {
                        await ref.read(authProvider.notifier).updateProfileMetadata(about: newAbout);
                      },
                    );
                  },
                ),
                const Padding(
                  padding: EdgeInsets.only(left: 72.0),
                  child: Divider(color: Color(0xFF202C33), height: 1),
                ),

                // Username (Read-Only)
                _buildProfileItem(
                  icon: Icons.alternate_email,
                  title: 'Username',
                  value: '@${user.username}',
                  description: 'Your username is unique and allows other users to search for you.',
                  onEdit: null, // Read-only
                ),
              ],
            ),
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

  Widget _buildProfileItem({
    required IconData icon,
    required String title,
    required String value,
    required String description,
    required VoidCallback? onEdit,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFF8696A0), size: 24),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13)),
                const SizedBox(height: 6),
                Text(value, style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 15, fontWeight: FontWeight.w500)),
                if (description.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    description,
                    style: const TextStyle(color: Color(0xFF8696A0), fontSize: 11, height: 1.4),
                  ),
                ],
              ],
            ),
          ),
          if (onEdit != null)
            IconButton(
              icon: const Icon(Icons.edit, color: Color(0xFF00A884), size: 20),
              onPressed: onEdit,
            ),
        ],
      ),
    );
  }
}
