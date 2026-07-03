import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/status_provider.dart';

class StatusCreatorScreen extends ConsumerStatefulWidget {
  const StatusCreatorScreen({super.key});

  @override
  ConsumerState<StatusCreatorScreen> createState() => _StatusCreatorScreenState();
}

class _StatusCreatorScreenState extends ConsumerState<StatusCreatorScreen> {
  final _textController = TextEditingController();
  final List<String> _bgColors = [
    '#9C27B0', // Purple
    '#E91E63', // Pink
    '#009688', // Teal
    '#3F51B5', // Indigo
    '#FF5722', // Deep Orange
    '#4CAF50', // Green
  ];
  int _colorIndex = 0;
  bool _submitting = false;

  Color _getCurrentColor() {
    final hex = _bgColors[_colorIndex].replaceFirst('#', '');
    return Color(int.parse('FF$hex', radix: 16));
  }

  Future<void> _postStatus() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    setState(() => _submitting = true);
    try {
      await ref.read(statusProvider.notifier).postTextStatus(text, _bgColors[_colorIndex]);
      if (mounted) {
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent),
        );
      }
    }
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bgColor = _getCurrentColor();

    return Scaffold(
      backgroundColor: bgColor,
      body: Stack(
        children: [
          SafeArea(
            child: Column(
              children: [
                // Top control bar
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white, size: 28),
                      onPressed: () => Navigator.pop(context),
                    ),
                    Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.color_lens, color: Colors.white, size: 28),
                          onPressed: () {
                            setState(() {
                              _colorIndex = (_colorIndex + 1) % _bgColors.length;
                            });
                          },
                        ),
                      ],
                    ),
                  ],
                ),
                // Text input area
                Expanded(
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24.0),
                      child: TextField(
                        controller: _textController,
                        maxLines: null,
                        keyboardType: TextInputType.multiline,
                        textAlign: TextAlign.center,
                        autofocus: true,
                        style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold),
                        decoration: const InputDecoration(
                          hintText: 'Type a status',
                          hintStyle: TextStyle(color: Colors.white60, fontSize: 32),
                          border: InputBorder.none,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // Submit floating button
          Positioned(
            bottom: 24,
            right: 24,
            child: FloatingActionButton(
              onPressed: _submitting ? null : _postStatus,
              backgroundColor: const Color(0xFF00A884),
              foregroundColor: Colors.white,
              child: _submitting
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Icon(Icons.send),
            ),
          ),
        ],
      ),
    );
  }
}
