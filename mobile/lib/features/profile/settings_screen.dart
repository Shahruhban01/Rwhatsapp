import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final user = authState.user;

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('Settings', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
      ),
      body: ListView(
        children: [
          // Profile section card
          if (user != null)
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              leading: CircleAvatar(
                backgroundColor: const Color(0xFF2A3942),
                radius: 30,
                child: Text(
                  user.name.isNotEmpty ? user.name[0].toUpperCase() : 'U',
                  style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: Color(0xFF00A884)),
                ),
              ),
              title: Text(
                user.name,
                style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.w600),
              ),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: 4.0),
                child: Text(
                  user.about.isNotEmpty ? user.about : 'Hey there! I am using WhatsApp.',
                  style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              trailing: const Icon(Icons.qr_code, color: Color(0xFF00A884)),
              onTap: () => context.push('/settings/profile'),
            ),
          const Divider(color: Color(0xFF202C33), height: 1),

          // Settings Items
          _buildSettingsTile(
            icon: Icons.key,
            title: 'Account',
            subtitle: 'Security notifications, change number',
            onTap: () {},
          ),
          _buildSettingsTile(
            icon: Icons.lock,
            title: 'Privacy',
            subtitle: 'Block contacts, disappearing messages',
            onTap: () => context.push('/settings/blocked'),
          ),
          _buildSettingsTile(
            icon: Icons.chat,
            title: 'Chats',
            subtitle: 'Theme, wallpapers, chat history',
            onTap: () {},
          ),
          _buildSettingsTile(
            icon: Icons.notifications,
            title: 'Notifications',
            subtitle: 'Message, group & call tones',
            onTap: () {},
          ),
          _buildSettingsTile(
            icon: Icons.data_usage,
            title: 'Storage and Data',
            subtitle: 'Network usage, auto-download',
            onTap: () {},
          ),
          _buildSettingsTile(
            icon: Icons.language,
            title: 'App Language',
            subtitle: "English (phone's language)",
            onTap: () {},
          ),
          _buildSettingsTile(
            icon: Icons.help_outline,
            title: 'Help',
            subtitle: 'Help center, contact us, privacy policy',
            onTap: () {},
          ),
          _buildSettingsTile(
            icon: Icons.people_outline,
            title: 'Invite a Friend',
            subtitle: '',
            onTap: () {},
          ),

          const SizedBox(height: 32),
          // Meta signature
          const Center(
            child: Column(
              children: [
                Text('from', style: TextStyle(color: Color(0xFF8696A0), fontSize: 11)),
                SizedBox(height: 4),
                Text(
                  'Meta',
                  style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 1),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildSettingsTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: Icon(icon, color: const Color(0xFF8696A0), size: 24),
      title: Text(title, style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 15, fontWeight: FontWeight.w500)),
      subtitle: subtitle.isNotEmpty
          ? Text(subtitle, style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13))
          : null,
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
    );
  }
}
