/**
 * 일정 조회 모듈 (Schedule.gs)
 * 
 * 기존 Code.gs와 함께 같은 Apps Script 프로젝트에 추가.
 * 
 * 추가 작업:
 * 1. 이 파일을 Schedule.gs로 새 파일 추가 (또는 Code.gs 하단에 추가)
 * 2. Code.gs의 doPost 안에 라우팅 한 줄 추가:
 *      if (action === 'schedule') return jsonResponse(handleSchedule(body));
 *    위치: 기존 'auth' 라우팅 아래
 * 3. 스크립트 속성 추가:
 *    SCHEDULE_SHEET_ID = 1qRUEPl43GG7MnzYWAhGoJ3ooehrfcNhZR5JK0nZ178k
 * 4. 새 버전 배포 (URL 유지)
 * 5. 첫 실행 시 시트 읽기 권한 동의 (testGetSchedule 함수 실행)
 * 6. warmupCache 함수에 시간 기반 트리거 설정 (매 5분)
 */


// ============================================================
// 메인 핸들러
// ============================================================
function forcePermission() {
  // 권한 강제 트리거용
  SpreadsheetApp.openById('1qRUEPl43GG7MnzYWAhGoJ3ooehrfcNhZR5JK0nZ178k');
  Logger.log('권한 OK');
}
function handleSchedule(body) {
  // 토큰 검증 (기존 verifyToken_ 재사용)
  var token = body && body.token;
  if (!verifyToken_(token)) {
    return { success: false, error: '인증이 필요합니다' };
  }
  
  try {
    var schedule = getThisWeekSchedule_();
    return { success: true, schedule: schedule };
  } catch (err) {
    console.error('schedule error: ' + err);
    return { success: false, error: String(err && err.message || err) };
  }
}


// ============================================================
// 핵심 로직: 이번 주 일정 가져오기
// ============================================================

function getThisWeekSchedule_() {
  // KST 기준 오늘 (시간 부분 제거)
  var today = getKSTToday_();
  
  // 이번 주 수요일~일요일 계산
  var range = getThisWeekRange_(today);
  var wed = range.wed, fri = range.fri, sun = range.sun;
  
  // 시트 데이터 (캐시 있으면 사용)
  var data = loadSheetData_();
  
  var schedule = {
    rangeStart: formatDate_(wed),    // "5/6"
    rangeEnd: formatDate_(sun),      // "5/10"
    items: []
  };
  
  // 1. 수요 설교 (오늘 <= 수요일이면 표시)
  if (today.getTime() <= wed.getTime()) {
    var wedKey = (wed.getUTCMonth() + 1) + '/' + wed.getUTCDate();
    var wedSpeaker = data.wedFri.wed[wedKey];
    if (wedSpeaker) {
      schedule.items.push({
        type: 'wed',
        date: '수 ' + (wed.getUTCMonth() + 1) + '/' + wed.getUTCDate(),
        title: '수요기도회',
        speaker: addTitle_(wedSpeaker, data.speakers)
      });
    }
  }
  
  // 2. 금요 설교 (오늘 <= 금요일이면 표시)
  if (today.getTime() <= fri.getTime()) {
    var friKey = (fri.getUTCMonth() + 1) + '/' + fri.getUTCDate();
    var friSpeaker = data.wedFri.fri[friKey];
    if (friSpeaker) {
      schedule.items.push({
        type: 'fri',
        date: '금 ' + (fri.getUTCMonth() + 1) + '/' + fri.getUTCDate(),
        title: '금요기도회',
        speaker: addTitle_(friSpeaker, data.speakers)
      });
    }
  }
  
  // 3. 주일 (오늘 <= 일요일이면 표시)
  if (today.getTime() <= sun.getTime()) {
    var sunKey = (sun.getUTCMonth() + 1) + '/' + sun.getUTCDate();
    var sundayInfo = data.sundays[sunKey];
    
    if (sundayInfo) {
      var parts = parseSundaySpeaker_(sundayInfo.speaker, data.speakers);
      
      if (parts.length > 0) {
        schedule.items.push({
          type: 'sun',
          date: '주일 ' + (sun.getUTCMonth() + 1) + '/' + sun.getUTCDate(),
          churchEvent: sundayInfo.churchEvent || '',
          parts: parts
        });
      }
      
      // 행사 (전체 컬럼)
      if (sundayInfo.event) {
        schedule.items.push({
          type: 'event',
          text: sundayInfo.event
        });
      }
    }
  }
  
  return schedule;
}


// ============================================================
// 시트 데이터 로딩 (5분 캐시)
// ============================================================

function loadSheetData_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('schedule_data_v1');
  if (cached) {
    return JSON.parse(cached);
  }
  
  var sheetId = getProp_('SCHEDULE_SHEET_ID');
  if (!sheetId) {
    throw new Error('SCHEDULE_SHEET_ID 스크립트 속성이 설정되지 않았습니다');
  }
  
  var ss = SpreadsheetApp.openById(sheetId);
  
  var data = {
    sundays: parseSundaySheet_(ss),
    wedFri: parseWedFriSheet_(ss),
    speakers: parseSpeakersSheet_(ss)
  };
  
  cache.put('schedule_data_v1', JSON.stringify(data), 300);  // 5분
  
  return data;
}


function parseSundaySheet_(ss) {
  // 시트 이름이 "2026년" 또는 첫 번째 시트
  var year = new Date().getFullYear();
  var sheet = ss.getSheetByName(year + '년') || ss.getSheets()[0];
  
  var rows = sheet.getDataRange().getValues();
  var sundays = {};
  var currentMonth = null;
  
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var monthCell = row[1];
    var dayCell = row[2];
    var churchEvent = row[3];
    var speaker = row[4];
    var event = row[5];
    
    if (monthCell) {
      var monthMatch = String(monthCell).match(/(\d+)/);
      if (monthMatch) currentMonth = parseInt(monthMatch[1]);
    }
    
    if (currentMonth && dayCell) {
      var day = parseInt(dayCell);
      if (!isNaN(day)) {
        var key = currentMonth + '/' + day;
        sundays[key] = {
          churchEvent: String(churchEvent || '').trim(),
          speaker: String(speaker || '').trim(),
          event: String(event || '').trim()
        };
      }
    }
  }
  
  return sundays;
}


function parseWedFriSheet_(ss) {
  var sheet = ss.getSheetByName('수요금요');
  if (!sheet) {
    throw new Error('"수요금요" 시트를 찾을 수 없습니다');
  }
  
  var rows = sheet.getDataRange().getValues();
  var result = { wed: {}, fri: {} };
  var currentMonth = null;
  
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var monthCell = row[0];
    var wedDay = row[1];
    var wedSpeaker = row[2];
    var friDay = row[3];
    var friSpeaker = row[4];
    
    if (monthCell) {
      var monthMatch = String(monthCell).match(/(\d+)/);
      if (monthMatch) currentMonth = parseInt(monthMatch[1]);
    }
    
    if (currentMonth && wedDay) {
      var dayMatch = String(wedDay).match(/(\d+)/);
      if (dayMatch) {
        var day = parseInt(dayMatch[1]);
        var key = currentMonth + '/' + day;
        if (wedSpeaker && String(wedSpeaker).trim()) {
          result.wed[key] = String(wedSpeaker).trim();
        }
      }
    }
    
    if (currentMonth && friDay) {
      var dayMatch2 = String(friDay).match(/(\d+)/);
      if (dayMatch2) {
        var day2 = parseInt(dayMatch2[1]);
        var key2 = currentMonth + '/' + day2;
        if (friSpeaker && String(friSpeaker).trim()) {
          result.fri[key2] = String(friSpeaker).trim();
        }
      }
    }
  }
  
  return result;
}


function parseSpeakersSheet_(ss) {
  var sheet = ss.getSheetByName('사역자명단');
  if (!sheet) {
    return {};  // 명단 없어도 동작 (이름만 표시)
  }
  
  var rows = sheet.getDataRange().getValues();
  var speakers = {};
  
  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][0] || '').trim();
    var title = String(rows[i][1] || '').trim();
    if (name) {
      speakers[name] = title;
    }
  }
  
  return speakers;
}


// ============================================================
// 헬퍼 함수
// ============================================================

function getKSTToday_() {
  // KST(+9) 기준 오늘 날짜 (시간 부분은 0)
  var now = new Date();
  var kst = new Date(now.getTime() + (9 * 60 * 60 * 1000));
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}


function getThisWeekRange_(today) {
  // today.getUTCDay(): 일=0, 월=1, 화=2, 수=3, 목=4, 금=5, 토=6
  var dayOfWeek = today.getUTCDay();
  
  // 이번 주 수요일까지의 일수
  // 0(일)→-4 (이미 지난 주 일요일이지만 어차피 표시 안 됨)
  // 1(월)→2, 2(화)→1, 3(수)→0, 4(목)→-1, 5(금)→-2, 6(토)→-3
  var daysToWed;
  if (dayOfWeek === 0) {
    daysToWed = -4;  // 일요일은 직전 수요일 가리킴 (당일 주일만 노출되도록)
  } else {
    daysToWed = 3 - dayOfWeek;
  }
  
  var wed = new Date(today.getTime() + daysToWed * 24 * 60 * 60 * 1000);
  var fri = new Date(wed.getTime() + 2 * 24 * 60 * 60 * 1000);
  var sun = new Date(wed.getTime() + 4 * 24 * 60 * 60 * 1000);
  
  return { wed: wed, fri: fri, sun: sun };
}


function formatDate_(d) {
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
}


function addTitle_(name, speakers) {
  if (!name) return '';
  // "담임목사" 같이 직책 포함된 명칭은 그대로
  if (name === '담임목사') return name;
  // 명단에 있으면 직책 붙임, 없으면 이름만 (행사명 "고난주간" 등도 그대로)
  var title = speakers[name];
  if (title) return name + ' ' + title;
  return name;
}


function parseSundaySpeaker_(cell, speakers) {
  if (!cell || cell.trim() === '') return [];
  
  var trimmed = cell.trim();
  
  if (trimmed.indexOf('/') !== -1) {
    var parts = trimmed.split('/').map(function(p) { return p.trim(); });
    if (parts.length === 2) {
      return [
        { label: '1·2부', speaker: addTitle_(parts[0], speakers) },
        { label: '3부',   speaker: addTitle_(parts[1], speakers) }
      ];
    }
  }
  
  return [
    { label: '1~3부', speaker: addTitle_(trimmed, speakers) }
  ];
}


// ============================================================
// 테스트 함수 (Apps Script 편집기에서 직접 실행)
// ============================================================

function testGetSchedule() {
  var result = getThisWeekSchedule_();
  Logger.log('이번 주 일정:');
  Logger.log(JSON.stringify(result, null, 2));
}

function clearScheduleCache() {
  // 시트 수정 후 즉시 반영하고 싶을 때
  CacheService.getScriptCache().remove('schedule_data_v1');
  Logger.log('캐시 비웠습니다');
}


// ============================================================
// 캐시 워밍 (콜드 스타트 개선용)
// 시간 기반 트리거(매 5분)로 호출되어 시트 데이터를 미리 캐시에 채워둠.
// 사용자 요청 시 항상 캐시 적중 → 응답 1~2초 이내.
// ============================================================

function warmupCache() {
  try {
    CacheService.getScriptCache().remove('schedule_data_v1');
    loadSheetData_();
    Logger.log('warmupCache OK at ' + new Date().toISOString());
  } catch (err) {
    Logger.log('warmupCache error: ' + err);
  }
}
