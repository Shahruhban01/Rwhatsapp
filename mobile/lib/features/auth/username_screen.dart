import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';

class UsernameScreen extends ConsumerStatefulWidget {
  const UsernameScreen({super.key});

  @override
  ConsumerState<UsernameScreen> createState() => _UsernameScreenState();
}

class _UsernameScreenState extends ConsumerState<UsernameScreen> {
  final _usernameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _isChecking = false;
  bool _isSubmitting = false;
  bool? _isAvailable;
  String? _errorMessage;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _usernameController.addListener(_onUsernameChanged);
  }

  @override
  void dispose() {
    _usernameController.removeListener(_onUsernameChanged);
    _usernameController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onUsernameChanged() {
    final text = _usernameController.text.trim().replaceAll('@', '').toLowerCase();
    
    _debounce?.cancel();
    if (text.isEmpty || text.length < 3) {
      setState(() {
        _isAvailable = null;
        _errorMessage = null;
      });
      return;
    }

    final usernameRegex = RegExp(r'^[a-z0-9_]{3,20}$');
    if (!usernameRegex.hasMatch(text)) {
      setState(() {
        _isAvailable = false;
        _errorMessage = 'Only lowercase letters, numbers, and underscores are allowed (3-20 chars).';
      });
      return;
    }

    setState(() {
      _errorMessage = null;
    });

    _debounce = Timer(const Duration(milliseconds: 500), () async {
      setState(() {
        _isChecking = true;
      });

      final available = await ref.read(authProvider.notifier).checkUsernameAvailable(text);

      if (mounted) {
        setState(() {
          _isAvailable = available;
          _isChecking = false;
          if (!available) {
            _errorMessage = 'Username is already taken';
          }
        });
      }
    });
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate() || _isAvailable != true || _isChecking) return;

    setState(() {
      _isSubmitting = true;
      _errorMessage = null;
    });

    final text = _usernameController.text.trim().replaceAll('@', '').toLowerCase();

    try {
      await ref.read(authProvider.notifier).reserveUsername(text);
      if (mounted) {
        context.go('/dashboard');
      }
    } catch (err) {
      setState(() {
        _errorMessage = err.toString();
        _isSubmitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: 40),
                const Icon(
                  Icons.account_circle_outlined,
                  size: 80,
                  color: Color(0xFF00A884),
                ),
                const SizedBox(height: 24),
                
                const Text(
                  'Choose Username',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFFE9EDEF),
                  ),
                ),
                const SizedBox(height: 8),
                
                const Text(
                  'This username will represent you globally so other contacts can find you.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    color: Color(0xFF8696A0),
                  ),
                ),
                const SizedBox(height: 36),

                if (_errorMessage != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.redAccent.withOpacity(0.1),
                      border: Border.all(color: Colors.redAccent.withOpacity(0.5)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 20),
                ],

                // Username Input
                TextFormField(
                  controller: _usernameController,
                  style: const TextStyle(color: Color(0xFFE9EDEF)),
                  decoration: InputDecoration(
                    hintText: 'username',
                    hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                    prefixText: '@ ',
                    prefixStyle: const TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold),
                    filled: true,
                    fillColor: const Color(0xFF202C33),
                    suffixIcon: _isChecking
                        ? const UnconstrainedBox(
                            child: SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF00A884)),
                              ),
                            ),
                          )
                        : _isAvailable == true
                            ? const Icon(Icons.check_circle, color: Color(0xFF00A884))
                            : _isAvailable == false
                                ? const Icon(Icons.error, color: Colors.redAccent)
                                : null,
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
                const SizedBox(height: 28),

                // Save button
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: (_isAvailable == true && !_isChecking && !_isSubmitting)
                        ? _handleSubmit
                        : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00A884),
                      disabledBackgroundColor: const Color(0xFF00A884).withOpacity(0.3),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      elevation: 2,
                    ),
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.5,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text(
                            'CONFIRM AND ENTER',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              letterSpacing: 0.5,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
