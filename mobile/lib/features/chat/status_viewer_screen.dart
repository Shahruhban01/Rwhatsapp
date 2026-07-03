import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';
import 'package:go_router/go_router.dart';
import '../../providers/status_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../config.dart';

class StatusViewerScreen extends ConsumerStatefulWidget {
  final UserStatusModel userStatus;

  const StatusViewerScreen({super.key, required this.userStatus});

  @override
  ConsumerState<StatusViewerScreen> createState() => _StatusViewerScreenState();
}

class _StatusViewerScreenState extends ConsumerState<StatusViewerScreen> {
  int _currentIndex = 0;
  double _percent = 0.0;
  Timer? _timer;

  bool _isPaused = false;

  @override
  void initState() {
    super.initState();
    _startStory();
  }

  void _startStory() {
    _percent = 0.0;
    _timer?.cancel();
    
    // Mark as viewed on backend
    final currentStory = widget.userStatus.stories[_currentIndex];
    ref.read(statusProvider.notifier).viewStatus(currentStory.storyId);

    _timer = Timer.periodic(const Duration(milliseconds: 50), (timer) {
      if (_isPaused) return;
      setState(() {
        if (_percent < 1.0) {
          _percent += 0.01; // 50ms * 100 = 5 seconds
        } else {
          _timer?.cancel();
          _nextStory();
        }
      });
    });
  }

  void _nextStory() {
    if (_currentIndex < widget.userStatus.stories.length - 1) {
      setState(() {
        _currentIndex++;
      });
      _startStory();
    } else {
      Navigator.pop(context);
    }
  }

  void _previousStory() {
    if (_currentIndex > 0) {
      setState(() {
        _currentIndex--;
      });
      _startStory();
    } else {
      // Restart current
      _startStory();
    }
  }

  Future<void> _showProfileDetail() async {
    setState(() {
      _isPaused = true;
    });

    final name = widget.userStatus.name;
    final username = widget.userStatus.username;
    final userId = widget.userStatus.userId;

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF111B21),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return FutureBuilder<Response>(
          future: () async {
            final jwt = ref.read(authProvider).jwt;
            return Dio().get(
              '${AppConfig.apiUrl}/users/$userId',
              options: Options(headers: {'Authorization': 'Bearer $jwt'}),
            );
          }(),
          builder: (context, snapshot) {
            String about = 'Hey there! I am using WhatsApp.';
            bool loading = snapshot.connectionState == ConnectionState.waiting;

            if (snapshot.hasData && snapshot.data?.data != null) {
              final data = snapshot.data!.data;
              about = data['about'] ?? 'Hey there! I am using WhatsApp.';
            }

            return Container(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 24),
                  CircleAvatar(
                    backgroundColor: const Color(0xFF2A3942),
                    radius: 40,
                    child: Text(
                      name.isNotEmpty ? name[0].toUpperCase() : 'U',
                      style: const TextStyle(color: Color(0xFF00A884), fontSize: 36, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    name,
                    style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '@$username',
                    style: const TextStyle(color: Color(0xFF8696A0), fontSize: 14),
                  ),
                  const SizedBox(height: 24),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'About',
                      style: TextStyle(color: Color(0xFF8696A0), fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: loading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF00A884)),
                          )
                        : Text(
                            about,
                            style: const TextStyle(color: Color(0xFFE9EDEF), fontSize: 16),
                          ),
                  ),
                  const SizedBox(height: 32),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      ElevatedButton.icon(
                        onPressed: () async {
                          try {
                            final chatId = await ref.read(chatProvider.notifier).startChatWithUser(username);
                            if (context.mounted) {
                              Navigator.pop(context); // Close bottom sheet
                              Navigator.pop(context); // Close status viewer
                              context.push('/chat/$chatId');
                            }
                          } catch (e) {
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text('Could not start chat: $e')),
                              );
                            }
                          }
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF00A884),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                          ),
                        ),
                        icon: const Icon(Icons.message),
                        label: const Text('Message'),
                      ),
                      OutlinedButton.icon(
                        onPressed: () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF8696A0),
                          side: const BorderSide(color: Colors.white24),
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                          ),
                        ),
                        icon: const Icon(Icons.close),
                        label: const Text('Close'),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    ).then((_) {
      setState(() {
        _isPaused = false;
      });
    });
  }

  Future<void> _confirmDeleteStatus(String storyId) async {
    setState(() {
      _isPaused = true;
    });

    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF222E35),
        title: const Text('Delete status?', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        content: const Text('This status update will be deleted for everyone who received it.', style: TextStyle(color: Color(0xFF8696A0))),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('CANCEL', style: TextStyle(color: Color(0xFF8696A0))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('DELETE', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await ref.read(statusProvider.notifier).deleteStatus(storyId);
        if (mounted) {
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Status deleted')),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Failed to delete status: $e'), backgroundColor: Colors.redAccent),
          );
        }
      }
    } else {
      setState(() {
        _isPaused = false;
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final story = widget.userStatus.stories[_currentIndex];

    // Background color
    Color bgColor = Colors.black;
    if (story.type == 'text' && story.textBackgroundColor != null) {
      final hex = story.textBackgroundColor!.replaceFirst('#', '');
      bgColor = Color(int.parse('FF$hex', radix: 16));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onLongPressStart: (_) {
          setState(() {
            _isPaused = true;
          });
        },
        onLongPressEnd: (_) {
          setState(() {
            _isPaused = false;
          });
        },
        onTapDown: (details) {
          if (_isPaused) return;
          final width = MediaQuery.of(context).size.width;
          if (details.globalPosition.dx < width / 3) {
            _previousStory();
          } else {
            _nextStory();
          }
        },
        child: Stack(
          children: [
            // Status Content
            Positioned.fill(
              child: Container(
                color: bgColor,
                child: story.type == 'text'
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 32.0),
                          child: Text(
                            story.content ?? '',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      )
                    : Stack(
                        alignment: Alignment.center,
                        children: [
                          if (story.mediaUrl != null)
                            Image.network(
                              story.mediaUrl!,
                              fit: BoxFit.cover,
                              width: double.infinity,
                              height: double.infinity,
                              loadingBuilder: (context, child, progress) {
                                if (progress == null) return child;
                                return const Center(
                                  child: CircularProgressIndicator(color: Color(0xFF00A884)),
                                );
                              },
                            ),
                          if (story.caption != null && story.caption!.isNotEmpty)
                            Positioned(
                              bottom: 48,
                              left: 16,
                              right: 16,
                              child: Container(
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                                decoration: BoxDecoration(
                                  color: Colors.black54,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  story.caption!,
                                  style: const TextStyle(color: Colors.white, fontSize: 16),
                                  textAlign: TextAlign.center,
                                ),
                              ),
                            ),
                        ],
                      ),
              ),
            ),

            // Top Bar Overlay
            SafeArea(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Progress Bars
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8.0, vertical: 8),
                    child: Row(
                      children: List.generate(
                        widget.userStatus.stories.length,
                        (index) => Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2.0),
                            child: LinearProgressIndicator(
                              value: index == _currentIndex
                                  ? _percent
                                  : index < _currentIndex
                                      ? 1.0
                                      : 0.0,
                              backgroundColor: Colors.white24,
                              valueColor: const AlwaysStoppedAnimation<Color>(Colors.white),
                              minHeight: 3,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  // User Info
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4),
                    child: Row(
                      children: [
                        GestureDetector(
                          onTap: _showProfileDetail,
                          child: CircleAvatar(
                            backgroundColor: const Color(0xFF2A3942),
                            radius: 20,
                            child: Text(
                              widget.userStatus.name.isNotEmpty
                                  ? widget.userStatus.name[0].toUpperCase()
                                  : 'U',
                              style: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: GestureDetector(
                            onTap: _showProfileDetail,
                            behavior: HitTestBehavior.opaque,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.userStatus.name,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '@${widget.userStatus.username}',
                                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                        ),
                        if (widget.userStatus.userId == ref.watch(authProvider).user?.userId)
                          IconButton(
                            icon: const Icon(Icons.delete_outline, color: Colors.white),
                            onPressed: () => _confirmDeleteStatus(story.storyId),
                            tooltip: 'Delete Status',
                          ),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.white),
                          onPressed: () => Navigator.pop(context),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
