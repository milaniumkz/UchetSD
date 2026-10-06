import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

Future initFirebase() async {
  if (kIsWeb) {
    await Firebase.initializeApp(
        options: FirebaseOptions(
            apiKey: "AIzaSyD1yrcLsvav5yI_06lliQUHy8zf8s7UWNk",
            authDomain: "uchet-9a732.firebaseapp.com",
            projectId: "uchet-9a732",
            storageBucket: "uchet-9a732.firebasestorage.app",
            messagingSenderId: "783662285477",
            appId: "1:783662285477:web:0e212f4a49edc06349c34c"));
  } else {
    await Firebase.initializeApp();
  }
  await _initFirestore();
}

Future<void> _initFirestore() async {
  final firestore = FirebaseFirestore.instance;
  if (kIsWeb) {
    firestore.settings = const Settings(
      persistenceEnabled: false,
      cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
    );
  } else {
    firestore.settings = const Settings(
      persistenceEnabled: true,
      cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
    );
  }
}
