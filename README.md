# 높은뜻푸른교회 staff-portal

교회 교직원이 자주 쓰는 외부 링크들을 한 곳에 모은 모바일 친화 인트라넷 웹앱입니다.

> 연차신청서, 회계 자료, 강사비 입력, 서울고 교실 사진 — 4개 메뉴를 한 화면에서.
> PIN 한 번 입력하면 30일 자동 로그인. 메뉴는 카드 그리드로 보이고, 탭하면 각 외부 링크가 새 탭에서 열립니다.

---

## 사용 기술

- **프론트엔드**: HTML / CSS / Vanilla JavaScript (프레임워크 없음, 가벼운 정적 앱)
- **백엔드**: Google Apps Script (Web App) — PIN 인증만 담당
- **호스팅**: GitHub Pages
- **폰트**: Nanum Gothic
- **인증**: PIN 코드 + HMAC-SHA256 서명 토큰 (30일 만료)

---

## 주요 기능

- 🔐 **PIN 인증** — 4자리 PIN으로 간편 로그인. 한 번 입력하면 30일간 자동 로그인. PIN 변경 시 모든 토큰 자동 무효화.
- 🔗 **외부 링크 허브** — 4개 카드(연차/회계/강사비/사진) 탭 시 새 탭에서 열림.
- ⚙️ **JSON 기반 메뉴** — `js/menus.json` 수정만으로 메뉴 추가/제거 가능.
- 🌗 **다크/라이트 자동 전환** — 시스템 설정에 따라 자동.
- 📱 **모바일 우선** — 카드 그리드 (모바일 1~2열, 태블릿 3열), tap-scale 마이크로 인터랙션.

---

## 교직원용 사용법

1. 안내받은 앱 URL을 모바일/데스크톱 브라우저에서 엽니다.
2. **PIN 4자리 입력** — 한 번 성공하면 약 30일간 자동 로그인.
3. 홈 화면에서 원하는 메뉴 카드를 탭하면 새 탭에서 해당 링크가 열립니다.
4. 우측 상단의 로그아웃 아이콘으로 명시적으로 로그아웃할 수도 있습니다.

> 💡 **홈 화면에 추가하기 (아이폰)**: 사파리 하단 공유 버튼 → "홈 화면에 추가". 앱처럼 빠르게 열 수 있습니다.

---

## 폴더 구조

```
staff-portal/
├── index.html
├── css/style.css
├── js/
│   ├── app.js          ← 메인 로직 (PIN 흐름 + 메뉴 카드 렌더)
│   ├── api.js          ← 백엔드 통신 (auth/ping)
│   ├── auth.js         ← PIN 인증, 토큰 관리
│   └── menus.json      ← 4개 메뉴 데이터
├── apps-script/
│   ├── Code.gs         ← Apps Script 백엔드
│   ├── appsscript.json
│   └── README.md       ← 배포 가이드
├── .gitignore
└── README.md
```

---

## 메뉴 추가 / 수정 / 삭제

`js/menus.json` 한 파일만 수정하면 됩니다. 코드 변경 불필요.

```json
{
  "menus": [
    {
      "id": "고유키",
      "title": "표시 이름",
      "description": "한 줄 설명",
      "icon": "📋",
      "url": "https://example.com/..."
    }
  ]
}
```

저장 후 GitHub에 push하면 GitHub Pages가 자동 반영합니다.

---

## 개발자용 빠른 시작

### 1. 백엔드 배포

[`apps-script/README.md`](./apps-script/README.md) 참고.
- 새 Apps Script 프로젝트 (`교회 인트라넷 백엔드`) 생성
- `Code.gs`, `appsscript.json` 붙여넣기
- 스크립트 속성에 `PIN: 9999` 등록
- 웹앱으로 배포 → URL 확보

### 2. 프론트엔드 연결

`js/api.js`의 `API_URL`에 위 URL 채워넣기.

```javascript
const API_URL = 'https://script.google.com/macros/s/AKfy.../exec';
```

### 3. 로컬 테스트

서울고 교실 사진 앱이 8080을 쓰고 있을 수 있어 **8081**을 사용합니다.

```bash
cd staff-portal
python3 -m http.server 8081 --bind 0.0.0.0
```

브라우저에서 `http://localhost:8081` → PIN `9999` 입력 → 메뉴 카드 4개 보이면 OK.

#### 백엔드 없이 미리보기 (홈 화면만 보고 싶을 때)

브라우저 콘솔에서:
```javascript
localStorage.setItem('AUTH_TOKEN', 'dev');
localStorage.setItem('AUTH_EXPIRES_AT', String(Date.now() + 86400000));
location.reload();
```

PIN 화면을 건너뛰고 홈 화면이 즉시 보입니다. 다시 PIN 화면으로 돌아가려면 우측 상단 로그아웃 또는:
```javascript
localStorage.clear(); location.reload();
```

---

## 보안 메모

- PIN은 백엔드 스크립트 속성에만 저장됩니다 (코드/저장소에 하드코딩 X).
- 토큰의 `v` 필드(PIN SHA-256 해시 12자)로 PIN 변경 즉시 모든 기기 자동 로그아웃.
- 토큰 서명 키 `SECRET`은 첫 토큰 발급 시 자동 생성 (UUID 기반, brute-force 불가능).
- HMAC 검증은 timing-safe 비교(`safeEquals_`) 사용.
- 모든 외부 링크는 `target="_blank" rel="noopener noreferrer"`로 열려 referrer leak / window.opener 공격 차단.

---

## 향후 확장

- **PWA 변환**: 현재는 미적용. `manifest.json` + service worker만 추가하면 홈 화면 설치/오프라인 가능 (코드 구조는 이미 준비됨).
- **관리자 페이지**: `Code.gs`에 액션 핸들러 추가하는 패턴은 [`apps-script/README.md`](./apps-script/README.md) 부록 B 참고.

---

## 라이선스

이 프로젝트는 교회 내부 운영용으로 제작되었습니다.
