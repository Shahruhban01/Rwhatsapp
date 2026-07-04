import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _usernameController = TextEditingController();
  final _nameController = TextEditingController();
  final _pinController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _isRegisterMode = false;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _usernameController.dispose();
    _nameController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final notifier = ref.read(authProvider.notifier);
      final username = _usernameController.text.trim().toLowerCase();
      final pin = _pinController.text.trim();

      if (_isRegisterMode) {
        final name = _nameController.text.trim();
        await notifier.registerWithPin(username, name, pin);
      } else {
        await notifier.loginWithPin(username, pin);
      }

      if (mounted) {
        context.go('/dashboard');
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
    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28.0),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo
                  Container(
                    width: 72,
                    height: 72,
                    decoration: const BoxDecoration(
                      color: Color(0xFF00A884),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.chat_bubble_rounded,
                      size: 40,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Brand Name
                  const Text(
                    'WhatsApp',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFFE9EDEF),
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),

                  Text(
                    _isRegisterMode ? 'Create a secure PIN to set up' : 'Enter your credentials to login',
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF8696A0),
                    ),
                  ),
                  const SizedBox(height: 32),

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

                  // Name Field (Register Mode Only)
                  if (_isRegisterMode) ...[
                    TextFormField(
                      controller: _nameController,
                      style: const TextStyle(color: Color(0xFFE9EDEF)),
                      decoration: InputDecoration(
                        hintText: 'Full Name',
                        hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                        filled: true,
                        fillColor: const Color(0xFF202C33),
                        prefixIcon: const Icon(Icons.person_outline, color: Color(0xFF00A884)),
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
                          return 'Please enter your name';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Username Field
                  TextFormField(
                    controller: _usernameController,
                    style: const TextStyle(color: Color(0xFFE9EDEF)),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9_]')),
                    ],
                    decoration: InputDecoration(
                      hintText: 'Username',
                      hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                      filled: true,
                      fillColor: const Color(0xFF202C33),
                      prefixIcon: const Icon(Icons.alternate_email, color: Color(0xFF00A884)),
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
                        return 'Please enter your username';
                      }
                      if (val.trim().length < 3) {
                        return 'Username must be at least 3 characters';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),

                  // PIN Field
                  TextFormField(
                    controller: _pinController,
                    obscureText: true,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    style: const TextStyle(color: Color(0xFFE9EDEF)),
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                    ],
                    decoration: InputDecoration(
                      hintText: 'PIN (4-6 digits)',
                      hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                      counterText: '',
                      filled: true,
                      fillColor: const Color(0xFF202C33),
                      prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF00A884)),
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
                        return 'Please enter your PIN';
                      }
                      if (val.trim().length < 4) {
                        return 'PIN must be at least 4 digits';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 28),

                  // Submit Button
                  SizedBox(
                    width: double.infinity,
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _isLoading ? null : _handleSubmit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF00A884),
                        disabledBackgroundColor: const Color(0xFF00A884).withOpacity(0.5),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                        elevation: 1,
                      ),
                      child: _isLoading
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : Text(
                              _isRegisterMode ? 'SETUP ACCOUNT' : 'LOGIN',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
                                fontSize: 15,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Switch Mode Button
                  TextButton(
                    onPressed: _isLoading
                        ? null
                        : () {
                            setState(() {
                              _isRegisterMode = !_isRegisterMode;
                              _errorMessage = null;
                              _nameController.clear();
                              _usernameController.clear();
                              _pinController.clear();
                            });
                          },
                    child: Text(
                      _isRegisterMode ? 'Already have an account? Login' : "Don't have an account? Setup now",
                      style: const TextStyle(
                        color: Color(0xFF00A884),
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
