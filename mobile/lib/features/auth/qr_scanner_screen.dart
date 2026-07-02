import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../providers/auth_provider.dart';

class QrScannerScreen extends ConsumerStatefulWidget {
  const QrScannerScreen({super.key});

  @override
  ConsumerState<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends ConsumerState<QrScannerScreen> {
  final _controller = MobileScannerController();
  final _sessionIdController = TextEditingController();
  bool _isLoading = false;
  bool _useManualInput = false;
  String? _statusMessage;
  String? _errorMessage;
  bool _hasScanned = false;

  @override
  void dispose() {
    _controller.dispose();
    _sessionIdController.dispose();
    super.dispose();
  }

  Future<void> _handleBarcode(BarcodeCapture capture) async {
    if (_hasScanned || _isLoading) return;
    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null || barcode.rawValue == null) return;

    final String qrSessionId = barcode.rawValue!.trim();
    if (qrSessionId.isEmpty) return;

    _hasScanned = true;
    _controller.stop();
    
    await _processLink(qrSessionId);
  }

  Future<void> _processLink(String input) async {
    setState(() {
      _isLoading = true;
      _statusMessage = 'Linking device...';
      _errorMessage = null;
    });

    try {
      final notifier = ref.read(authProvider.notifier);
      String qrSessionId = input;

      // Handle alphanumeric link code vs UUID qrSessionId
      if (input.length <= 12) {
        qrSessionId = await notifier.submitLinkCode(input);
      } else {
        await notifier.scanQrCode(qrSessionId);
      }
      
      setState(() {
        _isLoading = false;
        _statusMessage = null;
      });

      // Show confirmation prompt to Approve/Deny login
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
                  // Resume scanning
                  _hasScanned = false;
                  _controller.start();
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
        _hasScanned = false;
      });
      _controller.start();
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
        _hasScanned = false;
      });
      _controller.start();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B141A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF202C33),
        title: const Text('Link a Device', style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 18, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Color(0xFFE9EDEF)),
        actions: [
          if (!_useManualInput)
            IconButton(
              icon: ValueListenableBuilder(
                valueListenable: _controller,
                builder: (context, state, child) {
                  switch (state.torchState) {
                    case TorchState.off:
                      return const Icon(Icons.flash_off, color: Colors.grey);
                    case TorchState.on:
                      return const Icon(Icons.flash_on, color: Color(0xFF00A884));
                    default:
                      return const Icon(Icons.flash_off, color: Colors.grey);
                  }
                },
              ),
              onPressed: () => _controller.toggleTorch(),
            ),
        ],
      ),
      body: Stack(
        children: [
          if (!_useManualInput)
            // Camera scanner view
            MobileScanner(
              controller: _controller,
              onDetect: _handleBarcode,
              errorBuilder: (context, error) {
                return Center(
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    margin: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: const Color(0xFF202C33),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
                        const SizedBox(height: 16),
                        const Text(
                          'Camera Access Error',
                          style: TextStyle(color: Color(0xFFE9EDEF), fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          error.errorDetails?.message ?? 'Could not initialize camera scanner. Please type the link code instead.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFF8696A0), fontSize: 13),
                        ),
                        const SizedBox(height: 20),
                        ElevatedButton(
                          onPressed: () => setState(() => _useManualInput = true),
                          style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF00A884)),
                          child: const Text('LINK WITH CODE INSTEAD', style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),

          if (!_useManualInput)
            // Scan Frame Overlay
            Positioned.fill(
              child: Container(
                decoration: ShapeDecoration(
                  shape: QrScannerOverlayShape(
                    borderColor: const Color(0xFF00A884),
                    borderRadius: 24,
                    borderLength: 30,
                    borderWidth: 6,
                    cutOutSize: MediaQuery.of(context).size.width * 0.65,
                  ),
                ),
              ),
            ),

          // Instruction and switch controls
          Positioned(
            left: 24,
            right: 24,
            bottom: 40,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_errorMessage != null) ...[
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.redAccent.withValues(alpha: 0.1),
                      border: Border.all(color: Colors.redAccent.withValues(alpha: 0.5)),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _errorMessage!,
                      style: const TextStyle(color: Colors.redAccent, fontSize: 13),
                      textAlign: TextAlign.center,
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (_statusMessage != null) ...[
                  Text(
                    _statusMessage!,
                    style: const TextStyle(color: Color(0xFF00A884), fontSize: 14, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                ],

                if (_useManualInput) ...[
                  // Alphanumeric Link Code manual input view
                  TextField(
                    controller: _sessionIdController,
                    style: const TextStyle(color: Color(0xFFE9EDEF)),
                    decoration: InputDecoration(
                      hintText: 'Enter Link Code or Session ID',
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
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: SizedBox(
                          height: 48,
                          child: ElevatedButton(
                            onPressed: _isLoading ? null : () => _processLink(_sessionIdController.text.trim()),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF00A884),
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                            ),
                            child: const Text('LINK DEVICE', style: TextStyle(fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => setState(() {
                      _useManualInput = false;
                      _controller.start();
                    }),
                    child: const Text('SCAN QR CODE INSTEAD', style: TextStyle(color: Color(0xFF00A884))),
                  ),
                ] else ...[
                  const Text(
                    'Point your phone at the screen to scan the QR code',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () {
                      _controller.stop();
                      setState(() => _useManualInput = true);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF202C33),
                      foregroundColor: const Color(0xFFE9EDEF),
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                    ),
                    child: const Text('Link with Code instead', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Custom painter overlay for standard scanner viewbox
class QrScannerOverlayShape extends ShapeBorder {
  final Color borderColor;
  final double borderWidth;
  final double borderRadius;
  final double borderLength;
  final double cutOutSize;

  const QrScannerOverlayShape({
    this.borderColor = Colors.white,
    this.borderWidth = 4.0,
    this.borderRadius = 0.0,
    this.borderLength = 20.0,
    this.cutOutSize = 250.0,
  });

  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.zero;

  @override
  Path getInnerPath(Rect rect, {TextDirection? textDirection}) {
    return Path()
      ..addOval(Rect.fromCircle(
        center: rect.center,
        radius: cutOutSize / 2,
      ));
  }

  @override
  Path getOuterPath(Rect rect, {TextDirection? textDirection}) {
    return Path()..addRect(rect);
  }

  @override
  void paint(Canvas canvas, Rect rect, {TextDirection? textDirection}) {
    final width = rect.width;
    final height = rect.height;
    final size = cutOutSize;

    final left = (width - size) / 2;
    final top = (height - size) / 2;
    final right = left + size;
    final bottom = top + size;

    final backgroundPaint = Paint()
      ..color = Colors.black54
      ..style = PaintingStyle.fill;

    // Outer screen dark overlay except scanner hole
    canvas.drawPath(
      Path.combine(
        PathOperation.difference,
        Path()..addRect(rect),
        Path()
          ..addRRect(
            RRect.fromRectAndRadius(
              Rect.fromLTRB(left, top, right, bottom),
              Radius.circular(borderRadius),
            ),
          ),
      ),
      backgroundPaint,
    );

    // Frame paint
    final borderPaint = Paint()
      ..color = borderColor
      ..strokeWidth = borderWidth
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final radius = Radius.circular(borderRadius);

    // Top left corner
    canvas.drawPath(
      Path()
        ..moveTo(left, top + borderLength)
        ..lineTo(left, top + borderRadius)
        ..arcToPoint(Offset(left + borderRadius, top), radius: radius)
        ..lineTo(left + borderLength, top),
      borderPaint,
    );

    // Top right corner
    canvas.drawPath(
      Path()
        ..moveTo(right - borderLength, top)
        ..lineTo(right - borderRadius, top)
        ..arcToPoint(Offset(right, top + borderRadius), radius: radius)
        ..lineTo(right, top + borderLength),
      borderPaint,
    );

    // Bottom left corner
    canvas.drawPath(
      Path()
        ..moveTo(left, bottom - borderLength)
        ..lineTo(left, bottom - borderRadius)
        ..arcToPoint(Offset(left + borderRadius, bottom), radius: radius)
        ..lineTo(left + borderLength, bottom),
      borderPaint,
    );

    // Bottom right corner
    canvas.drawPath(
      Path()
        ..moveTo(right - borderLength, bottom)
        ..lineTo(right - borderRadius, bottom)
        ..arcToPoint(Offset(right, bottom - borderRadius), radius: radius)
        ..lineTo(right, bottom - borderLength),
      borderPaint,
    );
  }

  @override
  ShapeBorder scale(double t) {
    return QrScannerOverlayShape(
      borderColor: borderColor,
      borderWidth: borderWidth,
      borderRadius: borderRadius,
      borderLength: borderLength,
      cutOutSize: cutOutSize,
    );
  }
}
