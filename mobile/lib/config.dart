import 'package:flutter/foundation.dart';

class AppConfig {
  // Set to true to test locally using the Firebase Emulator suite
  static const bool useEmulator = false;

  // Local & Production URLs
  static const String localAndroidUrl = 'http://10.0.2.2:5000/api';
  static const String localIosUrl = 'http://localhost:5000/api';
  static const String productionUrl = 'https://whatsapp.developerruhban.online/api';

  static String get apiUrl {
    if (useEmulator) {
      return defaultTargetPlatform == TargetPlatform.android ? localAndroidUrl : localIosUrl;
    }
    return productionUrl;
  }
}
