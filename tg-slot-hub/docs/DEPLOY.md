# 배포 가이드 (Supabase + Render + Vercel)

구성: DB = Supabase Postgres, API = Render 무료 웹 서비스(`apps/api`), 허브 = Vercel(`apps/hub`).
저장소는 `YDINP/YD_Claude_RND`(여러 프로젝트 혼재), 배포 브랜치는 `YDINP/타이쿤`, 앱 폴더는 `tg-slot-hub`.
배포 순서: **Supabase → Render → Vercel → Render CORS 갱신 → BotFather**. (CORS 에 Vercel URL 이 필요하고 Vercel 빌드에 Render URL 이 필요해서 한 번 왕복한다.)

## 0. 준비물과 결정 사항

| 이름 | 어디서 | 어디에 넣나 |
|---|---|---|
| `DATABASE_URL` | Supabase | Render(런타임), 이 PC 셸(마이그레이션 때만) |
| `TELEGRAM_BOT_TOKEN` | BotFather | Render |
| `CORS_ORIGIN` | Vercel 허브 URL (`https://xxx.vercel.app`, 끝 `/` 없이) | Render |
| `JWT_SECRET` | 자동 생성 (`generateValue`) | 입력 불필요 |
| `VITE_API_URL` | `https://tg-slot-hub-api.onrender.com` | Vercel 환경변수 |

`render.yaml` 이 `NODE_ENV=production`, `GAMES_DIR=games`, `API_ALLOW_DEV_AUTH=false`, `API_ALLOW_DEBUG_SPIN=false` 를 이미 박는다. 건드리지 말 것.

## 1. Supabase

1. supabase.com 에서 프로젝트 생성 (리전은 Render 리전과 가까운 곳, DB 비밀번호 기록).
2. Project > Connect 에서 연결 문자열 두 개를 확인한다.
   - **마이그레이션용**: Session pooler (`aws-0-<region>.pooler.supabase.com:5432`, 사용자명 `postgres.<project-ref>`). Direct(`db.<ref>.supabase.co`)는 IPv6 전용이라 IPv4 망에서 막힐 수 있어 세션 풀러를 쓴다.
   - **런타임용(Render)**: Transaction pooler (`...pooler.supabase.com:6543`). 코드가 `postgres(url, { prepare: false })` 라 풀러와 호환된다. (세션 풀러 5432 도 동작은 하지만 무료 티어 연결 수 제한이 빠듯하다.)
3. 마이그레이션 0000~0012 적용 (이 PC, 한글 경로 우회):
   ```bash
   # 한글 경로(타이쿤)에서는 pnpm install 이 죽는다. ASCII 미러에서 실행한다.
   M=C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/tgslot
   bash C:/Users/parkk/AppData/Local/Temp/claude/e44e3bd3131a0c42/7a4e751a-17ec-4d49-a6fb-3a3c0dfd7b11/scratchpad/sync.sh apps packages games tools
   cd $M && pnpm install --frozen-lockfile
   cd apps/api
   export DATABASE_URL='<세션 풀러 문자열>'   # 셸에서만. 파일에 저장·커밋 금지
   pnpm db:migrate        # = drizzle-kit migrate, drizzle/ 의 0000~0012 순서 적용
   ```
   - 미러가 없는 다른 PC 라면 `C:/dev/tg-slot-hub` 같은 ASCII 경로에 폴더를 복사해서 같은 명령을 쓴다.
   - 검증: PGlite 로 `drizzle/` 전체를 빈 DB 에 적용하는 통합 테스트(`apps/api/src/repos/drizzle.integration.test.ts`)가 통과한다. 실제 Supabase 에서는 Table Editor 에 `users, wallets, ledger, rounds, game_states, jackpot_pool ...` 가 보이고 `drizzle.__drizzle_migrations` 에 13행이 있으면 정상.
   - `db:push` 는 쓰지 말 것 (트리거·시드 SQL 이 빠질 수 있다). 반드시 `db:migrate`.

## 2. Render (API)

1. dashboard.render.com > New > **Blueprint** > GitHub 저장소 `YDINP/YD_Claude_RND` 연결. Blueprint 파일은 저장소 루트의 `render.yaml`, 브랜치는 `YDINP/타이쿤`.
2. `tg-slot-hub-api` 서비스가 만들어지면 Environment 에서 `sync: false` 항목을 채운다.
   - `DATABASE_URL` = Supabase 트랜잭션 풀러 문자열
   - `TELEGRAM_BOT_TOKEN` = BotFather 토큰
   - `CORS_ORIGIN` = 일단 임시 `https://placeholder.invalid` (3단계 후 Vercel URL 로 교체)
   - `JWT_SECRET` 은 자동 생성 (32자 이상이어야 부팅됨).
3. Deploy. 빌드는 `pnpm install --frozen-lockfile --prod=false --filter "@tgslot/api..."` 후 `tsup`. 첫 배포 URL 이 `https://tg-slot-hub-api.onrender.com` 이 아니면(이름 충돌 시 접미사가 붙는다) 그 URL 을 아래 Vercel 에 쓴다.
4. 확인: `curl https://tg-slot-hub-api.onrender.com/health` → `{"ok":true}`, `/games` 에 게임 7종.
5. 무료 플랜은 15분 무호출 시 잠든다 (첫 요청 30~60초). 일반 사용에는 감수하고, 필요하면 외부 핑(UptimeRobot 등)으로 `/health` 를 5~10분마다 호출한다.

## 3. Vercel (허브)

1. vercel.com > Add New Project > 같은 저장소 import.
2. **Root Directory = `tg-slot-hub`** (Framework Preset 은 Other). `tg-slot-hub/vercel.json` 이 install/build/output 을 지정한다 (`apps/hub/dist`).
3. Settings > Git > Production Branch = `YDINP/타이쿤`.
4. Environment Variables (Production): `VITE_API_URL = https://tg-slot-hub-api.onrender.com`. 빠지면 빌드가 일부러 실패한다. `VITE_DEV_MOCK_TMA` 는 절대 넣지 않는다 (넣어도 프로덕션 빌드에서 무시되지만).
5. Deploy. 발급된 URL(`https://<name>.vercel.app`)을 복사.
6. 해시 라우터(`#/...`)라 SPA rewrite 는 필요 없다. 게임 에셋은 빌드 때 `dist/games/<id>/theme` 로 복사된다 (확인: `https://<name>.vercel.app/games/classic-777/theme/theme.json`).
7. Render 로 돌아가 `CORS_ORIGIN` 을 이 Vercel URL (끝 `/` 없이) 로 교체하고 재배포. 커스텀 도메인을 쓰면 그 도메인으로.

## 4. BotFather

봇 프로세스는 필요 없다. 미니앱 열기는 BotFather 설정만으로 된다 (아래 "봇 권고" 참고).

1. BotFather > `/mybots` > 봇 선택 > Bot Settings > Menu Button > Configure menu button > URL 에 Vercel URL, 버튼 이름 `Play`.
   또는 `/setmenubutton` 후 봇 선택, URL, 이름 순서로 입력.
2. 공유용 딥링크(`t.me/<bot>/<app>`)가 필요하면 `/newapp` 으로 Web App 등록 (URL = Vercel URL).
3. (선택) 명령어·설명을 한 번에 넣으려면 로컬에서:
   ```bash
   cd $M/apps/bot   # 위 미러
   TELEGRAM_BOT_TOKEN='<토큰>' MINI_APP_URL='https://<name>.vercel.app' pnpm setup:bot
   ```

## 5. 검증 체크리스트

- [ ] `GET <render>/health` 200, `GET <render>/games` 7개
- [ ] Render 로그에 `[repos] DATABASE_URL set -> using Postgres` 와 `loaded 7 visible game pack(s)`, `[config] ... =true` 경고 없음
- [ ] `curl -H "Origin: https://evil.example" -i <render>/health` 응답에 `access-control-allow-origin` 가 허브 origin 이 아니거나 없음
- [ ] Vercel URL 을 브라우저에서 열면 (initData 없음) 로그인 실패 화면이 정상. 텔레그램 안에서 열어야 로그인된다
- [ ] 텔레그램에서 봇 > Play 버튼 > 로비 로딩 > 가입 보너스 지급 > 스핀 1회 성공
- [ ] Supabase `ledger`/`rounds` 에 행이 생김
- [ ] `https://<name>.vercel.app/games/classic-777/theme/theme.json` 이 JSON 으로 열림
- [ ] 모의 로그인 차단 확인: `POST <render>/auth/telegram` 에 `initData=mock:1:x` 를 보내면 거부됨

## 6. 프로덕션 안전장치 (코드에 이미 있음)

- `NODE_ENV=production` 에서 `API_ALLOW_DEV_AUTH=true` / `API_ALLOW_DEBUG_SPIN=true` 면 **부팅 거부**. 디버그 스핀 코드는 빌드 번들에서도 제거된다.
- `CORS_ORIGIN` 미설정 또는 `*` 면 부팅 거부, `JWT_SECRET` 32자 미만이면 부팅 거부, `DATABASE_URL` 없으면 부팅 거부.
- 허브 프로덕션 빌드는 `VITE_DEV_MOCK_TMA=true` 여도 mock 로그인 경로가 죽은 코드(`!1?...`)로 제거된다.

## 7. 알려진 제약

- `pnpm-lock.yaml` 은 `@electric-sql/pglite`(api devDependency)가 빠져 있어 `--frozen-lockfile` 이 실패하던 상태라 이번에 갱신했다.
- 마이그레이션 자동 실행은 없다 (Render 무료 플랜은 preDeployCommand 불가). 스키마가 바뀌면 이 PC 에서 1단계 3번을 다시 돌린 뒤 Render 를 배포한다.
- 지갑·스핀은 서버 권위, 가상 코인 전용. 실결제 연동 전에는 이대로 운영 가능하다.
