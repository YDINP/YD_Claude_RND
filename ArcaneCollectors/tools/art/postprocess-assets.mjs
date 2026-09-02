/**
 * postprocess-assets.mjs — Node 진입점 (T-02 선행)
 *
 * 실제 이미지 처리는 tools/art/postprocess-assets.py(Pillow)가 한다. 이 프로젝트에는
 * sharp 가 설치되어 있지 않고(package.json 미포함), 로컬에 Python 3.12 + Pillow 12가
 * 이미 있어 그쪽을 재사용한다. npm 스크립트/CI 관례상 `node tools/art/...` 진입점을
 * 유지하기 위한 얇은 래퍼일 뿐, 로직은 전부 .py 쪽에 있다.
 *
 * 실행
 *   node tools/art/postprocess-assets.mjs [--force] [--dry-run]
 */
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pyScript = join(__dirname, 'postprocess-assets.py');
const args = process.argv.slice(2);

function run(pythonCmd) {
  return spawnSync(pythonCmd, [pyScript, ...args], { stdio: 'inherit' });
}

let result = run('python');
if (result.error) {
  // Windows 에 `python`이 없고 `python3`만 있는 환경 대비
  result = run('python3');
}

if (result.error) {
  console.error('[postprocess-assets] Python 실행 파일을 찾을 수 없습니다 (python / python3 모두 실패).');
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
