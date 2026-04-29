/* ===============================================
   api.js - Apps Script 백엔드 통신 (PIN 인증 전용)
   - CORS 프리플라이트를 피하려고 Content-Type을 'text/plain'으로 보냄
   - 백엔드가 AUTH_REQUIRED 코드를 반환하면 AuthError를 throw
   =============================================== */

const Api = (() => {
  // ★ Apps Script 웹앱 URL
  const API_URL = 'https://script.google.com/macros/s/AKfycbxZc5zsIKOwdt-95amSTJnv8KhZnvJhkYA3jIU8VU3RfXW-rwILlfVhKv64kDjQ4YDM/exec';

  function getApiUrl() {
    return localStorage.getItem('API_URL_OVERRIDE') || API_URL;
  }
  function ensureUrl() {
    const url = getApiUrl();
    if (!url) throw new Error('API_URL이 설정되지 않았습니다.');
    return url;
  }

  function handleAuthFailure(data) {
    if (data && data.code === 'AUTH_REQUIRED') {
      Auth.clearToken();
      throw new AuthError(data.error || '인증이 필요합니다');
    }
  }

  async function postJSON(payload) {
    const url = ensureUrl();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    handleAuthFailure(data);
    return data;
  }

  async function getJSON(params) {
    const url = ensureUrl();
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${qs}`, { method: 'GET', redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    handleAuthFailure(data);
    return data;
  }

  // ---------- PIN 인증 (토큰 발급) ----------
  async function auth(pin) {
    return postJSON({ action: 'auth', pin });
  }

  // ---------- 헬스 체크 ----------
  // PIN 설정 여부도 함께 알려준다 (프론트의 dev 모드 판별용).
  async function ping() {
    return getJSON({ action: 'ping' });
  }

  return { auth, ping, getApiUrl };
})();
