/**
 * Schedule.gs - 일정 캐시 워밍 (콜드 스타트 개선용)
 *
 * 시간 기반 트리거(매 5분)로 호출되어 시트 데이터를 미리 읽고 캐시에 채워 둡니다.
 * 사용자 요청 시 항상 캐시 적중 → 응답 1~2초 이내.
 *
 * 의존: loadSheetData_(), 캐시 키 'schedule_data_v1' (Schedule.gs 본체에 정의)
 */

function warmupCache() {
  try {
    CacheService.getScriptCache().remove('schedule_data_v1');
    loadSheetData_();
    Logger.log('warmupCache OK at ' + new Date().toISOString());
  } catch (err) {
    Logger.log('warmupCache error: ' + err);
  }
}
