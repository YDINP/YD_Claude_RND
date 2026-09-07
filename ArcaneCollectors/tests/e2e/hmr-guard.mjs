/**
 * hmr-guard.mjs — 공유 dev 서버의 HMR 이 검증 중인 페이지를 리로드하지 못하게 막는다.
 *
 * 왜 필요한가
 *   개발 서버는 팀이 공유한다. 다른 작업자가 소스를 저장하는 순간 Vite 가 HMR 웹소켓으로
 *   `full-reload` 를 보내고 페이지가 통째로 새로 뜬다. 그러면 `window.game` 이 갈아치워져
 *   진행 중이던 검증이 "Execution context was destroyed" 나 "window.game 이 undefined" 로
 *   죽는다. 실패가 진짜 결함인지 남의 저장 때문인지 구분할 수 없게 된다.
 *
 * 무엇이 잘못돼 있었나
 *   `page.routeWebSocket(/vite|24678/)` 는 **실제 HMR URL 과 매치되지 않는다**.
 *   Vite 5 의 dev 서버는 HMR 을 별도 포트가 아니라 앱과 같은 포트에서 연다:
 *       ws://localhost:3000/?token=...
 *   경로에 `vite` 도 `24678` 도 없다. 그래서 이 가드는 처음부터 한 번도 동작하지 않았고,
 *   `routeWebSocket` 을 쓰는 스크립트조차 `cutscene-smoke` 하나뿐이었다.
 *
 * 어떻게 막는가
 *   dev 서버 **호스트**로 패턴을 만들어 그 호스트로 나가는 웹소켓만 가로챈다.
 *   핸들러를 비워 두면 Playwright 가 서버로 연결하지 않고 붙잡고 있으므로, HMR 클라이언트는
 *   연결을 기다리는 상태로 남고 서버 메시지(`connected`·`update`·`full-reload`)를 하나도
 *   받지 못한다. 서버를 건드리지 않고 이 페이지만 격리된다.
 *
 *   Supabase 실시간처럼 **다른 호스트의 웹소켓은 통과**시킨다. 무조건 다 막으면 기능이 죽는다.
 *
 * 검증
 *   `node tests/e2e/hmr-guard-verify.mjs` — 가드 없이는 리로드가 일어나고, 가드가 있으면
 *   일어나지 않는다는 것을 실제 파일 변경 이벤트로 대조한다. 패턴을 고쳤다는 주장이 아니라
 *   리로드가 실제로 차단됐다는 관측이 필요하다(이 결함의 본질이 검증되지 않은 가드였다).
 */

/** 원격(배포본) 대상이면 HMR 자체가 없다 — 가드를 걸 이유도 없다 */
export const isLocalTarget = (baseUrl) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(String(baseUrl || ''));

/**
 * dev 서버 호스트로 나가는 웹소켓만 잡는 정규식.
 * 호스트의 `.` 는 정규식 메타문자라 문자 클래스로 감싼다(`127.0.0.1` 이 아무 문자나 매치하지 않도록).
 */
export function devWsPattern(baseUrl) {
  const host = new URL(baseUrl).host;          // "localhost:3000"
  return new RegExp(`^wss?://${host.split('.').join('[.]')}`);
}

/**
 * 페이지에 HMR 차단을 건다. **`page.goto()` 전에** 불러야 한다.
 *
 * @param {import('playwright').Page} page
 * @param {string} baseUrl 검증 대상 URL (로컬이 아니면 아무 것도 하지 않는다)
 * @returns {Promise<{applied: boolean, pattern: RegExp|null, loads: () => number}>}
 *          `loads()` 는 이 페이지가 지금까지 로드된 횟수 — 가드를 뚫고 리로드가 일어났는지
 *          검증 끝에 확인할 수 있다.
 */
export async function blockHmr(page, baseUrl) {
  let loadCount = 0;
  page.on('load', () => { loadCount += 1; });
  const loads = () => loadCount;

  if (!isLocalTarget(baseUrl)) return { applied: false, pattern: null, loads };

  const pattern = devWsPattern(baseUrl);
  await page.routeWebSocket(pattern, () => {
    // 서버로 연결하지 않는다. 메시지가 오지 않으므로 HMR 이 페이지를 리로드할 수 없다.
  });
  return { applied: true, pattern, loads };
}

/**
 * 의도한 로드 횟수를 넘어섰는지 확인한다.
 * 스크립트가 스스로 `goto`/`reload` 하는 횟수를 `expected` 로 넘기면, 그보다 많은 로드는
 * 곧 "남이 저장해서 리로드됐다" 는 뜻이다 — 조용히 매달리거나 엉뚱한 실패로 보고되기 전에 잡는다.
 *
 * @returns {{ok: boolean, actual: number, expected: number}}
 */
export function checkUnexpectedReload(guard, expected) {
  const actual = guard.loads();
  return { ok: actual <= expected, actual, expected };
}
