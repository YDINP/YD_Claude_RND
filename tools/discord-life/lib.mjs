// 페이퍼닥 디스코드 「생활」 카테고리 게시용 공용 함수.
// 봇 토큰은 grantboard/.dev.vars 에서 읽고 절대 출력하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
const VARS = path.join(HERE, '..', '..', 'grantboard', '.dev.vars');
const env = Object.fromEntries(
  fs.readFileSync(VARS, 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
  }),
);
export const GUILD = env.DISCORD_GUILD_ID;
const TOKEN = env.DISCORD_BOT_TOKEN;

export async function api(method, route, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://discord.com/api/v10${route}`, {
      method,
      headers: { Authorization: `Bot ${TOKEN}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const j = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, ((j.retry_after ?? 1) * 1000) + 200));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${text.split(TOKEN).join('***').slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error(`${method} ${route} → 429 반복`);
}

const STATE = path.join(HERE, 'state.json');
export const loadState = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { posted: {} });
export const saveState = (s) => fs.writeFileSync(STATE, JSON.stringify(s, null, 2) + '\n');
