/**
 * 높은뜻푸른교회 staff-portal - Apps Script 백엔드 (PIN 인증 전용)
 *
 * 엔드포인트:
 *   - GET  ?action=ping            : 헬스 체크 + PIN 설정 여부 (인증 불필요)
 *   - POST {action: 'auth', pin}   : PIN 검증 → 토큰 발급
 *
 * 스크립트 속성 (프로젝트 설정 > 스크립트 속성):
 *   - PIN     : PIN 숫자 (4자리). 임시값 9999. 운영 시 반드시 변경.
 *               미설정 시 인증 통과(개발 모드).
 *   - SECRET  : 토큰 서명 키. 첫 토큰 발급 시 자동 생성됨. 절대 노출 금지.
 *
 * 인증:
 *   - PIN을 변경하면 토큰의 'v' 필드(PIN SHA-256 지문)가 더 이상 일치하지 않아 자동 무효화.
 *   - SECRET을 삭제(또는 변경)해도 모든 토큰 무효화.
 *   - 토큰 만료: 발급 시점으로부터 30일.
 *
 * 보안 메모:
 *   - PIN을 SECRET으로 쓰지 않는 이유: PIN이 4자리 숫자이면 토큰 가로챈 공격자가
 *     brute-force로 PIN 추출 가능. SECRET은 UUID 기반이라 brute-force 불가능.
 */

var TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ===== 진입점 =====

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: '요청 본문 없음' });
    }
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === 'auth') return jsonResponse(handleAuth(body));

    return jsonResponse({ success: false, error: '알 수 없는 action: ' + action });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = params.action;

    if (action === 'ping') {
      return jsonResponse({
        success: true,
        ping: 'pong',
        time: nowKstISO(),
        pinRequired: !!getProp_('PIN'),
      });
    }

    return jsonResponse({ success: false, error: '알 수 없는 action: ' + action });
  } catch (err) {
    console.error(err);
    return jsonResponse({ success: false, error: String(err && err.message || err) });
  }
}

// ===== 핸들러 =====

function handleAuth(body) {
  var pin = body && body.pin;
  if (!verifyPin_(pin)) {
    return { success: false, error: 'PIN이 틀렸습니다' };
  }
  var configuredPin = getProp_('PIN');
  if (!configuredPin) {
    // 개발 모드: PIN 미설정 시 더미 토큰 발급
    return { success: true, token: 'dev', expiresAt: Date.now() + TOKEN_TTL_MS };
  }
  var token = issueToken_(configuredPin);
  return { success: true, token: token, expiresAt: Date.now() + TOKEN_TTL_MS };
}

// ===== 인증 / 토큰 =====

function verifyPin_(pin) {
  var expected = getProp_('PIN');
  if (!expected) return true; // 개발 모드: PIN 미설정 시 통과
  return String(pin || '') === String(expected);
}

/**
 * 토큰 형식: base64url(JSON payload) + '.' + base64url(HMAC-SHA256 sig)
 * payload: { exp: ms, iat: ms, v: pinHash(12자) }
 *   - exp: 만료 시간(ms epoch)
 *   - v:   현재 PIN의 짧은 SHA-256 해시. PIN이 바뀌면 검증 실패 → 자동 로그아웃.
 *
 * 이 함수 자체는 staff-portal에선 호출되지 않지만(검증만 함),
 * 향후 staff-portal에 토큰 검증이 필요한 엔드포인트가 생길 때를 대비해 남겨둡니다.
 */
function issueToken_(pin) {
  var payload = {
    exp: Date.now() + TOKEN_TTL_MS,
    iat: Date.now(),
    v:   pinFingerprint_(pin),
  };
  var b64 = base64UrlEncode_(stringToBytes_(JSON.stringify(payload)));
  var sig = sign_(b64);
  return b64 + '.' + sig;
}

function verifyToken_(token) {
  var pin = getProp_('PIN');
  if (!pin) return true; // 개발 모드

  if (!token || typeof token !== 'string') return false;
  var parts = token.split('.');
  if (parts.length !== 2) return false;

  if (!safeEquals_(parts[1], sign_(parts[0]))) return false;

  try {
    var payload = JSON.parse(bytesToString_(base64UrlDecode_(parts[0])));
    if (!payload || typeof payload !== 'object') return false;
    if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return false;
    if (payload.v !== pinFingerprint_(pin)) return false; // PIN이 바뀐 경우
    return true;
  } catch (e) {
    return false;
  }
}

function sign_(data) {
  var secret = getOrCreateSecret_();
  var raw = Utilities.computeHmacSha256Signature(data, secret);
  return base64UrlEncode_(raw);
}

function pinFingerprint_(pin) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin));
  return base64UrlEncode_(raw).slice(0, 12);
}

function getOrCreateSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRET');
  if (!s) {
    s = Utilities.getUuid() + '-' + Utilities.getUuid();
    props.setProperty('SECRET', s);
  }
  return s;
}

function safeEquals_(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function base64UrlEncode_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}
function base64UrlDecode_(s) {
  var pad = s.length % 4;
  if (pad) s += new Array(5 - pad).join('=');
  return Utilities.base64DecodeWebSafe(s);
}
function stringToBytes_(s) {
  return Utilities.newBlob(s).getBytes();
}
function bytesToString_(bytes) {
  return Utilities.newBlob(bytes).getDataAsString();
}

// ===== 헬퍼 =====

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function nowKstISO() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

// ===== 수동 점검용 =====

function testSetup() {
  Logger.log('PIN 설정 여부: ' + (getProp_('PIN') ? '예' : '아니오 (개발 모드)'));
  Logger.log('SECRET 자동 생성됨: ' + (!!getOrCreateSecret_()));
  Logger.log('서버 시간(KST): ' + nowKstISO());
}

/** 토큰 발급/검증 동작 확인 */
function testTokenRoundTrip() {
  var pin = getProp_('PIN');
  if (!pin) {
    Logger.log('PIN 미설정. 먼저 PIN 속성을 추가하고 다시 실행하세요.');
    return;
  }
  var t = issueToken_(pin);
  Logger.log('토큰: ' + t);
  Logger.log('verify(현재 PIN 기준): ' + verifyToken_(t));

  // PIN이 바뀐 척 — 다른 PIN의 지문으로 만든 토큰은 verify 실패해야 함
  var fakePayload = {
    exp: Date.now() + TOKEN_TTL_MS,
    iat: Date.now(),
    v:   pinFingerprint_('0000'),
  };
  var fakeB64 = base64UrlEncode_(stringToBytes_(JSON.stringify(fakePayload)));
  var fakeToken = fakeB64 + '.' + sign_(fakeB64);
  Logger.log('verify(다른 PIN 기준, false 기대): ' + verifyToken_(fakeToken));
}
