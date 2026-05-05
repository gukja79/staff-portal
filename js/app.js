/* ===============================================
   app.js - 메인 앱 로직
   - 화면 라우팅: PIN / 홈
   - PIN 4자리 키패드, 자동 로그인 (30일)
   - 홈: 일정 카드 + 메뉴 그리드 6개
   - 메뉴는 menus.json에서 동적으로 로드
   - 일정은 백엔드 schedule 액션으로 조회
   =============================================== */

const App = (() => {
  // ---------- 상태 ----------
  const state = {
    menus: [],
    schedule: null,
  };
  const pinState = { buffer: '', busy: false };

  // ---------- DOM 핸들 ----------
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- SVG 아이콘 (inline) ----------
  const ICONS = {
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    leaf:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c.85.4 2.27 5.04 1.88 9.04A8.55 8.55 0 0 1 11 20z"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>',
    graduation:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
    camera:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    folder:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    megaphone:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 22 22 3 13 3 11"/><path d="M11 11v6.5a2.5 2.5 0 0 1-5 0V13"/></svg>',
    arrow:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  };

  // ---------- 유틸 ----------
  function showToast(msg, ms = 2000) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('--show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('--show'), ms);
  }

  // ---------- 데이터 로드 ----------
  async function loadMenus() {
    const res = await fetch('./js/menus.json', { cache: 'no-cache' });
    state.menus = (await res.json()).menus || [];
  }

  async function loadSchedule() {
    try {
      const res = await Api.schedule();
      if (res && res.success) {
        state.schedule = res;
      } else {
        state.schedule = { success: false, error: (res && res.error) || '일정을 불러올 수 없습니다' };
      }
    } catch (err) {
      if (err instanceof AuthError) {
        // 토큰 만료 → PIN 화면으로
        showPinScreen('다시 로그인해 주세요');
        throw err;
      }
      state.schedule = { success: false, error: err.message || '일정을 불러올 수 없습니다' };
    }
    renderSchedule();
  }

  // ---------- 화면 전환 ----------
  function showScreen(name) {
    $$('.screen').forEach((el) => el.classList.add('hidden'));
    const target = document.getElementById(`screen-${name}`);
    if (target) target.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // ---------- PIN 화면 ----------
  function showPinScreen(message) {
    pinState.buffer = '';
    pinState.busy = false;
    renderPinDisplay();
    setKeypadBusy(false);
    setPinMessage(message || '', message ? 'info' : '');
    showScreen('pin');
  }

  function renderPinDisplay() {
    $$('#pin-display .pin-dot').forEach((d, i) => {
      d.classList.toggle('filled', i < pinState.buffer.length);
    });
  }

  function setPinMessage(msg, type) {
    const el = $('#pin-message');
    el.textContent = msg;
    el.classList.remove('info', 'loading');
    if (type === 'info' || type === 'loading') el.classList.add(type);
  }

  function setKeypadBusy(isBusy) {
    const keypad  = $('.pin-keypad');
    const display = $('#pin-display');
    if (keypad)  keypad.classList.toggle('busy',  isBusy);
    if (display) display.classList.toggle('busy', isBusy);
    $$('.pin-key').forEach((k) => { k.disabled = isBusy; });
  }

  function pinPressDigit(digit) {
    if (pinState.busy) return;
    if (pinState.buffer.length >= 4) return;
    pinState.buffer += digit;
    setPinMessage('');
    renderPinDisplay();
    if (pinState.buffer.length === 4) submitPin();
  }

  function pinBackspace() {
    if (pinState.busy) return;
    pinState.buffer = pinState.buffer.slice(0, -1);
    setPinMessage('');
    renderPinDisplay();
  }

  async function submitPin() {
    pinState.busy = true;
    setKeypadBusy(true);
    setPinMessage('확인 중…', 'loading');

    const slowTimer = setTimeout(() => setPinMessage('잠시만 기다려주세요…', 'loading'), 1500);
    const coldTimer = setTimeout(() => setPinMessage('서버가 깨어나는 중입니다…', 'loading'), 5000);
    const clearTimers = () => { clearTimeout(slowTimer); clearTimeout(coldTimer); };

    try {
      const res = await Auth.login(pinState.buffer);
      clearTimers();
      if (res && res.success) {
        afterLogin();
        pinState.buffer = '';
        renderPinDisplay();
        setPinMessage('');
      } else {
        pinFailed((res && res.error) || 'PIN이 틀렸습니다');
      }
    } catch (err) {
      clearTimers();
      pinFailed(err.message || 'PIN 확인 실패');
    } finally {
      pinState.busy = false;
      setKeypadBusy(false);
    }
  }

  function pinFailed(msg) {
    const display = $('#pin-display');
    display.classList.remove('shake');
    void display.offsetWidth;
    display.classList.add('shake');
    setTimeout(() => display.classList.remove('shake'), 500);
    pinState.buffer = '';
    renderPinDisplay();
    setPinMessage(msg);
  }

  function afterLogin() {
    renderHome();
    showScreen('home');
    // 일정은 화면 보여준 뒤 비동기 로드
    loadSchedule().catch((e) => console.warn('[일정 로드 실패]', e));
  }

  // ---------- 일정 카드 렌더 ----------
  // 백엔드 응답 포맷:
  //   {
  //     success,
  //     schedule: {
  //       rangeStart, rangeEnd,
  //       items: [
  //         { type: 'wed'|'fri', date, title, speaker },
  //         { type: 'sun', date, churchEvent, parts: [{label, speaker}, ...] },
  //         { type: 'event', text }
  //       ]
  //     }
  //   }
  function renderSchedule() {
    const body = $('#schedule-body');
    const range = $('#schedule-range');
    if (!body || !range) return;

    const data = state.schedule;
    if (!data || !data.success) {
      body.innerHTML = `<p class="schedule-empty">${esc((data && data.error) || '일정을 불러올 수 없습니다')}</p>`;
      range.textContent = '';
      return;
    }

    const sch = data.schedule || {};
    const rangeStart = sch.rangeStart || '';
    const rangeEnd   = sch.rangeEnd   || '';
    range.textContent = (rangeStart && rangeEnd) ? `${rangeStart} — ${rangeEnd}` : '';

    const items = Array.isArray(sch.items) ? sch.items : [];
    if (items.length === 0) {
      body.innerHTML = '<p class="schedule-empty">이번 주 남은 일정이 없습니다</p>';
      return;
    }

    // 일정 아이템과 행사(event)를 분리
    const scheduleItems = items.filter((it) => it.type !== 'event');
    const eventItems    = items.filter((it) => it.type === 'event');

    const itemsHtml = scheduleItems.map((it) => {
      const t = it.type || '';
      const cls = t === 'wed' ? '--wed' : t === 'fri' ? '--fri' : '--sun';

      // 주일/평일 분기
      let titleHtml = '';
      let subHtml = '';

      if (t === 'sun') {
        // 주일: date + (churchEvent) + parts 여러 개
        const churchEvent = (it.churchEvent || '').trim();
        const dateLabel = churchEvent ? `${it.date} (${churchEvent})` : (it.date || '');
        titleHtml = `<span class="schedule-day">${esc(dateLabel)}</span>`;
        const parts = Array.isArray(it.parts) ? it.parts : [];
        subHtml = parts.map((p) => `
          <div class="schedule-row schedule-part">
            <span class="schedule-part-label">${esc(p.label || '')}</span>
            <span class="schedule-speaker">${esc(p.speaker || '')}</span>
          </div>
        `).join('');
      } else {
        // 수/금: 윗줄=date, 아랫줄=title + speaker (양 끝)
        titleHtml = `<span class="schedule-day">${esc(it.date || '')}</span>`;
        const speaker = (it.speaker || '').trim();
        const title = (it.title || '').trim();
        subHtml = `
          <div class="schedule-row schedule-meta">
            <span class="schedule-name">${esc(title)}</span>
            ${speaker ? `<span class="schedule-speaker">${esc(speaker)}</span>` : ''}
          </div>
        `;
      }

      return `
        <div class="schedule-item ${cls}">
          <div class="schedule-bar"></div>
          <div class="schedule-content">
            <div class="schedule-row">${titleHtml}</div>
            ${subHtml}
          </div>
        </div>
      `;
    }).join('');

    const eventsHtml = eventItems.map((e) => {
      const text = (e.text || '').trim();
      return text ? `<div class="schedule-event">${esc(text)}</div>` : '';
    }).join('');

    body.innerHTML = itemsHtml + eventsHtml;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- 홈 렌더 (메뉴 그리드) ----------
  function renderHome() {
    const container = $('#menu-container');
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'menu-grid';

    state.menus.forEach((menu) => {
      const isComing = !!menu.comingSoon;
      const tag = isComing ? 'div' : 'a';
      const card = document.createElement(tag);
      card.className = 'menu-card' + (isComing ? ' --coming-soon' : '');
      card.dataset.color = menu.color || 'blue';
      card.dataset.menuId = menu.id;

      if (!isComing) {
        card.href = menu.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
      }

      const iconSvg = ICONS[menu.icon] || ICONS.folder;
      const right = isComing
        ? `<span class="menu-badge">준비 중</span>`
        : `<span class="menu-arrow" aria-hidden="true">${ICONS.arrow}</span>`;

      card.innerHTML = `
        <div class="menu-icon-box">${iconSvg}</div>
        <div class="menu-text">
          <div class="menu-title">${esc(menu.title)}</div>
          <div class="menu-desc">${esc(menu.description || '')}</div>
        </div>
        ${right}
      `;

      if (isComing) {
        card.addEventListener('click', () => showToast('아직 준비 중입니다'));
      }

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  // ---------- 로그아웃 ----------
  function onLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    Auth.logout();
    showPinScreen();
  }

  // ---------- 이벤트 바인딩 ----------
  function bindEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (t?.dataset.action === 'logout') onLogout();
    });

    document.addEventListener('click', (e) => {
      const digitBtn  = e.target.closest('[data-pin-digit]');
      if (digitBtn)  { pinPressDigit(digitBtn.dataset.pinDigit); return; }
      const actionBtn = e.target.closest('[data-pin-action]');
      if (actionBtn && actionBtn.dataset.pinAction === 'backspace') { pinBackspace(); return; }
    });

    // 데스크톱 키보드 입력
    document.addEventListener('keydown', (e) => {
      if ($('#screen-pin').classList.contains('hidden')) return;
      if (/^[0-9]$/.test(e.key))      pinPressDigit(e.key);
      else if (e.key === 'Backspace') pinBackspace();
    });
  }

  // ---------- 시작 ----------
  async function init() {
    try {
      await loadMenus();
      bindEvents();

      if (Auth.isAuthenticated()) {
        afterLogin();
        return;
      }

      // PIN 미설정(개발 모드) 체크
      try {
        const ping = await Api.ping();
        if (ping && ping.pinRequired === false) {
          Auth.setToken('dev', Date.now() + 30 * 24 * 60 * 60 * 1000);
          afterLogin();
          return;
        }
      } catch (e) {
        console.warn('[ping 실패]', e);
      }

      showPinScreen();
      console.log('[App 시작]', { 메뉴수: state.menus.length, API_URL: Api.getApiUrl() || '(미설정)' });
    } catch (err) {
      console.error('[초기화 실패]', err);
      alert('앱 초기화에 실패했습니다. 새로고침 해주세요.');
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
