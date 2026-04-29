/* ===============================================
   app.js - 메인 앱 로직 (PIN + 메뉴 카드)
   - 화면 라우팅: PIN / 홈
   - 시작 시 토큰 없으면 PIN 화면, 있으면 홈
   - PIN 4자리 키패드, 흔들림 효과, 자동 로그인(30일)
   - 로그아웃 버튼 (홈 우측 상단)
   - 메뉴는 menus.json에서 동적으로 로드 → 카드 그리드
   =============================================== */

const App = (() => {
  // ---------- 상태 ----------
  const state = {
    menus: [],
  };

  const pinState = {
    buffer: '',
    busy:   false,
  };

  // ---------- DOM 핸들 ----------
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---------- 유틸 ----------
  function todayKST() {
    return new Date().toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
  }

  // ---------- 데이터 로드 ----------
  async function loadMenus() {
    const res = await fetch('./js/menus.json', { cache: 'no-cache' });
    const data = await res.json();
    state.menus = data.menus || [];
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
    if (message) setPinMessage(message, 'info');
    else setPinMessage('');
    showScreen('pin');
  }

  function renderPinDisplay() {
    const dots = $$('#pin-display .pin-dot');
    dots.forEach((d, i) => {
      d.classList.toggle('filled', i < pinState.buffer.length);
    });
  }

  // type: undefined → 에러(빨강) / 'info' → 회색 / 'loading' → 회색 + 스피너
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
    if (pinState.buffer.length === 4) {
      submitPin();
    }
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

    // 콜드 스타트 대비 단계별 안내. 응답 도착 시 모두 취소.
    const slowTimer = setTimeout(() => {
      setPinMessage('잠시만 기다려주세요…', 'loading');
    }, 1500);
    const coldTimer = setTimeout(() => {
      setPinMessage('서버가 깨어나는 중입니다…', 'loading');
    }, 5000);
    const clearTimers = () => {
      clearTimeout(slowTimer);
      clearTimeout(coldTimer);
    };

    try {
      const res = await Auth.login(pinState.buffer);
      clearTimers();
      if (res && res.success) {
        // 도트(●●●●)와 메시지는 그대로 둔 채 화면 전환 — 자연스럽게 사라짐.
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
    void display.offsetWidth; // reflow로 애니메이션 재시작
    display.classList.add('shake');
    setTimeout(() => display.classList.remove('shake'), 500);

    pinState.buffer = '';
    renderPinDisplay();
    setPinMessage(msg);
  }

  function afterLogin() {
    renderHome();
    showScreen('home');
  }

  // ---------- 홈 렌더 ----------
  function renderHome() {
    $('#today-label').textContent = todayKST();

    const container = $('#menu-container');
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'menu-grid';

    state.menus.forEach((menu) => {
      const card = document.createElement('a');
      card.className = 'menu-card';
      card.href = menu.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
      card.dataset.menuId = menu.id;
      card.innerHTML = `
        <div class="menu-icon">${menu.icon || '📌'}</div>
        <div class="menu-title">${menu.title}</div>
        <div class="menu-desc">${menu.description || ''}</div>
      `;
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
      const target = e.target.closest('[data-action]');
      const action = target?.dataset.action;
      if (action === 'logout') {
        onLogout();
      }
    });

    // PIN 키패드
    document.addEventListener('click', (e) => {
      const digitBtn = e.target.closest('[data-pin-digit]');
      if (digitBtn) { pinPressDigit(digitBtn.dataset.pinDigit); return; }
      const actionBtn = e.target.closest('[data-pin-action]');
      if (actionBtn && actionBtn.dataset.pinAction === 'backspace') { pinBackspace(); return; }
    });

    // 데스크톱: 키보드로도 PIN 입력 가능
    document.addEventListener('keydown', (e) => {
      if ($('#screen-pin').classList.contains('hidden')) return;
      if (/^[0-9]$/.test(e.key)) { pinPressDigit(e.key); }
      else if (e.key === 'Backspace') { pinBackspace(); }
    });
  }

  // ---------- 시작 ----------
  async function init() {
    try {
      await loadMenus();
      bindEvents();

      // 1) 이미 로그인된 토큰이 있으면 바로 홈으로
      if (Auth.isAuthenticated()) {
        afterLogin();
        return;
      }

      // 2) 토큰 없음 — 백엔드의 PIN 설정 여부 확인.
      //    PIN 미설정(개발 모드)이면 PIN 화면 스킵.
      try {
        const ping = await Api.ping();
        if (ping && ping.pinRequired === false) {
          Auth.setToken('dev', Date.now() + 30 * 24 * 60 * 60 * 1000);
          afterLogin();
          return;
        }
      } catch (e) {
        console.warn('[ping 실패]', e);
        // 그래도 PIN 화면을 띄움
      }

      showPinScreen();
      console.log('[App 시작]', {
        메뉴수:  state.menus.length,
        API_URL: Api.getApiUrl() || '(미설정)',
      });
    } catch (err) {
      console.error('[초기화 실패]', err);
      alert('앱 초기화에 실패했습니다. 새로고침 해주세요.');
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
