import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_database/firebase_database.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../config.dart';

class FirebaseService {
  static Future<void> init() async {
    WidgetsFlutterBinding.ensureInitialized();

    try {
      if (AppConfig.useEmulator) {
        await Firebase.initializeApp(
          options: const FirebaseOptions(
            apiKey: "dummy-api-key-for-emulator",
            appId: "1:1234567890:android:1234567890",
            messagingSenderId: "1234567890",
            projectId: "whatsapp-clone-dev",
            databaseURL: "http://127.0.0.1:9000?ns=whatsapp-clone-dev",
          ),
        );

        final host = defaultTargetPlatform == TargetPlatform.android ? '10.0.2.2' : 'localhost';
        print('Connecting to Firestore emulator at $host:8080');
        FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
        
        print('Connecting to RTDB emulator at $host:9000');
        FirebaseDatabase.instance.useDatabaseEmulator(host, 9000);
      // } else {
        await Firebase.initializeApp(
          options: const FirebaseOptions(
            apiKey: "AIzaSyB3A7DqEA5pz6PHMGhiJDPrMaYrpW_bVSA",
            appId: "1:673715656991:android:3e0d8650dfc360be64382a",
            messagingSenderId: "673715656991",
            projectId: "ruhbans-whatsapp",
            databaseURL: "https://ruhbans-whatsapp-default-rtdb.firebaseio.com",
          ),
        );
      }
    } catch (e) {
      print('Firebase initialization failed: $e');
    }
  }
}
