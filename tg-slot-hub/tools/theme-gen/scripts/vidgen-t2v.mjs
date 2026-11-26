/**
 * SeeDance 2.0 텍스트→영상(t2v) 한 편을 만든다. tg-slot-hub 전환 클립 발주용.
 * vocalo-ch/bugnomama/scripts/vidgen.mjs 에서 이미지 첨부와 16:9 고정을 걷어 낸 변형이다.
 *
 * 사용: node --env-file=<.env 경로> vidgen-t2v.mjs --out <mp4> --prompt "..."
 *        [--prompt-file <txt>] [--seconds 13] [--ratio 9:16] [--resolution 1080p] [--seed 7] [--model seedance-2-0]
 *
 * - TRANSITION_DESIGN R3: camera_fixed 를 넘기지 않는다(t2v 가 거부). 카메라 고정은 프롬프트 본문 문장으로.
 * - 편당 약 $0.93(길이 무관, 13초 이하). 이 엔드포인트는 prompt 만 있으면 바로 과금 작업이 큐에 들어간다.
 * - 결과 URL 은 24시간 뒤 만료 → 받는 즉시 저장하고 <out>.json 에 task/prompt 를 남긴다.
 * - 키는 환경변수 MDBOX_API_KEY 로만 받고 어디에도 출력하지 않는다.
 */
import { readFile, writeFile } from 'node:fs/promises'

const API = 'https://api.mdbox.ai'
const key = process.env.MDBOX_API_KEY
if (!key) { console.error('MDBOX_API_KEY 없음 (--env-file=.env)'); process.exit(3) }

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[++i]
}
const prompt = args['prompt-file'] ? (await readFile(args['prompt-file'], 'utf8')).trim() : args.prompt
if (!args.out || !prompt || prompt === true) {
  console.error('usage: --out <mp4> (--prompt "..." | --prompt-file <txt>) [--seconds 13] [--ratio 9:16] [--resolution 1080p] [--seed] [--model]')
  process.exit(3)
}
const seconds = Number(args.seconds || 13)
if (!(seconds > 0 && seconds <= 13)) { console.error('seconds 는 13 이하'); process.exit(3) }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const model = args.model || 'seedance-2-0'
const body = {
  model,
  prompt,
  seconds: String(seconds),
  metadata: {
    content: [{ type: 'text', text: prompt }],
    resolution: args.resolution || '1080p',
    ratio: args.ratio || '9:16',
    ...(args.seed ? { seed: Number(args.seed) } : {}),
    generate_audio: false,
  },
}

const sub = await fetch(`${API}/v1/videos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const sj = await sub.json().catch(() => ({}))
if (!sub.ok) { console.error('submit 실패', sub.status, JSON.stringify(sj).slice(0, 400)); process.exit(4) }
const task = sj.task_id || sj.id
console.error(`task=${task} model=${model} ${body.seconds}s ratio=${body.metadata.ratio}`)

let url = null
for (let i = 0; i < 120; i++) {
  await sleep(8000)
  const r = await fetch(`${API}/v1/videos/${task}`, { headers: { Authorization: `Bearer ${key}` } })
  const j = await r.json().catch(() => ({}))
  process.stderr.write(`. ${j.status} ${j.progress ?? ''}\r`)
  if (j.status === 'completed' || j.status === 'done') { url = j?.metadata?.url || j?.video?.url; break }
  if (j.status === 'failed' || j.status === 'error') { console.error('\n실패', JSON.stringify(j).slice(0, 600)); process.exit(5) }
}
if (!url) { console.error('\ntimeout — task ' + task + ' 로 다시 폴링 가능'); process.exit(6) }

const dl = await fetch(url)
if (!dl.ok) throw new Error(`download ${dl.status}`)
await writeFile(args.out, Buffer.from(await dl.arrayBuffer()))
await writeFile(args.out + '.json', JSON.stringify({ task, model, body, url }, null, 2))
console.error(`\n→ ${args.out}`)
