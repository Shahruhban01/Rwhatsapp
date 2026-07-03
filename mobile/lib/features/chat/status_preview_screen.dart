import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/chat_provider.dart';
import '../../providers/status_provider.dart';

class StatusPreviewScreen extends ConsumerStatefulWidget {
  final String imagePath;
  final String imageName;

  const StatusPreviewScreen({
    super.key,
    required this.imagePath,
    required this.imageName,
  });

  @override
  ConsumerState<StatusPreviewScreen> createState() => _StatusPreviewScreenState();
}

class _StatusPreviewScreenState extends ConsumerState<StatusPreviewScreen> {
  final _captionController = TextEditingController();
  bool _isUploading = false;

  Future<void> _handleSend() async {
    setState(() => _isUploading = true);

    try {
      // 1. Upload to storage
      final uploadRes = await ref.read(chatProvider.notifier).uploadFile(widget.imagePath, widget.imageName);
      final url = uploadRes['url'];

      // 2. Post as status
      await ref.read(statusProvider.notifier).postMediaStatus(
            url,
            _captionController.text.trim(),
          );

      if (mounted) {
        // Go back twice to return to updates tab
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isUploading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to share status: $e'), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  @override
  void dispose() {
    _captionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Status Preview', style: TextStyle(color: Colors.white, fontSize: 16)),
      ),
      body: Stack(
        children: [
          // Fullscreen image
          Positioned.fill(
            child: InteractiveViewer(
              child: Image.file(
                File(widget.imagePath),
                fit: BoxFit.contain,
              ),
            ),
          ),

          // Caption input at bottom
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              color: Colors.black54,
              padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
              child: SafeArea(
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _captionController,
                        style: const TextStyle(color: Colors.white, fontSize: 15),
                        maxLines: null,
                        decoration: InputDecoration(
                          hintText: 'Add a caption...',
                          hintStyle: const TextStyle(color: Colors.white60),
                          filled: true,
                          fillColor: const Color(0xFF2A3942),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(24),
                            borderSide: BorderSide.none,
                          ),
                          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    CircleAvatar(
                      backgroundColor: const Color(0xFF00A884),
                      radius: 22,
                      child: _isUploading
                          ? const CircularProgressIndicator(color: Colors.white)
                          : IconButton(
                              icon: const Icon(Icons.send, color: Colors.white, size: 20),
                              onPressed: _handleSend,
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
