import 'dart:convert';

import 'api_manager.dart';

export 'api_manager.dart' show ApiCallResponse;

class TokenCall {
  static Future<ApiCallResponse> call({
    String? phone = '',
    String? password = '',
    String? mode = 'login',
    String? role = '',
    String? companyId,
    String? displayName,
    String? roleId,
    String? roleName,
    List<String>? rolePermissions,
    List<String>? roleAllowedCompanyIds,
    String? position,
    String? department,
    bool? forcePasswordChange,
  }) async {
    final ffApiRequestBody = jsonEncode({
      'phone': phone ?? '',
      'password': password ?? '',
      'mode': mode ?? 'login',
      'role': role ?? '',
      if ((companyId ?? '').trim().isNotEmpty) 'companyId': companyId!.trim(),
      if ((displayName ?? '').trim().isNotEmpty)
        'displayName': displayName!.trim(),
      if ((roleId ?? '').trim().isNotEmpty) 'roleId': roleId!.trim(),
      if ((roleName ?? '').trim().isNotEmpty) 'roleName': roleName!.trim(),
      if ((rolePermissions ?? const []).isNotEmpty)
        'rolePermissions': rolePermissions,
      if ((roleAllowedCompanyIds ?? const []).isNotEmpty)
        'roleAllowedCompanyIds': roleAllowedCompanyIds,
      if ((position ?? '').trim().isNotEmpty) 'position': position!.trim(),
      if ((department ?? '').trim().isNotEmpty)
        'department': department!.trim(),
      if (forcePasswordChange != null)
        'forcePasswordChange': forcePasswordChange,
    });
    return ApiManager.instance.makeApiCall(
      callName: 'token',
      apiUrl: 'https://uchet-9a732.web.app/api/create-token',
      callType: ApiCallType.POST,
      headers: {},
      params: {},
      body: ffApiRequestBody,
      bodyType: BodyType.JSON,
      returnBody: true,
      encodeBodyUtf8: false,
      decodeUtf8: false,
      cache: false,
      isStreamingApi: false,
      alwaysAllowBody: false,
    );
  }
}

class ApiPagingParams {
  int nextPageNumber = 0;
  int numItems = 0;
  dynamic lastResponse;

  ApiPagingParams({
    required this.nextPageNumber,
    required this.numItems,
    required this.lastResponse,
  });

  @override
  String toString() =>
      'PagingParams(nextPageNumber: $nextPageNumber, numItems: $numItems, lastResponse: $lastResponse,)';
}

String? escapeStringForJson(String? input) {
  if (input == null) {
    return null;
  }
  return input
      .replaceAll('\\', '\\\\')
      .replaceAll('"', '\\"')
      .replaceAll('\n', '\\n')
      .replaceAll('\t', '\\t');
}
