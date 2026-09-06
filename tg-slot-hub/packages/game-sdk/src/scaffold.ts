/**
 * `games/_template`에서 새 게임 팩을 찍어내는 순수 로직.
 *
 * 디스크를 모른다 — 템플릿 파일 맵을 받아 새 파일 맵을 돌려줄 뿐이라 테스트가 쉽다.
 * 실제 읽기/쓰기는 `newGameCli.ts`가 한다.
 */

/** 스캐폴드 팩의 id. 템플릿 안에서 이 문자열이 새 id로 치환된다. */
export const TEMPLATE_ID = '_template'
/** 템플릿 manifest의 표시 이름. 새 id에서 만든 이름으로 치환된다. */
const TEMPLATE_NAME_EN = 'Template Slot'
const TEMPLATE_NAME_KO = '템플릿 슬롯'

/** kebab-case id 규칙. 폴더 이름·manifest.id·math.id·prompts.game이 전부 이 값이다. */
export const GAME_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function isValidGameId(id: string): boolean {
  return GAME_ID_PATTERN.test(id)
}

/** `royal-diamond-777` -> `Royal Diamond 777`. 사람이 다시 손볼 자리 표시자다. */
export function titleFromId(id: string): string {
  return id
    .split('-')
    .map((word) => (word === '' ? word : `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`))
    .join(' ')
}

/** 템플릿에서 그대로 복사할 파일. 여기 없는 파일은 새 팩에 들어가지 않는다. */
export const SCAFFOLD_FILES = [
  'manifest.json',
  'math.json',
  'art/prompts.json',
  'art/fx.json',
  'README.md',
  'CHECKLIST.md',
] as const

export interface ScaffoldResult {
  /** 새 팩 폴더에 쓸 파일. 키는 팩 폴더 기준 상대 경로. */
  files: Record<string, string>
  /** 템플릿에 없어서 건너뛴 파일. 템플릿이 낡았을 때 CLI가 경고한다. */
  skipped: string[]
}

/**
 * 템플릿 파일 맵에서 새 팩의 파일 맵을 만든다.
 *
 * 치환은 세 가지뿐이다: 팩 id, 영문 표시 이름, 한글 표시 이름.
 * 나머지 TODO는 일부러 그대로 남긴다 — 사람이 채워야 할 자리가 눈에 보여야 한다.
 */
export function scaffoldGamePack(id: string, template: Readonly<Record<string, string>>): ScaffoldResult {
  if (!isValidGameId(id)) {
    throw new RangeError(`게임 id는 kebab-case여야 한다 (${GAME_ID_PATTERN.source}): ${id}`)
  }

  const title = titleFromId(id)
  const replacements: [string, string][] = [
    [TEMPLATE_NAME_EN, title],
    [TEMPLATE_NAME_KO, title],
    [TEMPLATE_ID, id],
  ]

  const files: Record<string, string> = {}
  const skipped: string[] = []
  for (const path of SCAFFOLD_FILES) {
    const source = template[path]
    if (source === undefined) {
      skipped.push(path)
      continue
    }
    files[path] = replacements.reduce((text, [from, to]) => text.split(from).join(to), source)
  }
  return { files, skipped }
}
