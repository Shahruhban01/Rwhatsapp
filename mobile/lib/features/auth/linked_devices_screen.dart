import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';

class LinkedDevicesScreen extends ConsumerStatefulWidget {
  const LinkedDevicesScreen({super.key});

  @override
  ConsumerState<LinkedDevicesScreen> createState() => _LinkedDevicesScreenState();
}

class _LinkedDevicesScreenState extends ConsumerState<LinkedDevicesScreen> {
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadSessions();
  }

  Future<void> _loadSessions() async {
    setState(() => _loading = true);
    try {
      await ref.read(authProvider.notifier).fetchSessions();
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

  Future<void> _handleLogout(String sessionId) async {
    try {
      await ref.read(authProvider.notifier).logoutSession(sessionId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Device logged out successfully'), backgroundColor: Color(0xFF00A884)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  void _showLogoutDialog(ActiveSession session) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF222E35),
        title: Text(
          session.deviceName,
          style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Platform: ${session.platform.toUpperCase()}', style: const TextStyle(color: Color(0xFF8696A0), fontSize: 14)),
            const SizedBox(height: 4),
            Text('IP Address: ${session.ipAddress}', style: const TextStyle(color: Color(0xFF8696A0), fontSize: 14)),
            const SizedBox(height: 16),
            const Text(
              'Are you sure you want to log out from this device?',
              style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 14),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('CANCEL', style: TextStyle(color: Color(0xFF8696A0))),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _handleLogout(session.sessionId);
            },
            child: const Text('LOG OUT', style: TextStyle(color: Colors.redAccent)),
          ),
        ],
      ),
    );
  }

  String _formatDateTime(String? dateStr) {
    if (dateStr == null) return 'Unknown';
    try {
      final parsed = DateTime.parse(dateStr).toLocal();
      final hour = parsed.hour.toString().padLeft(2, '0');
      final minute = parsed.minute.toString().padLeft(2, '0');
      return '${parsed.year}-${parsed.month.toString().padLeft(2, '0')}-${parsed.day.toString().padLeft(2, '0')} $hour:$minute';
    } catch (_) {
      return dateStr;
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('Linked Devices', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadSessions,
          )
        ],
      ),
      body: Column(
        children: [
          // Graphic section
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            color: const Color(0xFF111B21),
            child: Column(
              children: [
                const Center(
                  child: Icon(
                    Icons.devices,
                    size: 80,
                    color: Color(0xFF8696A0),
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  'Link other devices',
                  style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Use WhatsApp on web, desktop, and other devices without keeping your phone online.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF8696A0), fontSize: 13, height: 1.4),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => context.push('/link-device'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF00A884),
                    minimumSize: const Size.fromHeight(48),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                  ),
                  child: const Text(
                    'Link a Device',
                    style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Device list section
          Expanded(
            child: Container(
              color: const Color(0xFF111B21),
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text(
                      'DEVICE STATUS',
                      style: TextStyle(color: Color(0xFF8696A0), fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                    ),
                  ),
                  if (_loading)
                    const Expanded(
                      child: Center(
                        child: CircularProgressIndicator(color: Color(0xFF00A884)),
                      ),
                    )
                  else if (authState.sessions.isEmpty)
                    const Expanded(
                      child: Center(
                        child: Text(
                          'No devices linked currently.',
                          style: TextStyle(color: Color(0xFF8696A0), fontSize: 14),
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        itemCount: authState.sessions.length,
                        separatorBuilder: (context, index) => const Divider(color: Color(0xFF202C33), height: 1, indent: 72),
                        itemBuilder: (context, index) {
                          final session = authState.sessions[index];
                          final isAndroid = session.platform.toLowerCase() == 'android';
                          final isIos = session.platform.toLowerCase() == 'ios';

                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: const Color(0xFF202C33),
                              radius: 20,
                              child: Icon(
                                (isAndroid || isIos) ? Icons.phone_android : Icons.computer,
                                color: const Color(0xFF8696A0),
                              ),
                            ),
                            title: Text(
                              session.deviceName.isNotEmpty ? session.deviceName : 'Web Client',
                              style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 15, fontWeight: FontWeight.w600),
                            ),
                            subtitle: Padding(
                              padding: const EdgeInsets.only(top: 4.0),
                              child: Text(
                                'Last active: ${_formatDateTime(session.lastActiveAt)}',
                                style: const TextStyle(color: Color(0xFF8696A0), fontSize: 12),
                              ),
                            ),
                            onTap: () => _showLogoutDialog(session),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
