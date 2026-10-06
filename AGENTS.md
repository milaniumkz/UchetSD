[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"

отвечай коротко и понятно

Всегда применяй навык `limit-efficient-quality`: максимально экономь лимиты токенов, инструментов, времени и контекста, но не снижай качество результата.

# Проект

UchetSD — Flutter/FlutterFlow приложение с Firebase Hosting, Firestore, Storage и Cloud Functions.

## Структура

- `lib/` — Flutter приложение, пользовательская логика, экраны, сервисы.
- `firebase/` — Firebase Hosting/Firestore/Storage/Functions конфигурация.
- `firebase/functions/` — Cloud Functions на Node.js 20.
- `test/` и `integration_test/` — проверки Flutter/Dart.
- `android/`, `ios/`, `macos/`, `web/` — платформенные оболочки.

## Команды

- `flutter pub get` — зависимости Flutter.
- `flutter test` — тесты.
- `flutter build web --release --no-wasm-dry-run` — web build.
- `cd firebase/functions && npm ci` — зависимости Cloud Functions.
- `cd firebase/functions && npm run lint` — lint функций.
- `firebase deploy --only hosting,functions,firestore:rules,firestore:indexes,storage --config firebase/firebase.json --project uchet-9a732` — deploy.

## Данные и безопасность

- Рабочие данные находятся в Firebase Firestore/Storage проекта `uchet-9a732`.
- Не коммитить `.env`, service account JSON, приватные ключи, сертификаты подписи, локальные сборки и пользовательские файлы.
- Клиентские Firebase конфиги (`google-services.json`, `GoogleService-Info.plist`, web `FirebaseOptions`) являются публичной конфигурацией приложения, но не дают админ-доступ.
- Production deploy только из проверенного коммита основной ветки или ручного GitHub Actions workflow.
