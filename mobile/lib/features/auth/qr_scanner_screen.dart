import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/auth_provider.dart';

class QrScannerScreen extends ConsumerStatefulWidget {
  const QrScannerScreen({super.key});

  @override
  ConsumerState<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends ConsumerState<QrScannerScreen> {
  final _sessionIdController = TextEditingController();
  bool _isLoading = false;
  String? _statusMessage;
  String? _errorMessage;

  @override
  void dispose() {
    _sessionIdController.dispose();
    super.dispose();
  }

  Future<void> _handleSimulateScan() async {
    final qrSessionId = _sessionIdController.text.trim();
    if (qrSessionId.isEmpty) return;

    setState(() {
      _isLoading = true;
      _statusMessage = 'Simulating scan...';
      _errorMessage = null;
    });

    try {
      final notifier = ref.read(authProvider.notifier);
      
      // 1. Notify backend we scanned the QR code (transitions status to 'scanned' on web)
      await notifier.scanQrCode(qrSessionId);
      
      setState(() {
        _isLoading = false;
        _statusMessage = null;
      });

      // 2. Show confirmation prompt to Approve/Deny login
      if (mounted) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (dialogCtx) => AlertDialog(
            backgroundColor: const Color(0xFF202C33),
            title: const Text('Log in to Web?', style: TextStyle(color: Color(0xFFE9EDEF))),
            content: const Text(
              'A web browser is requesting access to your WhatsApp account. Do you want to log in?',
              style: TextStyle(color: Color(0xFF8696A0)),
            ),
            actions: [
              TextButton(
                onPressed: () {
                  Navigator.of(dialogCtx).pop(); // Close dialog
                },
                child: const Text('CANCEL', style: TextStyle(color: Colors.redAccent)),
              ),
              TextButton(
                onPressed: () async {
                  Navigator.of(dialogCtx).pop(); // Close dialog
                  await _confirmLogin(qrSessionId);
                },
                child: const Text('APPROVE', style: TextStyle(color: Color(0xFF00A884), fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        );
      }
    } catch (err) {
      setState(() {
        _errorMessage = err.toString();
        _isLoading = false;
        _statusMessage = null;
      });
    }
  }

  Future<void> _confirmLogin(String qrSessionId) async {
    setState(() {
      _isLoading = true;
      _statusMessage = 'Approving web session...';
    });

    try {
      await ref.read(authProvider.notifier).confirmQrLogin(qrSessionId);
      
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Logged in successfully!'),
            backgroundColor: Color(0xFF00A884),
          ),
        );
        Navigator.of(context).pop(); // Go back to settings/profile
      }
    } catch (err) {
      setState(() {
        _errorMessage = err.toString();
        _isLoading = false;
        _statusMessage = null;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('Link a Device', style: TextStyle(color: Color(0xFFE9EDEF))),
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.qr_code_scanner,
              size: 80,
              color: Color(0xFF00A884),
            ),
            const SizedBox(height: 24),
            const Text(
              'Scan QR Code Simulator',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: Color(0xFFE9EDEF),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Since this is running in a simulator, copy the QR Session ID shown on the web client login screen and paste it below to link your browser.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: Color(0xFF8696A0),
                height: 1.4,
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

            if (_statusMessage != null) ...[
              Text(
                _statusMessage!,
                style: const TextStyle(color: Color(0xFF00A884), fontSize: 14, fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 20),
            ],

            // Input for qrSessionId
            TextField(
              controller: _sessionIdController,
              style: const TextStyle(color: Color(0xFFE9EDEF)),
              decoration: InputDecoration(
                hintText: 'Paste QR Session ID here',
                hintStyle: const TextStyle(color: Color(0xFF8696A0)),
                filled: true,
                fillColor: const Color(0xFF202C33),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: BorderSide.none,
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Color(0xFF00A884), width: 1.5),
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Scan trigger button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _isLoading ? null : _handleSimulateScan,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00A884),
                  disabledBackgroundColor: const Color(0xFF00A884).withOpacity(0.3),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: _isLoading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Text(
                        'LINK DEVICE',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
