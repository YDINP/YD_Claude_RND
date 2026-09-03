/**
 * gmi-key.mjs - GMI Cloud API 키 조회 (SND-01)
 *
 * 우선순위:
 *   1. 환경변수 GMI_API_KEY
 *   2. ~/.config/opencode/opencode.json 의 provider.gmi.options.apiKey
 *
 * 키 값은 절대 로그·표준출력·문서에 남기지 않는다. 호출부는 존재 여부만 확인할 것.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/** opencode 설정 파일 경로 (홈 디렉터리, 저장소 밖) */
const OPENCODE_CONFIG_REL = ['.config', 'opencode', 'opencode.json'];

/**
 * GMI API 키를 반환한다. 못 찾으면 null.
 * @returns {string|null}
 */
export function resolveGmiApiKey() {
  const fromEnv = process.env.GMI_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const configPath = path.join(os.homedir(), ...OPENCODE_CONFIG_REL);
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const json = JSON.parse(raw);
    const key = json?.provider?.gmi?.options?.apiKey;
    if (typeof key === 'string' && key.trim()) return key.trim();
  } catch {
    /* 설정 파일이 없거나 형식이 달라도 조용히 통과 */
  }
  return null;
}
