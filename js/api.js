/* ===============================================
   api.js - Apps Script 백엔드 통신
   - PIN 인증 + 토큰 발급
   - 일정 조회 (schedule 액션)
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
  async function ping() {
    return getJSON({ action: 'ping' });
  }

  // ---------- 이번 주 일정 조회 (토큰 필요) ----------
  async function schedule() {
    const token = Auth.getToken();
    if (!token) throw new AuthError('토큰 없음');
    return postJSON({ action: 'schedule', token });
  }

  return { auth, ping, schedule, getApiUrl };
})();
