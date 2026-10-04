# Flutter Frontend Integration Guide

> Complete guide for building a Flutter insurance app that integrates with the @insurance backend platform.

---

## Backend API changes (October 2026)

The sections below this one have not been rewritten yet. Where they disagree with this list, this list is correct.

| Area | What changed | What the app must do |
|---|---|---|
| Tenant header | Every tenant route returns `400` without `X-Tenant-ID`. Only `/tenant/config`, `/translation/languages`, `/translation/health` and `/platform/*` work without it. | Send `X-Tenant-ID` on every request, including login and signup. |
| Authentication | Every route requires a Bearer token unless listed as public: signup and OTP steps, login, refresh, password reset steps, Google login, `GET /branches*`, `/tenant/config`, `/translation/languages`. | `POST /logs/signup-log` and `POST /translation/translate` now need a token. |
| Password reset | `POST /auth/verify-otp-reset` returns `{ resetToken }` (single use, 10 minutes). `PATCH /auth/reset-password` requires `{ email, resetToken, newPassword }`. | Keep the `resetToken` from the verify step and send it with the new password. |
| Password reset OTP | `POST /auth/reset-password-otp` answers the same whether or not the email is registered. | Show a neutral message ("if an account exists…"). |
| Signup | `POST /auth/verify-otp` fails with `400` unless `/auth/verify-otp-email` succeeded first. `POST /auth/send-otp-sms` also requires the verified email. Signing up with an already registered email returns the normal "check your email" answer. | Call `verify-otp-email` before `send-otp-sms` and `verify-otp`. |
| OTP codes | A code is single use and is discarded after 5 wrong attempts. | On repeated failure, offer "resend code". |
| Profile update | `PATCH /auth/update-profile` no longer accepts `password`. A new `phone` requires `otpSms`, obtained with `POST /auth/send-otp-phone-change { phone }`. | Use `/auth/change-password` for passwords; add the OTP step for phone changes. |
| Change password | `PATCH /auth/change-password` returns a new `accessToken` and `refreshToken`; the previous refresh token stops working. | Replace the stored tokens with the returned ones. |
| Refresh | `POST /auth/refresh` validates the body: `{ refreshToken }` must be a JWT. A refresh token is invalid after a password reset or change. | On `401` from refresh, send the user to login. |
| Google mobile login | Body is `{ idToken }` only (not `id_token`); the Google email must be verified. | Send `idToken`. |
| Payments | `POST /payments` no longer accepts `userId`; the payer is the authenticated user. Reading a payment of another user returns `404`. | Remove `userId` from the request body. |
| Claims | `GET /claims/:id` returns `404` for a claim that belongs to another user. | None if the app only opens the user's own claims. |
| ERP mappings | `POST /erp/mappings` no longer accepts `userId`. Listing all mappings and `PUT /erp/mappings/:externalAccountId` are admin only. | Remove `userId` from the create body. |
| Request size | JSON bodies are limited to 1 MB (`413` above that). File uploads are unaffected. | None expected. |
| Health | `GET /health` returns only `{ status, timestamp }`. | Do not read other fields. |
| Tenant name | `X-Tenant-ID` must be the tenant slug exactly as issued: lower case, letters, digits, `-` and `_`. Anything else is answered `404` like an unknown tenant. | Send the slug unchanged; do not capitalise it. |
| Claim declaration | `POST /claims/declare` validates the form and answers `400` with a list of messages naming each wrong field. `typeIncident`, `dateIncident` (`YYYY-MM-DD`, not in the future) and `location` are required. Lists (`partsEndommagees`, `rayures`, `bosses`, `dommagesPoignee`) may be sent as a JSON array in one field, as a repeated field, or as a single value. `customFields` must be a JSON object. | Show the returned messages. A malformed list is now refused instead of being silently dropped. |
| Claim documents | Files go in the `files`, `images` or `documents` fields: at most 10 per claim, JPG, PNG, WEBP or PDF, 15 MB each. The type is detected from the content, not the file name. A claim and its documents are saved together or not at all; if file storage is unavailable the answer is `503` and nothing is saved. | On `503`, let the user retry the whole declaration. |
| Document links | `fileUrl` of a claim document is a link that works for one hour. | Do not store these links. Fetch the claim again to get fresh ones. |
| Claim details | `GET /claims/:id` now also returns `partsEndommagees`, `rayures`, `bosses` and `dommagesPoignee`. A claim id that is not a UUID is answered `400`. | Optional: display the damage detail. |
| Claim list | `GET /claims/my-claims` is paged: `?page=1&limit=50` (limit at most 100). The answer has `data`, `total` (all pages), `page` and `limit`. | Request further pages when `total` exceeds what was loaded. |
| Payments | `POST /payments` accepts `idempotencyKey` (any string you choose, up to 100 characters). Sending the same key again returns the first payment instead of creating another. `quoteId` must be an existing quote and `claimId` one of the user's own claims, otherwise `400`. Lists (`GET /payments/user/:userId`) are paged like claims. | Generate one key per payment attempt (for example a UUID) and reuse it when retrying after a timeout. |
| Payment status | A payment only moves forward: `pending` → `processing` → `completed` → `refunded`, or to `failed` / `cancelled`. Other changes are answered `400`. | None for the app; admin tools must follow the order. |
| Profile photo | `PATCH /auth/upload-profile-picture` and `PATCH /users/:id/photo` accept one JPG, PNG or WEBP image of at most 15 MB; the type is detected from the content. | Compress large photos before upload. |
| AI assistant: sessions | `POST /ai/chat` takes `{ message, sessionId? }`. Leave `sessionId` out to start a conversation; every answer returns the `sessionId` to send next. A conversation belongs to the user who started it and cannot be read or continued by anyone else (`GET /ai/context/:sessionId` answers `404`). `DELETE /ai/context/:sessionId` forgets a conversation and its photos. | Keep the `sessionId` from the response; do not generate your own. |
| AI assistant: limits | `message` is at most 4000 characters. `POST /ai/chat/with-images`: fields `message`, `sessionId`, `images` (at most 5 images, JPG/PNG/WEBP, 10 MB each). There is a daily message limit per user and per tenant: `429` with code `AI_DAILY_LIMIT_REACHED` when reached. | Show a "try again tomorrow" message for that code. |
| AI assistant: failures | When the model provider fails, the answer is an error with a `code` (`RATE_LIMIT_EXCEEDED`, `QUOTA_EXCEEDED`, `MODEL_UNAVAILABLE`, `TIMEOUT_ERROR`, `NETWORK_ERROR`) instead of a chat message containing an apology. A claim is filed once per conversation: `sinisterId` in the answer is the created claim. | Treat non-2xx as "assistant unavailable"; the conversation can be continued afterwards with the same `sessionId`. |
| Route names | `GET /quotes/by-product` and `/quotes/by-product/:productType` replace `devisByProduct`; `GET /ai/fields/claim` replaces `fields/sinistre`. The old paths still work. | Switch to the new names when convenient. |
| Quotes (admin) | `additionalInfo` and `testField` are no longer accepted when creating or updating a quote. | Remove them from admin forms. |
| Google sign-in (browser flow) | Where it is not configured on the server, `GET /auth/google` answers `503`. The mobile flow (`{ idToken }`) is unchanged. | None for the mobile app. |
| Codes that cannot be sent | When the email or SMS provider is down, the signup and "resend code" routes answer `503` ("The verification code could not be sent"), no longer `400`. | Tell the user to try again in a moment; nothing is wrong with what they entered. |
| Google sign-in (mobile) | `POST /auth/google/mobile` answers `401` for a token Google did not issue (it was `500`), and `503` when the server has no Google client id. | Treat `401` as "sign in again". |
| Address check | A location longer than 500 characters is refused (`400`). | Limit the address field to 500 characters. |
| Upload forms | A multipart form with a field named like an object internal (`constructor`, `toString`, ...) or with too many parts is answered `400`, no longer `500`. | None expected. |
| Rate limits | Limits are shared by all servers: 5 requests per second and 60 per minute per client, stricter on login and OTP routes. `429` carries a `Retry-After-short` or `Retry-After-medium` header (seconds). | Wait that long before retrying; do not retry in a tight loop. |

---

## Table of Contents

1. [Project Setup](#1-project-setup)
2. [Core Architecture](#2-core-architecture)
3. [API Client Setup](#3-api-client-setup)
4. [Authentication](#4-authentication)
5. [Tenant Configuration](#5-tenant-configuration)
6. [Claims Module](#6-claims-module)
7. [Quotes Module](#7-quotes-module)
8. [Payment Module](#8-payment-module)
9. [Notifications (FCM)](#9-notifications-fcm)
10. [Branches & Map](#10-branches--map)
11. [Multilingual Support](#11-multilingual-support)
12. [Google Sign-In](#12-google-sign-in)
13. [File Uploads](#13-file-uploads)
14. [State Management](#14-state-management)
15. [Production Checklist](#15-production-checklist)

---

## 1. Project Setup

### Create Project

```bash
flutter create --org com.cwinsurance insurance_app
cd insurance_app
```

### Dependencies

Add to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter

  # Networking
  dio: ^5.4.0
  retrofit: ^4.1.0
  json_annotation: ^4.8.1

  # State Management
  flutter_riverpod: ^2.5.1
  riverpod_annotation: ^2.3.5

  # Storage
  flutter_secure_storage: ^9.2.2
  shared_preferences: ^2.2.3

  # Auth
  google_sign_in: ^6.2.1

  # Notifications
  firebase_core: ^3.3.0
  firebase_messaging: ^15.0.0
  flutter_local_notifications: ^17.2.2

  # Maps
  google_maps_flutter: ^2.9.0

  # UI
  cached_network_image: ^3.3.1
  image_picker: ^1.1.2
  file_picker: ^8.0.7
  shimmer: ^3.0.0
  intl: ^0.19.0

  # Utilities
  freezed_annotation: ^2.4.4
  equatable: ^2.0.5

dev_dependencies:
  flutter_test:
    sdk: flutter
  build_runner: ^2.4.11
  json_serializable: ^6.8.0
  retrofit_generator: ^8.1.2
  freezed: ^2.5.2
  riverpod_generator: ^2.4.0
```

```bash
flutter pub get
```

---

## 2. Core Architecture

```
lib/
├── main.dart
├── app.dart
├── core/
│   ├── config/
│   │   ├── app_config.dart          # Base URL, tenant ID
│   │   └── dio_client.dart          # Dio + interceptors
│   ├── auth/
│   │   ├── auth_provider.dart       # Auth state (Riverpod)
│   │   ├── auth_repository.dart     # API calls
│   │   ├── token_storage.dart       # Secure token storage
│   │   └── auth_interceptor.dart    # Auto-attach JWT + refresh
│   ├── models/
│   │   ├── user.dart
│   │   ├── api_error.dart
│   │   └── paginated_response.dart
│   └── tenant/
│       ├── tenant_config.dart       # Tenant config model
│       └── tenant_provider.dart     # Fetch enabled plugins
├── features/
│   ├── claims/
│   │   ├── models/
│   │   ├── providers/
│   │   ├── repositories/
│   │   └── screens/
│   ├── quotes/
│   │   ├── models/
│   │   ├── providers/
│   │   ├── repositories/
│   │   └── screens/
│   ├── payments/
│   ├── notifications/
│   ├── branches/
│   └── profile/
└── shared/
    ├── widgets/
    ├── theme/
    └── l10n/                        # Localization files
```

---

## 3. API Client Setup

### 3.1 App Config

```dart
// lib/core/config/app_config.dart

class AppConfig {
  static const String baseUrl = 'http://10.0.2.2:3000/api/v1'; // Android emulator
  // static const String baseUrl = 'http://localhost:3000/api/v1'; // iOS simulator
  // static const String baseUrl = 'https://api.yourinsurance.com/api/v1'; // Production

  static const String tenantId = 'caar'; // Your tenant slug
}
```

### 3.2 Dio Client with Interceptors

```dart
// lib/core/config/dio_client.dart

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/token_storage.dart';
import 'app_config.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio(BaseOptions(
    baseUrl: AppConfig.baseUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  dio.interceptors.add(TenantInterceptor());
  dio.interceptors.add(AuthInterceptor(dio, ref));
  dio.interceptors.add(LogInterceptor(
    requestBody: true,
    responseBody: true,
  ));

  return dio;
});

/// Attaches x-tenant-id header to every request
class TenantInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['x-tenant-id'] = AppConfig.tenantId;
    super.onRequest(options, handler);
  }
}

/// Attaches JWT + auto-refreshes on 401
class AuthInterceptor extends Interceptor {
  final Dio _dio;
  final Ref _ref;
  bool _isRefreshing = false;

  AuthInterceptor(this._dio, this._ref);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await TokenStorage.getAccessToken();
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    super.onRequest(options, handler);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401 && !_isRefreshing) {
      _isRefreshing = true;
      try {
        final refreshToken = await TokenStorage.getRefreshToken();
        if (refreshToken == null) {
          _isRefreshing = false;
          return handler.next(err);
        }

        // Call refresh endpoint
        final response = await _dio.post(
          '/auth/refresh',
          data: {'refreshToken': refreshToken},
          options: Options(headers: {
            'x-tenant-id': AppConfig.tenantId,
          }),
        );

        final newAccess = response.data['accessToken'];
        final newRefresh = response.data['refreshToken'];
        await TokenStorage.saveTokens(newAccess, newRefresh);

        // Retry the original request
        err.requestOptions.headers['Authorization'] = 'Bearer $newAccess';
        final retryResponse = await _dio.fetch(err.requestOptions);
        _isRefreshing = false;
        return handler.resolve(retryResponse);
      } catch (e) {
        _isRefreshing = false;
        // Refresh failed → logout
        await TokenStorage.clear();
        // Navigate to login (use a global key or event bus)
      }
    }
    return handler.next(err);
  }
}
```

### 3.3 Secure Token Storage

```dart
// lib/core/auth/token_storage.dart

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStorage {
  static const _storage = FlutterSecureStorage();
  static const _accessKey = 'access_token';
  static const _refreshKey = 'refresh_token';

  static Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  static Future<String?> getAccessToken() => _storage.read(key: _accessKey);
  static Future<String?> getRefreshToken() => _storage.read(key: _refreshKey);

  static Future<void> clear() async {
    await _storage.deleteAll();
  }

  static Future<bool> hasTokens() async {
    final token = await _storage.read(key: _accessKey);
    return token != null;
  }
}
```

---

## 4. Authentication

### 4.1 Models

```dart
// lib/core/models/user.dart

import 'package:json_annotation/json_annotation.dart';
part 'user.g.dart';

@JsonSerializable()
class User {
  final String id;
  final String username;
  final String email;
  final String? phone;
  final String? profilePictureUrl;
  final String role;
  final String preferredLanguage;
  final DateTime createdAt;

  User({
    required this.id,
    required this.username,
    required this.email,
    this.phone,
    this.profilePictureUrl,
    required this.role,
    this.preferredLanguage = 'en',
    required this.createdAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => _$UserFromJson(json);
  Map<String, dynamic> toJson() => _$UserToJson(this);
}

@JsonSerializable()
class AuthResponse {
  final User user;
  final String accessToken;
  final String refreshToken;

  AuthResponse({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
  });

  factory AuthResponse.fromJson(Map<String, dynamic> json) =>
      _$AuthResponseFromJson(json);
}
```

### 4.2 Auth Repository

```dart
// lib/core/auth/auth_repository.dart

import 'package:dio/dio.dart';

class AuthRepository {
  final Dio _dio;

  AuthRepository(this._dio);

  /// Step 1: Signup → sends email OTP
  Future<void> signup({
    required String email,
    required String password,
    required String phone,
    required String username,
  }) async {
    await _dio.post('/auth/signup', data: {
      'email': email,
      'password': password,
      'phone': phone,
      'username': username,
    });
  }

  /// Step 2: Verify email OTP
  Future<void> verifyEmailOtp(String email, int otp) async {
    await _dio.post('/auth/verify-otp-email', data: {
      'email': email,
      'otpEmail': otp,
    });
  }

  /// Step 3 (optional): Send SMS OTP
  Future<void> sendSmsOtp(String email, String phone) async {
    await _dio.post('/auth/send-otp-sms', data: {
      'email': email,
      'phone': phone,
    });
  }

  /// Step 4: Create account (verify final OTPs)
  Future<AuthResponse> verifyOtp({
    required String email,
    String? phone,
    int? otpSms,
  }) async {
    final data = <String, dynamic>{'email': email};
    if (phone != null) data['phone'] = phone;
    if (otpSms != null) data['otpSms'] = otpSms;

    final response = await _dio.post('/auth/verify-otp', data: data);
    return AuthResponse.fromJson(response.data);
  }

  /// Login
  Future<AuthResponse> login(String email, String password) async {
    final response = await _dio.post('/auth/login', data: {
      'email': email,
      'password': password,
    });
    return AuthResponse.fromJson(response.data);
  }

  /// Get profile
  Future<User> getProfile() async {
    final response = await _dio.get('/auth/profile');
    return User.fromJson(response.data);
  }

  /// Refresh tokens
  Future<AuthResponse> refreshTokens(String refreshToken) async {
    final response = await _dio.post('/auth/refresh', data: {
      'refreshToken': refreshToken,
    });
    return AuthResponse.fromJson(response.data);
  }

  /// Password reset
  Future<void> requestPasswordReset(String email) async {
    await _dio.post('/auth/reset-password-otp', data: {'email': email});
  }

  Future<void> verifyResetOtp(String email, int otp) async {
    await _dio.post('/auth/verify-otp-reset', data: {
      'email': email,
      'otpEmail': otp,
    });
  }

  Future<void> resetPassword(String email, String newPassword) async {
    await _dio.patch('/auth/reset-password', data: {
      'email': email,
      'newPassword': newPassword,
    });
  }

  /// Logout
  Future<void> logout() async {
    await _dio.post('/auth/logout');
    await TokenStorage.clear();
  }
}
```

### 4.3 Auth State (Riverpod)

```dart
// lib/core/auth/auth_provider.dart

import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AuthStatus { initial, authenticated, unauthenticated, loading }

class AuthState {
  final AuthStatus status;
  final User? user;
  final String? error;

  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.error,
  });

  AuthState copyWith({AuthStatus? status, User? user, String? error}) =>
      AuthState(
        status: status ?? this.status,
        user: user ?? this.user,
        error: error,
      );
}

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthRepository _repo;

  AuthNotifier(this._repo) : super(const AuthState()) {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    final hasTokens = await TokenStorage.hasTokens();
    if (hasTokens) {
      try {
        final user = await _repo.getProfile();
        state = AuthState(status: AuthStatus.authenticated, user: user);
      } catch (_) {
        await TokenStorage.clear();
        state = const AuthState(status: AuthStatus.unauthenticated);
      }
    } else {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  Future<void> login(String email, String password) async {
    state = state.copyWith(status: AuthStatus.loading);
    try {
      final response = await _repo.login(email, password);
      await TokenStorage.saveTokens(response.accessToken, response.refreshToken);
      state = AuthState(status: AuthStatus.authenticated, user: response.user);
    } catch (e) {
      state = AuthState(
        status: AuthStatus.unauthenticated,
        error: _extractError(e),
      );
    }
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  String _extractError(dynamic e) {
    if (e is DioException) {
      return e.response?.data?['message'] ?? 'Network error';
    }
    return e.toString();
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final dio = ref.read(dioProvider);
  return AuthNotifier(AuthRepository(dio));
});
```

### 4.4 Login Screen

```dart
// lib/features/auth/screens/login_screen.dart

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    ref.listen(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated) {
        Navigator.pushReplacementNamed(context, '/home');
      }
      if (next.error != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(next.error!), backgroundColor: Colors.red),
        );
      }
    });

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Image.asset('assets/logo.png', height: 80),
                const SizedBox(height: 48),

                // Email
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.email_outlined),
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) =>
                      v != null && v.contains('@') ? null : 'Enter a valid email',
                ),
                const SizedBox(height: 16),

                // Password
                TextFormField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: 'Password',
                    prefixIcon: Icon(Icons.lock_outlined),
                    border: OutlineInputBorder(),
                  ),
                  validator: (v) =>
                      v != null && v.length >= 6 ? null : 'Min 6 characters',
                ),
                const SizedBox(height: 24),

                // Login button
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    onPressed: authState.status == AuthStatus.loading
                        ? null
                        : () {
                            if (_formKey.currentState!.validate()) {
                              ref.read(authProvider.notifier).login(
                                    _emailController.text.trim(),
                                    _passwordController.text,
                                  );
                            }
                          },
                    child: authState.status == AuthStatus.loading
                        ? const CircularProgressIndicator(color: Colors.white)
                        : const Text('Login'),
                  ),
                ),
                const SizedBox(height: 16),

                // Sign up link
                TextButton(
                  onPressed: () => Navigator.pushNamed(context, '/signup'),
                  child: const Text("Don't have an account? Sign up"),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

### 4.5 Signup Flow Screen

```dart
// lib/features/auth/screens/signup_screen.dart

class SignupScreen extends ConsumerStatefulWidget {
  const SignupScreen({super.key});

  @override
  ConsumerState<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends ConsumerState<SignupScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _usernameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _otpEmailCtrl = TextEditingController();
  final _otpSmsCtrl = TextEditingController();

  int _step = 1; // 1=form, 2=email OTP, 3=sms OTP (optional), 4=done
  bool _loading = false;

  Future<void> _signup() async {
    setState(() => _loading = true);
    try {
      final repo = AuthRepository(ref.read(dioProvider));
      await repo.signup(
        email: _emailCtrl.text.trim(),
        password: _passwordCtrl.text,
        phone: _phoneCtrl.text.trim(),
        username: _usernameCtrl.text.trim(),
      );
      setState(() => _step = 2);
    } catch (e) {
      _showError(e);
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _verifyEmail() async {
    setState(() => _loading = true);
    try {
      final repo = AuthRepository(ref.read(dioProvider));
      await repo.verifyEmailOtp(
        _emailCtrl.text.trim(),
        int.parse(_otpEmailCtrl.text.trim()),
      );
      // Choose: go to SMS step or skip and create account
      setState(() => _step = 3);
    } catch (e) {
      _showError(e);
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _createAccount({int? otpSms}) async {
    setState(() => _loading = true);
    try {
      final repo = AuthRepository(ref.read(dioProvider));
      final response = await repo.verifyOtp(
        email: _emailCtrl.text.trim(),
        phone: _phoneCtrl.text.trim(),
        otpSms: otpSms,
      );
      await TokenStorage.saveTokens(response.accessToken, response.refreshToken);
      if (mounted) Navigator.pushReplacementNamed(context, '/home');
    } catch (e) {
      _showError(e);
    } finally {
      setState(() => _loading = false);
    }
  }

  void _showError(dynamic e) {
    final msg = e is DioException
        ? e.response?.data?['message'] ?? 'Error'
        : e.toString();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Account')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _buildStep(),
      ),
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case 1:
        return _buildSignupForm();
      case 2:
        return _buildEmailOtpForm();
      case 3:
        return _buildSmsOtpForm();
      default:
        return const Center(child: CircularProgressIndicator());
    }
  }

  Widget _buildSignupForm() {
    return Column(children: [
      TextField(controller: _usernameCtrl, decoration: const InputDecoration(labelText: 'Username')),
      const SizedBox(height: 12),
      TextField(controller: _emailCtrl, decoration: const InputDecoration(labelText: 'Email')),
      const SizedBox(height: 12),
      TextField(controller: _phoneCtrl, decoration: const InputDecoration(labelText: 'Phone (+213...)')),
      const SizedBox(height: 12),
      TextField(controller: _passwordCtrl, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
      const SizedBox(height: 24),
      ElevatedButton(
        onPressed: _loading ? null : _signup,
        child: _loading ? const CircularProgressIndicator() : const Text('Sign Up'),
      ),
    ]);
  }

  Widget _buildEmailOtpForm() {
    return Column(children: [
      const Text('Check your email for the OTP code'),
      const SizedBox(height: 16),
      TextField(controller: _otpEmailCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Email OTP')),
      const SizedBox(height: 24),
      ElevatedButton(onPressed: _loading ? null : _verifyEmail, child: const Text('Verify Email')),
    ]);
  }

  Widget _buildSmsOtpForm() {
    return Column(children: [
      const Text('Enter SMS OTP or skip'),
      const SizedBox(height: 16),
      TextField(controller: _otpSmsCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'SMS OTP (optional)')),
      const SizedBox(height: 24),
      Row(children: [
        Expanded(
          child: OutlinedButton(
            onPressed: _loading ? null : () => _createAccount(),
            child: const Text('Skip SMS'),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            onPressed: _loading ? null : () => _createAccount(otpSms: int.tryParse(_otpSmsCtrl.text)),
            child: const Text('Verify & Create'),
          ),
        ),
      ]),
    ]);
  }
}
```

---

## 5. Tenant Configuration

Fetch tenant configuration at app startup to know which plugins are enabled:

```dart
// lib/core/tenant/tenant_config.dart

class TenantConfig {
  final String name;
  final Map<String, dynamic> branding;
  final List<String> enabledComponents;
  final List<String> supportedLanguages;
  final String defaultLanguage;

  TenantConfig({
    required this.name,
    required this.branding,
    required this.enabledComponents,
    required this.supportedLanguages,
    required this.defaultLanguage,
  });

  factory TenantConfig.fromJson(Map<String, dynamic> json) => TenantConfig(
        name: json['name'] ?? '',
        branding: json['branding'] ?? {},
        enabledComponents: List<String>.from(json['enabledComponents'] ?? []),
        supportedLanguages: List<String>.from(json['supportedLanguages'] ?? ['en']),
        defaultLanguage: json['defaultLanguage'] ?? 'en',
      );

  bool hasPlugin(String pluginId) => enabledComponents.contains(pluginId);
}

// lib/core/tenant/tenant_provider.dart

final tenantConfigProvider = FutureProvider<TenantConfig>((ref) async {
  final dio = ref.read(dioProvider);
  final response = await dio.get('/tenant/config');
  return TenantConfig.fromJson(response.data);
});
```

### Use in Navigation — Hide/Show Features

```dart
// In your home screen or navigation:

class HomeScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tenantConfig = ref.watch(tenantConfigProvider);

    return tenantConfig.when(
      data: (config) => Scaffold(
        body: GridView.count(
          crossAxisCount: 2,
          children: [
            // Always show
            _FeatureCard(icon: Icons.person, label: 'Profile', route: '/profile'),

            // Conditional based on enabled plugins
            if (config.hasPlugin('@insurance/claims'))
              _FeatureCard(icon: Icons.description, label: 'My Claims', route: '/claims'),

            if (config.hasPlugin('@insurance/quotes'))
              _FeatureCard(icon: Icons.request_quote, label: 'Quotes', route: '/quotes'),

            if (config.hasPlugin('@insurance/payment'))
              _FeatureCard(icon: Icons.payment, label: 'Payments', route: '/payments'),

            if (config.hasPlugin('@insurance/branches'))
              _FeatureCard(icon: Icons.location_on, label: 'Branches', route: '/branches'),

            if (config.hasPlugin('@insurance/notifications'))
              _FeatureCard(icon: Icons.notifications, label: 'Notifications', route: '/notifications'),
          ],
        ),
      ),
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('Error: $e')),
    );
  }
}
```

---

## 6. Claims Module

### 6.1 Claims Model

```dart
// lib/features/claims/models/claim.dart

@JsonSerializable()
class Claim {
  final String id;
  final String numDossier;
  final String typeIncident;
  final DateTime dateIncident;
  final String? timeIncident;
  final String location;
  final String? description;
  final String status; // SUBMITTED, IN_REVIEW, APPROVED, REJECTED, CLOSED
  final List<ClaimDocument>? documents;
  final double? montantApprouve;
  final DateTime createdAt;

  Claim({...});
  factory Claim.fromJson(Map<String, dynamic> json) => _$ClaimFromJson(json);
}

@JsonSerializable()
class ClaimDocument {
  final String id;
  final String name;
  final String url;
  final String? type;

  ClaimDocument({...});
  factory ClaimDocument.fromJson(Map<String, dynamic> json) => _$ClaimDocumentFromJson(json);
}
```

### 6.2 Claims Repository

```dart
// lib/features/claims/repositories/claims_repository.dart

class ClaimsRepository {
  final Dio _dio;
  ClaimsRepository(this._dio);

  /// Declare a new claim with file uploads
  Future<Claim> declareClaim({
    required String typeIncident,
    required String dateIncident,
    required String location,
    String? timeIncident,
    String? description,
    List<String>? damagedParts,
    List<File>? photos,
    Map<String, dynamic>? customFields,
  }) async {
    final formData = FormData();

    // Text fields
    formData.fields.addAll([
      MapEntry('typeIncident', typeIncident),
      MapEntry('dateIncident', dateIncident),
      MapEntry('location', location),
      if (timeIncident != null) MapEntry('timeIncident', timeIncident),
      if (description != null) MapEntry('description', description),
      if (damagedParts != null)
        MapEntry('partsEndommagees', jsonEncode(damagedParts)),
      if (customFields != null)
        MapEntry('customFields', jsonEncode(customFields)),
    ]);

    // File uploads
    if (photos != null) {
      for (final photo in photos) {
        formData.files.add(MapEntry(
          'files',
          await MultipartFile.fromFile(photo.path, filename: photo.path.split('/').last),
        ));
      }
    }

    final response = await _dio.post(
      '/claims/declare',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    return Claim.fromJson(response.data);
  }

  /// Get user's claims
  Future<List<Claim>> getMyClaims() async {
    final response = await _dio.get('/claims');
    return (response.data as List).map((e) => Claim.fromJson(e)).toList();
  }

  /// Get claim details
  Future<Claim> getClaimById(String id) async {
    final response = await _dio.get('/claims/$id');
    return Claim.fromJson(response.data);
  }
}
```

### 6.3 Claims Provider

```dart
// lib/features/claims/providers/claims_provider.dart

final claimsRepositoryProvider = Provider((ref) {
  return ClaimsRepository(ref.read(dioProvider));
});

final myClaimsProvider = FutureProvider<List<Claim>>((ref) async {
  return ref.read(claimsRepositoryProvider).getMyClaims();
});

final claimDetailProvider = FutureProvider.family<Claim, String>((ref, id) async {
  return ref.read(claimsRepositoryProvider).getClaimById(id);
});
```

### 6.4 Declare Claim Screen

```dart
// lib/features/claims/screens/declare_claim_screen.dart

class DeclareClaimScreen extends ConsumerStatefulWidget {
  @override
  ConsumerState<DeclareClaimScreen> createState() => _DeclareClaimScreenState();
}

class _DeclareClaimScreenState extends ConsumerState<DeclareClaimScreen> {
  final _typeCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  DateTime? _selectedDate;
  List<File> _photos = [];
  List<String> _selectedParts = [];
  bool _submitting = false;

  final _damagedPartOptions = [
    'Pare-chocs', 'Phares', 'Capot', 'Portière',
    'Aile', 'Rétroviseur', 'Pare-brise', 'Toit'
  ];

  Future<void> _pickPhotos() async {
    final picker = ImagePicker();
    final images = await picker.pickMultiImage();
    setState(() {
      _photos.addAll(images.map((x) => File(x.path)));
    });
  }

  Future<void> _submit() async {
    if (_typeCtrl.text.isEmpty || _selectedDate == null || _locationCtrl.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill required fields')),
      );
      return;
    }

    setState(() => _submitting = true);
    try {
      final claim = await ref.read(claimsRepositoryProvider).declareClaim(
        typeIncident: _typeCtrl.text,
        dateIncident: _selectedDate!.toIso8601String().split('T').first,
        location: _locationCtrl.text,
        description: _descriptionCtrl.text.isNotEmpty ? _descriptionCtrl.text : null,
        damagedParts: _selectedParts.isNotEmpty ? _selectedParts : null,
        photos: _photos.isNotEmpty ? _photos : null,
      );

      if (mounted) {
        ref.invalidate(myClaimsProvider); // Refresh list
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Claim ${claim.numDossier} submitted!')),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
      );
    } finally {
      setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Declare a Claim')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Incident type dropdown
            DropdownButtonFormField<String>(
              decoration: const InputDecoration(labelText: 'Incident Type *'),
              items: ['Accident', 'Vol', 'Feu', 'Bris de glace', 'Autre']
                  .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                  .toList(),
              onChanged: (v) => _typeCtrl.text = v ?? '',
            ),
            const SizedBox(height: 16),

            // Date picker
            ListTile(
              title: Text(_selectedDate == null
                  ? 'Select incident date *'
                  : 'Date: ${_selectedDate!.toLocal().toString().split(' ').first}'),
              trailing: const Icon(Icons.calendar_today),
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                );
                if (date != null) setState(() => _selectedDate = date);
              },
            ),
            const SizedBox(height: 16),

            // Location
            TextField(
              controller: _locationCtrl,
              decoration: const InputDecoration(labelText: 'Location *'),
            ),
            const SizedBox(height: 16),

            // Description
            TextField(
              controller: _descriptionCtrl,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'Description (optional)'),
            ),
            const SizedBox(height: 16),

            // Damaged parts chips
            const Text('Damaged Parts', style: TextStyle(fontWeight: FontWeight.bold)),
            Wrap(
              spacing: 8,
              children: _damagedPartOptions.map((part) {
                final selected = _selectedParts.contains(part);
                return FilterChip(
                  label: Text(part),
                  selected: selected,
                  onSelected: (v) {
                    setState(() {
                      v ? _selectedParts.add(part) : _selectedParts.remove(part);
                    });
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),

            // Photos
            Row(
              children: [
                const Text('Photos', style: TextStyle(fontWeight: FontWeight.bold)),
                const Spacer(),
                TextButton.icon(
                  icon: const Icon(Icons.add_a_photo),
                  label: const Text('Add'),
                  onPressed: _pickPhotos,
                ),
              ],
            ),
            if (_photos.isNotEmpty)
              SizedBox(
                height: 100,
                child: ListView.builder(
                  scrollDirection: Axis.horizontal,
                  itemCount: _photos.length,
                  itemBuilder: (_, i) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: Stack(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.file(_photos[i], height: 100, width: 100, fit: BoxFit.cover),
                      ),
                      Positioned(
                        top: 0,
                        right: 0,
                        child: GestureDetector(
                          onTap: () => setState(() => _photos.removeAt(i)),
                          child: const CircleAvatar(
                            radius: 12,
                            backgroundColor: Colors.red,
                            child: Icon(Icons.close, size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ]),
                  ),
                ),
              ),
            const SizedBox(height: 32),

            // Submit button
            SizedBox(
              width: double.infinity,
              height: 48,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text('Submit Claim'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## 7. Quotes Module

### 7.1 Models

```dart
@JsonSerializable()
class Quote {
  final String id;
  final String title;
  final double priceMonthly;
  final double deductible;
  final int termMonths;
  final String? planType;
  final String? startCondition;
  final String? productType;
  final List<CoverageDetail>? coverageDetails;
  final SummaryTerms? summaryTerms;

  Quote({...});
  factory Quote.fromJson(Map<String, dynamic> json) => _$QuoteFromJson(json);
}

@JsonSerializable()
class Product {
  final String id;
  final String type;
  final String? description;

  Product({...});
  factory Product.fromJson(Map<String, dynamic> json) => _$ProductFromJson(json);
}
```

### 7.2 Repository & Providers

```dart
class QuotesRepository {
  final Dio _dio;
  QuotesRepository(this._dio);

  Future<List<Quote>> getAllQuotes({String lang = 'en'}) async {
    final response = await _dio.get('/quotes', queryParameters: {'lang': lang});
    return (response.data as List).map((e) => Quote.fromJson(e)).toList();
  }

  Future<Quote> getQuoteDetails(String id, {String lang = 'en'}) async {
    final response = await _dio.get('/quotes/$id', queryParameters: {'lang': lang});
    return Quote.fromJson(response.data);
  }

  Future<List<Product>> getProducts({String lang = 'en'}) async {
    final response = await _dio.get('/quotes/products', queryParameters: {'lang': lang});
    return (response.data as List).map((e) => Product.fromJson(e)).toList();
  }

  Future<List<Quote>> getQuotesByProduct(String productType, {String lang = 'en'}) async {
    final response = await _dio.get('/quotes/by-product/$productType',
        queryParameters: {'lang': lang});
    return (response.data as List).map((e) => Quote.fromJson(e)).toList();
  }

  Future<Map<String, dynamic>> compareQuotes(String idA, String idB) async {
    final response = await _dio.post('/quotes/compare', data: {
      'devisAId': idA,
      'devisBId': idB,
    });
    return response.data;
  }
}

final quotesProvider = FutureProvider<List<Quote>>((ref) async {
  final dio = ref.read(dioProvider);
  return QuotesRepository(dio).getAllQuotes();
});

final productsProvider = FutureProvider<List<Product>>((ref) async {
  final dio = ref.read(dioProvider);
  return QuotesRepository(dio).getProducts();
});
```

### 7.3 Quotes List Screen

```dart
class QuotesListScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quotesAsync = ref.watch(quotesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Insurance Plans')),
      body: quotesAsync.when(
        data: (quotes) => ListView.builder(
          itemCount: quotes.length,
          itemBuilder: (_, i) {
            final quote = quotes[i];
            return Card(
              margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: ListTile(
                title: Text(quote.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${quote.priceMonthly} DZD/month • ${quote.termMonths} months'),
                trailing: Text(quote.planType ?? '', style: const TextStyle(color: Colors.blue)),
                onTap: () => Navigator.pushNamed(context, '/quotes/detail', arguments: quote.id),
              ),
            );
          },
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
```

---

## 8. Payment Module

```dart
class PaymentsRepository {
  final Dio _dio;
  PaymentsRepository(this._dio);

  Future<PaymentTransaction> createPayment({
    required String userId,
    required double amount,
    required String method,
    String? quoteId,
    String? claimId,
    String currency = 'DZD',
    String? description,
  }) async {
    final response = await _dio.post('/payments', data: {
      'userId': userId,
      'amount': amount,
      'method': method,
      if (quoteId != null) 'quoteId': quoteId,
      if (claimId != null) 'claimId': claimId,
      'currency': currency,
      if (description != null) 'description': description,
    });
    return PaymentTransaction.fromJson(response.data);
  }

  Future<List<PaymentTransaction>> getMyPayments(String userId) async {
    final response = await _dio.get('/payments/user/$userId');
    return (response.data as List).map((e) => PaymentTransaction.fromJson(e)).toList();
  }

  Future<PaymentTransaction> getByReference(String ref) async {
    final response = await _dio.get('/payments/reference/$ref');
    return PaymentTransaction.fromJson(response.data);
  }
}

@JsonSerializable()
class PaymentTransaction {
  final String id;
  final String referenceNumber;
  final String userId;
  final double amount;
  final String currency;
  final String status; // pending, processing, completed, failed, refunded, cancelled
  final String method; // bank_transfer, credit_card, cash, check, mobile
  final String? description;
  final DateTime createdAt;

  PaymentTransaction({...});
  factory PaymentTransaction.fromJson(Map<String, dynamic> json) =>
      _$PaymentTransactionFromJson(json);
}
```

---

## 9. Notifications (FCM)

### 9.1 Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Add your Flutter app (Android + iOS)
3. Download `google-services.json` → `android/app/`
4. Download `GoogleService-Info.plist` → `ios/Runner/`

### 9.2 Initialize in main.dart

```dart
// lib/main.dart

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

@pragma('vm:entry-point')
Future<void> _firebaseBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  // Handle background message
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseBackgroundHandler);
  runApp(const ProviderScope(child: InsuranceApp()));
}
```

### 9.3 FCM Service

```dart
// lib/core/notifications/fcm_service.dart

class FcmService {
  final Dio _dio;
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;

  FcmService(this._dio);

  Future<void> initialize() async {
    // Request permission
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      // Get FCM token
      final token = await _messaging.getToken();
      if (token != null) {
        await _registerToken(token);
      }

      // Listen for token refresh
      _messaging.onTokenRefresh.listen(_registerToken);

      // Foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        _showLocalNotification(message);
      });

      // Message opened app
      FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
        _handleNotificationTap(message);
      });
    }
  }

  Future<void> _registerToken(String token) async {
    await _dio.post('/notifications/device-token', data: {
      'token': token,
      'platform': Platform.isAndroid ? 'android' : 'ios',
    });
  }

  void _showLocalNotification(RemoteMessage message) {
    // Use flutter_local_notifications to show notification
    final notification = message.notification;
    if (notification != null) {
      FlutterLocalNotificationsPlugin().show(
        notification.hashCode,
        notification.title,
        notification.body,
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'insurance_channel',
            'Insurance Notifications',
            importance: Importance.high,
          ),
        ),
      );
    }
  }
}
```

### 9.4 Notification History

```dart
class NotificationRepository {
  final Dio _dio;
  NotificationRepository(this._dio);

  Future<PaginatedNotifications> getNotifications({int page = 1, int limit = 20}) async {
    final response = await _dio.get('/notifications', queryParameters: {
      'page': page,
      'limit': limit,
    });
    return PaginatedNotifications.fromJson(response.data);
  }

  Future<int> getUnreadCount() async {
    final response = await _dio.get('/notifications/unread-count');
    return response.data['unreadCount'];
  }

  Future<void> markAsRead(String notificationId) async {
    await _dio.patch('/notifications/$notificationId/read');
  }

  Future<void> markAllAsRead(List<String> ids) async {
    await _dio.patch('/notifications/mark-read', data: {'ids': ids});
  }
}
```

---

## 10. Branches & Map

### 10.1 Repository

```dart
class BranchesRepository {
  final Dio _dio;
  BranchesRepository(this._dio);

  Future<List<Branch>> getAllBranches() async {
    final response = await _dio.get('/branches');
    return (response.data['data'] as List).map((e) => Branch.fromJson(e)).toList();
  }

  Future<List<MapBranch>> getMapBranches() async {
    final response = await _dio.get('/branches/map');
    return (response.data as List).map((e) => MapBranch.fromJson(e)).toList();
  }
}

@JsonSerializable()
class MapBranch {
  final String id;
  final String name;
  final String code;
  final double latitude;
  final double longitude;
  final String? address;
  final String? phone;

  MapBranch({...});
  factory MapBranch.fromJson(Map<String, dynamic> json) => _$MapBranchFromJson(json);
}
```

### 10.2 Map Screen

```dart
class BranchesMapScreen extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branchesAsync = ref.watch(mapBranchesProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Our Branches')),
      body: branchesAsync.when(
        data: (branches) => GoogleMap(
          initialCameraPosition: const CameraPosition(
            target: LatLng(36.7538, 3.0588), // Algiers center
            zoom: 6,
          ),
          markers: branches.map((b) => Marker(
            markerId: MarkerId(b.id),
            position: LatLng(b.latitude, b.longitude),
            infoWindow: InfoWindow(title: b.name, snippet: b.address),
          )).toSet(),
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}
```

---

## 11. Multilingual Support

The backend returns translated content based on the `lang` query parameter. Your Flutter app should:

### 11.1 Language Provider

```dart
final languageProvider = StateProvider<String>((ref) => 'en');

// Use in API calls
final quotesProvider = FutureProvider<List<Quote>>((ref) async {
  final lang = ref.watch(languageProvider);
  final dio = ref.read(dioProvider);
  return QuotesRepository(dio).getAllQuotes(lang: lang);
});
```

### 11.2 Add Language Header to Dio

```dart
class LanguageInterceptor extends Interceptor {
  final Ref ref;
  LanguageInterceptor(this.ref);

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final lang = ref.read(languageProvider);
    options.headers['Accept-Language'] = lang;
    // Also append as query param if not present
    options.queryParameters.putIfAbsent('lang', () => lang);
    super.onRequest(options, handler);
  }
}
```

### 11.3 Flutter l10n (for static UI text)

```yaml
# pubspec.yaml
flutter:
  generate: true

# l10n.yaml
arb-dir: lib/shared/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
```

Create ARB files:

```json
// lib/shared/l10n/app_en.arb
{
  "login": "Login",
  "signup": "Sign Up",
  "myClaims": "My Claims",
  "declareClaim": "Declare a Claim",
  "quotes": "Insurance Plans",
  "payments": "Payments",
  "branches": "Branches",
  "profile": "Profile",
  "logout": "Logout"
}

// lib/shared/l10n/app_fr.arb
{
  "login": "Connexion",
  "signup": "S'inscrire",
  "myClaims": "Mes Sinistres",
  "declareClaim": "Déclarer un Sinistre",
  "quotes": "Plans d'Assurance",
  "payments": "Paiements",
  "branches": "Agences",
  "profile": "Profil",
  "logout": "Déconnexion"
}

// lib/shared/l10n/app_ar.arb
{
  "login": "تسجيل الدخول",
  "signup": "إنشاء حساب",
  "myClaims": "مطالباتي",
  "declareClaim": "تقديم مطالبة",
  "quotes": "خطط التأمين",
  "payments": "المدفوعات",
  "branches": "الفروع",
  "profile": "الملف الشخصي",
  "logout": "تسجيل الخروج"
}
```

### 11.4 RTL Support (Arabic)

```dart
// lib/app.dart

MaterialApp(
  locale: Locale(currentLang),
  supportedLocales: const [
    Locale('en'),
    Locale('fr'),
    Locale('ar'),
  ],
  localizationsDelegates: const [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
  ],
  builder: (context, child) {
    // Auto RTL for Arabic
    return Directionality(
      textDirection: currentLang == 'ar' ? TextDirection.rtl : TextDirection.ltr,
      child: child!,
    );
  },
)
```

---

## 12. Google Sign-In

```dart
// lib/features/auth/services/google_auth_service.dart

import 'package:google_sign_in/google_sign_in.dart';

class GoogleAuthService {
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: ['email', 'profile']);
  final Dio _dio;

  GoogleAuthService(this._dio);

  Future<AuthResponse?> signInWithGoogle() async {
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) return null; // User cancelled

      final auth = await account.authentication;
      final idToken = auth.idToken;

      if (idToken == null) throw Exception('No ID token from Google');

      // Send to backend
      final response = await _dio.post('/auth/google/mobile', data: {
        'idToken': idToken,
      });

      return AuthResponse.fromJson(response.data);
    } catch (e) {
      rethrow;
    }
  }
}
```

Usage in login screen:

```dart
ElevatedButton.icon(
  icon: Image.asset('assets/google_logo.png', height: 24),
  label: const Text('Sign in with Google'),
  onPressed: () async {
    final service = GoogleAuthService(ref.read(dioProvider));
    final response = await service.signInWithGoogle();
    if (response != null) {
      await TokenStorage.saveTokens(response.accessToken, response.refreshToken);
      // Navigate to home
    }
  },
)
```

---

## 13. File Uploads

### Profile Picture

```dart
Future<void> uploadProfilePicture(File photo) async {
  final dio = ref.read(dioProvider);
  final formData = FormData.fromMap({
    'file': await MultipartFile.fromFile(photo.path, filename: 'profile.jpg'),
  });
  await dio.patch('/auth/upload-profile-picture', data: formData,
      options: Options(contentType: 'multipart/form-data'));
}
```

### Claim Documents

```dart
Future<void> addDocumentsToClaim(String claimId, List<File> files) async {
  final formData = FormData();
  for (final file in files) {
    formData.files.add(MapEntry(
      'files',
      await MultipartFile.fromFile(file.path, filename: file.path.split('/').last),
    ));
  }
  await dio.post('/claims/$claimId/documents', data: formData,
      options: Options(contentType: 'multipart/form-data'));
}
```

---

## 14. State Management

### Recommended: Riverpod

```dart
// Pattern for all feature modules:

// 1. Repository Provider
final claimsRepoProvider = Provider((ref) => ClaimsRepository(ref.read(dioProvider)));

// 2. Data Provider (auto-fetching)
final myClaimsProvider = FutureProvider<List<Claim>>((ref) {
  return ref.read(claimsRepoProvider).getMyClaims();
});

// 3. Detail Provider (parameterized)
final claimDetailProvider = FutureProvider.family<Claim, String>((ref, id) {
  return ref.read(claimsRepoProvider).getClaimById(id);
});

// 4. Mutation (Notifier)
class DeclareClaimNotifier extends StateNotifier<AsyncValue<Claim?>> {
  final ClaimsRepository _repo;
  DeclareClaimNotifier(this._repo) : super(const AsyncValue.data(null));

  Future<void> declare({...}) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _repo.declareClaim(...));
  }
}

// 5. Invalidate on mutation
ref.invalidate(myClaimsProvider); // After creating/updating
```

---

## 15. Production Checklist

### Flutter

- [ ] Replace `baseUrl` with production API URL (HTTPS)
- [ ] Configure proper `tenantId`
- [ ] Set up Firebase for production (separate project)
- [ ] Add proper error reporting (Sentry/Crashlytics)
- [ ] Handle offline mode gracefully
- [ ] Add pull-to-refresh on all lists
- [ ] Implement proper loading states (shimmer)
- [ ] Add retry logic for failed requests
- [ ] Obfuscate release builds
- [ ] Test on all target devices

### Android Specific

```groovy
// android/app/build.gradle
android {
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

### iOS Specific

- Add `NSCameraUsageDescription` in Info.plist (for claim photos)
- Add `NSPhotoLibraryUsageDescription` in Info.plist
- Add `NSLocationWhenInUseUsageDescription` (for branches map)
- Configure `GoogleService-Info.plist`

---

## Complete Request Flow Diagram

```
Flutter App                    Backend (NestJS/Fastify)
─────────                    ────────────────────────

1. User opens app
   │
   ├─ GET /tenant/config ──────► TenantMiddleware resolves slug
   │  x-tenant-id: caar          Returns enabled plugins
   │  ◄────────────────────────  { enabledComponents: [...] }
   │
2. User taps "Login"
   │
   ├─ POST /auth/login ────────► Validates credentials
   │  x-tenant-id: caar          Creates JWT (15min) + refresh (7d)
   │  ◄────────────────────────  { user, accessToken, refreshToken }
   │
3. User views claims
   │
   ├─ GET /claims ──────────────► JwtGuard → PluginGuard (@insurance/claims)
   │  x-tenant-id: caar          → ClaimsService → tenant_caar.claims table
   │  Authorization: Bearer JWT
   │  ◄────────────────────────  [{ id, numDossier, status, ... }]
   │
4. Token expires (15min)
   │
   ├─ GET /claims ──────────────► Returns 401
   │  ◄────────────────────────
   │
   ├─ POST /auth/refresh ──────► Validates refresh token
   │  ◄────────────────────────  { new accessToken, new refreshToken }
   │
   ├─ GET /claims (retry) ─────► Success with new token
   │  ◄────────────────────────  [...]
```

---

## Summary of API Endpoints by Feature

| Feature | Endpoints | Auth Required |
|---------|-----------|---------------|
| Auth | `/auth/signup`, `/auth/verify-otp-email`, `/auth/send-otp-sms`, `/auth/verify-otp`, `/auth/login`, `/auth/refresh`, `/auth/google/mobile`, `/auth/profile`, `/auth/update-profile`, `/auth/change-password`, `/auth/reset-password-otp`, `/auth/reset-password`, `/auth/logout`, `/auth/upload-profile-picture`, `/auth/send-otp-delete`, `/auth/delete-account` | Mixed |
| Claims | `/claims/declare`, `/claims`, `/claims/:id`, `/claims/:id/status`, `/claims/:id/documents` | Yes |
| Quotes | `/quotes`, `/quotes/:id`, `/quotes/recommended`, `/quotes/products`, `/quotes/by-product/:type`, `/quotes/compare`, `/quotes/admin` (CRUD) | Yes |
| Payments | `/payments`, `/payments/:id`, `/payments/reference/:ref`, `/payments/user/:userId`, `/payments/:id/status` | Yes |
| Notifications | `/notifications`, `/notifications/unread-count`, `/notifications/:id`, `/notifications/:id/read`, `/notifications/mark-read`, `/notifications/device-token` | Yes |
| Branches | `/branches`, `/branches/:id`, `/branches/map`, `/branches/code/:code` | No (public) |
| Tenant | `/tenant/config` | No (public) |
