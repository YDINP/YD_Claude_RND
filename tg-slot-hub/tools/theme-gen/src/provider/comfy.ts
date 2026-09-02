import { randomUUID } from 'node:crypto'
import {
  DEFAULT_COMFY_CFG,
  DEFAULT_COMFY_CHECKPOINT,
  DEFAULT_COMFY_POLL_INTERVAL_MS,
  DEFAULT_COMFY_POLL_TIMEOUT_MS,
  DEFAULT_COMFY_SAMPLER,
  DEFAULT_COMFY_SCHEDULER,
  DEFAULT_COMFY_STEPS,
  DEFAULT_COMFY_URL,
} from '../constants.js'
import { ProviderHttpError, withRetry } from '../retry.js'
import type { AssetSize } from '../schema.js'
import type { GenerateOptions, GeneratedImage, ImageProvider } from './types.js'

export interface ComfyProviderOptions {
  baseUrl?: string
  checkpoint?: string
  steps?: number
  cfg?: number
  sampler?: string
  scheduler?: string
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
  pollTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

interface ComfyHistoryOutputImage {
  filename: string
  subfolder: string
  type: string
}

interface ComfyHistoryEntry {
  outputs?: Record<string, { images?: ComfyHistoryOutputImage[] }>
}

function sizeToDims(size: AssetSize): { width: number; height: number } {
  const [w, h] = size.split('x')
  return { width: Number(w), height: Number(h) }
}

/** CheckpointLoaderSimple → CLIPTextEncode x2 → EmptyLatentImage → KSampler → VAEDecode → SaveImage. */
function buildWorkflow(
  cfg: { checkpoint: string; steps: number; cfg: number; sampler: string; scheduler: string },
  prompt: string,
  negative: string,
  size: AssetSize,
): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  const { width, height } = sizeToDims(size)
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: cfg.checkpoint } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: Math.floor(Math.random() * 1_000_000_000),
        steps: cfg.steps,
        cfg: cfg.cfg,
        sampler_name: cfg.sampler,
        scheduler: cfg.scheduler,
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'theme-gen' } },
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 로컬 ComfyUI 프로바이더. txt2img 워크플로우를 `/prompt`에 제출하고
 * `/history/<id>`를 폴링한 뒤 `/view`로 결과 이미지를 내려받는다.
 * 투명 배경은 SDXL 체크포인트가 지원하지 않으므로 프롬프트만 넘기고,
 * 실제 크로마키는 파이프라인에서 처리한다.
 */
export function createComfyProvider(options: ComfyProviderOptions = {}): ImageProvider {
  const baseUrl = (options.baseUrl ?? DEFAULT_COMFY_URL).replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const checkpoint = options.checkpoint ?? DEFAULT_COMFY_CHECKPOINT
  const steps = options.steps ?? DEFAULT_COMFY_STEPS
  const cfgScale = options.cfg ?? DEFAULT_COMFY_CFG
  const sampler = options.sampler ?? DEFAULT_COMFY_SAMPLER
  const scheduler = options.scheduler ?? DEFAULT_COMFY_SCHEDULER
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_COMFY_POLL_INTERVAL_MS
  const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_COMFY_POLL_TIMEOUT_MS
  const sleep = options.sleep ?? defaultSleep

  return {
    name: 'comfy',
    async generate({ prompt, negative, size }: GenerateOptions): Promise<GeneratedImage> {
      return withRetry(async () => {
        const workflow = buildWorkflow({ checkpoint, steps, cfg: cfgScale, sampler, scheduler }, prompt, negative, size)
        const clientId = randomUUID()

        const submitRes = await fetchImpl(`${baseUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        })
        if (!submitRes.ok) {
          const text = await submitRes.text().catch(() => '')
          throw new ProviderHttpError(`comfy 작업 제출 실패 (${submitRes.status}): ${text}`, submitRes.status)
        }
        const submitJson = (await submitRes.json()) as { prompt_id?: string }
        const promptId = submitJson.prompt_id
        if (promptId === undefined) throw new Error('comfy 응답에 prompt_id가 없다')

        const deadline = Date.now() + pollTimeoutMs
        let entry: ComfyHistoryEntry | undefined
        while (Date.now() < deadline) {
          const historyRes = await fetchImpl(`${baseUrl}/history/${promptId}`)
          if (historyRes.ok) {
            const historyJson = (await historyRes.json()) as Record<string, ComfyHistoryEntry>
            entry = historyJson[promptId]
            if (entry?.outputs !== undefined && Object.keys(entry.outputs).length > 0) break
          }
          await sleep(pollIntervalMs)
        }
        if (entry?.outputs === undefined) throw new Error(`comfy 작업이 시간 안에 끝나지 않았다: ${promptId}`)

        const firstOutput = Object.values(entry.outputs).find((output) => (output.images?.length ?? 0) > 0)
        const image = firstOutput?.images?.[0]
        if (image === undefined) throw new Error('comfy 출력에 이미지가 없다')

        const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder)}&type=${encodeURIComponent(image.type)}`
        const viewRes = await fetchImpl(viewUrl)
        if (!viewRes.ok) throw new ProviderHttpError(`comfy 이미지 다운로드 실패 (${viewRes.status})`, viewRes.status)

        const arrayBuffer = await viewRes.arrayBuffer()
        return { buffer: Buffer.from(arrayBuffer), mimeType: 'image/png' }
      })
    },
  }
}
