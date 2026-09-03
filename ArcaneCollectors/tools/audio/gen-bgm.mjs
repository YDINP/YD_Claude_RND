/**
 * gen-bgm.mjs - SND-01 BGM 생성 파이프라인
 *
 * GMI Cloud 요청큐 API(minimax-music-3.0)로 인스트루멘탈 트랙을 생성한 뒤
 * ffmpeg 으로 루프 친화 가공(무음 제거 → 끝↔앞 크로스페이드 → loudnorm -16 LUFS)해
 * public/assets/audio/bgm/<key>.mp3 / .ogg 로 굽는다.
 *
 * 사용법:
 *   node tools/audio/gen-bgm.mjs                 # 없는 트랙만 생성+가공
 *   node tools/audio/gen-bgm.mjs --only=main,boss
 *   node tools/audio/gen-bgm.mjs --force         # 기존 파일 덮어쓰기
 *   node tools/audio/gen-bgm.mjs --process-only  # 이미 받아둔 raw mp3 재가공만
 *
 * 주의: API 키는 환경변수 GMI_API_KEY 또는 opencode 설정에서 읽는다(gmi-key.mjs).
 *       키 값은 어떤 로그에도 출력하지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveGmiApiKey } from './gmi-key.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const RAW_DIR = path.join(PROJECT_ROOT, 'tools', 'audio', '.raw');
const OUT_DIR = path.join(PROJECT_ROOT, 'public', 'assets', 'audio', 'bgm');

/** GMI 요청큐 엔드포인트 (LLM 용 /v1/chat/completions 와 다르다) */
const GMI_ENDPOINT = 'https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey/requests';
/** 모델 ID — 점 포함 정확히 이 문자열이어야 한다. 다르면 즉시 404 */
const GMI_MODEL = 'minimax-music-3.0';
/** 생성 요청 타임아웃(ms). 성공 케이스가 수십 초 걸리므로 넉넉히 둔다 */
const REQUEST_TIMEOUT_MS = 300000;

/** 모든 트랙 공통 인스트루멘탈 강제 문구 (보컬 혼입 방지) */
const INSTRUMENTAL_CLAUSE =
  'Instrumental only. No vocals, no singing, no human voice, no lyrics, no spoken word, no choir words. '
  + 'Video game background music built to loop seamlessly, steady arrangement with no fade-in and no fade-out. '
  + 'Avoid entirely: vocals, singer, rap, vocal chops, lead voice.';

/** 루프 트랙 끝↔앞 크로스페이드 길이(초) */
const LOOP_CROSSFADE_SEC = 1.0;
/** 목표 라우드니스 (EBU R128) */
const LOUDNORM_TARGET = 'I=-16:TP=-1.5:LRA=11';
/** 무음 제거 필터 */
const SILENCE_FILTER = 'silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak';

/**
 * 트랙 정의.
 * markers: 가사 자리에 넣는 구조 태그 — MiniMax 는 마커 수가 길이를 끈다(마커당 7~10초).
 * loop: true 면 크로스페이드 루프 가공, false 면 스팅(짧게 잘라 페이드아웃).
 */
const TRACKS = [
  {
    key: 'bgm_main',
    markers: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    maxSeconds: 60,
    loop: true,
    prompt:
      'Mysterious ambient orchestral theme for a fantasy collection RPG lobby, world concept "the Divine Fissure". '
      + 'Slow 70 BPM in D minor. Sustained string pad carries the bed, a solo celesta states a four-note motif every '
      + 'four bars, low harp arpeggios drift underneath, soft glass bells decorate the phrase ends. '
      + 'Warm, wondrous and a little melancholy, never tense. Wide reverb, gentle dynamics, no percussion hits. '
      + INSTRUMENTAL_CLAUSE
  },
  {
    key: 'bgm_battle',
    markers: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    maxSeconds: 60,
    loop: true,
    prompt:
      'Tense hybrid orchestral battle music for a turn-based fantasy RPG. Driving 120 BPM in E minor, strict 4/4. '
      + 'Staccato low strings ride steady eighth notes as the engine, taiko and toms mark every downbeat, '
      + 'a brass ostinato answers in two-bar calls, a synth pulse doubles the bassline underneath. '
      + 'Urgent and forward-moving with tight dynamics and no ritardando, phrases resolve on whole four-bar cycles. '
      + INSTRUMENTAL_CLAUSE
  },
  {
    key: 'bgm_boss',
    markers: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    maxSeconds: 60,
    loop: true,
    prompt:
      'Grand percussion-led boss battle music for a dark fantasy RPG. 100 BPM in C minor, heavy 4/4. '
      + 'Massive taiko ensemble and orchestral bass drums lead the arrangement, metal anvil hits accent beat three, '
      + 'low brass swells sit far behind the drums as texture only, a bowed double bass drone holds the key. '
      + 'Overwhelming, ritual and menacing. Percussion stays in front of everything at all times. '
      + 'Avoid entirely: choir, chanting, epic trailer choir, orchestral choir pads. '
      + INSTRUMENTAL_CLAUSE
  },
  {
    key: 'bgm_gacha',
    markers: ['intro', 'verse', 'chorus', 'outro'],
    maxSeconds: 45,
    loop: true,
    prompt:
      'Anticipation music for a gacha summoning screen in a fantasy RPG. Light 90 BPM in A major. '
      + 'Rolling harp arpeggios run continuously as the main figure, tuned glockenspiel and music-box bells sparkle on '
      + 'the offbeats, a shimmering high string pad rises slowly underneath, a soft chime marks every fourth bar. '
      + 'Bright, magical and expectant, building gently without ever arriving. No drums, no bass drops. '
      + INSTRUMENTAL_CLAUSE
  },
  {
    key: 'bgm_victory',
    markers: ['intro', 'chorus'],
    maxSeconds: 11,
    loop: false,
    prompt:
      'Short triumphant victory fanfare for a fantasy RPG results screen. Bright 130 BPM in B flat major. '
      + 'Trumpets and horns open on a rising major triad fanfare from the very first beat, a timpani roll answers, '
      + 'orchestral strings and a cymbal crash land the final chord, tubular bells ring out over the ending. '
      + 'Immediate impact with no build-up, celebratory and clean, resolves fully within ten seconds. '
      + INSTRUMENTAL_CLAUSE
  },
  {
    key: 'bgm_defeat',
    markers: ['intro', 'outro'],
    maxSeconds: 9,
    loop: false,
    prompt:
      'Short somber defeat sting for a fantasy RPG results screen. Slow 60 BPM in F minor. '
      + 'A descending minor cadence on low strings and muted horn falls from the very first beat, '
      + 'a single soft timpani hit closes it, low piano notes decay into silence. '
      + 'Melancholy and deflating, no drama and no percussion roll, resolves within eight seconds. '
      + INSTRUMENTAL_CLAUSE
  }
];

// ==================== 유틸 ====================

/** 외부 바이너리 실행 (실패 시 stderr 포함 throw) */
function run(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** 오디오 길이(초) 조회 */
function probeDuration(file) {
  const out = run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file
  ]);
  return parseFloat(out.trim());
}

/** 구조 태그만 담은 lyrics 문자열 — GMI 는 lyrics 가 필수라 무보컬이어도 넣어야 한다 */
function buildLyrics(markers) {
  return markers.map((m) => `[${m}]`).join('\n');
}

/** 트랙 1개 생성 요청 → raw mp3 경로 반환 */
async function generateTrack(track, apiKey) {
  const body = {
    model: GMI_MODEL,
    payload: {
      lyrics: buildLyrics(track.markers),
      prompt: track.prompt,
      format: 'mp3'
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(GMI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GMI ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const url = json?.outcome?.audio_url;
  if (!url) throw new Error(`audio_url 없음: ${JSON.stringify(json).slice(0, 300)}`);

  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error(`오디오 다운로드 실패 ${audioRes.status}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());

  fs.mkdirSync(RAW_DIR, { recursive: true });
  const rawPath = path.join(RAW_DIR, `${track.key}.mp3`);
  fs.writeFileSync(rawPath, buf);
  return rawPath;
}

/**
 * 루프 트랙 필터: 무음 제거 → 목표 길이로 자름 → 끝 X초를 앞 X초에 크로스페이드 → loudnorm.
 * 결과물은 이어붙였을 때 이음매가 들리지 않는다(코드에서 loop:true 로 재생).
 */
function buildLoopFilter(usableSec) {
  const x = LOOP_CROSSFADE_SEC;
  const bodyEnd = usableSec - x;
  return [
    `[0:a]${SILENCE_FILTER},atrim=0:${usableSec.toFixed(3)},asetpts=PTS-STARTPTS,asplit=3[s1][s2][s3]`,
    `[s1]atrim=0:${x.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${x.toFixed(3)}[head]`,
    `[s2]atrim=${bodyEnd.toFixed(3)}:${usableSec.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${x.toFixed(3)}[tail]`,
    '[head][tail]amix=inputs=2:normalize=0[seam]',
    `[s3]atrim=${x.toFixed(3)}:${bodyEnd.toFixed(3)},asetpts=PTS-STARTPTS[body]`,
    `[seam][body]concat=n=2:v=0:a=1,loudnorm=${LOUDNORM_TARGET}[out]`
  ].join(';');
}

/** 스팅 필터: 무음 제거 → 목표 길이로 자름 → 끝 0.6초 페이드아웃 → loudnorm */
function buildStingFilter(usableSec) {
  const fadeStart = Math.max(0, usableSec - 0.6);
  return `[0:a]${SILENCE_FILTER},atrim=0:${usableSec.toFixed(3)},asetpts=PTS-STARTPTS,`
    + `afade=t=out:st=${fadeStart.toFixed(3)}:d=0.6,loudnorm=${LOUDNORM_TARGET}[out]`;
}

/** raw mp3 → public/assets/audio/bgm/<key>.{mp3,ogg} */
function processTrack(track, rawPath) {
  const duration = probeDuration(rawPath);
  const usable = Math.min(track.maxSeconds, Math.max(4, duration - 0.3));
  const filter = track.loop ? buildLoopFilter(usable) : buildStingFilter(usable);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outputs = [
    { file: path.join(OUT_DIR, `${track.key}.mp3`), args: ['-c:a', 'libmp3lame', '-q:a', '5'] },
    { file: path.join(OUT_DIR, `${track.key}.ogg`), args: ['-c:a', 'libvorbis', '-q:a', '4'] }
  ];

  for (const out of outputs) {
    run('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', rawPath,
      '-filter_complex', filter, '-map', '[out]',
      '-ar', '44100', '-ac', '2',
      ...out.args, out.file
    ]);
  }

  return outputs.map((o) => ({
    file: o.file,
    bytes: fs.statSync(o.file).size,
    seconds: probeDuration(o.file)
  }));
}

// ==================== 메인 ====================

function parseArgs(argv) {
  const only = argv.find((a) => a.startsWith('--only='));
  return {
    only: only ? only.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null,
    force: argv.includes('--force'),
    processOnly: argv.includes('--process-only')
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const targets = TRACKS.filter((t) => !opts.only
    || opts.only.includes(t.key)
    || opts.only.includes(t.key.replace(/^bgm_/, '')));

  if (targets.length === 0) {
    console.error('대상 트랙이 없습니다.');
    process.exit(1);
  }

  let apiKey = null;
  if (!opts.processOnly) {
    apiKey = resolveGmiApiKey();
    if (!apiKey) {
      console.error('GMI API 키를 찾지 못했습니다. GMI_API_KEY 를 설정하거나 --process-only 로 실행하세요.');
      process.exit(2);
    }
    console.log('[gen-bgm] GMI API 키 확인됨 (값은 출력하지 않음)');
  }

  const done = [];
  for (const track of targets) {
    const finalMp3 = path.join(OUT_DIR, `${track.key}.mp3`);
    if (!opts.force && fs.existsSync(finalMp3)) {
      console.log(`[gen-bgm] ${track.key}: 이미 존재 → 건너뜀 (--force 로 재생성)`);
      continue;
    }

    const rawPath = path.join(RAW_DIR, `${track.key}.mp3`);
    try {
      if (!opts.processOnly && (opts.force || !fs.existsSync(rawPath))) {
        console.log(`[gen-bgm] ${track.key}: 생성 요청 (수십 초 소요)...`);
        const t0 = Date.now();
        await generateTrack(track, apiKey);
        console.log(`[gen-bgm] ${track.key}: 생성 완료 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
      if (!fs.existsSync(rawPath)) {
        console.error(`[gen-bgm] ${track.key}: raw 파일 없음 → 건너뜀`);
        continue;
      }
      processTrack(track, rawPath).forEach((o) => {
        console.log(`[gen-bgm] ${path.basename(o.file)} — ${(o.bytes / 1024).toFixed(0)}KB / ${o.seconds.toFixed(1)}s`);
      });
      done.push(track.key);
    } catch (err) {
      console.error(`[gen-bgm] ${track.key}: 실패 — ${err.message}`);
    }
  }

  console.log(`[gen-bgm] 완료: ${done.length}/${targets.length} 트랙`);
}

main();

export { TRACKS, buildLyrics };
