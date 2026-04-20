# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Howzat — Know Your Legends** is a serverless cricket challenge platform at [playhowzat.com](https://playhowzat.com). Players identify legendary cricketers from silhouette videos (bowling and batting categories) and answer daily cricket trivia. Built as an AWS cloud engineering portfolio project.

Three daily challenges: Guess the Bowler, Guess the Batter, Cricket Trivia.

---

## Commands

### Running Tests (primary dev workflow)

```bash
# Layer 1: Jest unit tests (58 tests, no AWS needed)
cd tests/unit
node --experimental-vm-modules node_modules/jest/bin/jest.js

# Layer 2: Bruno API tests (requires live dev API + DEV_TEST_TOKEN env var)
bru run --env dev tests/api/

# Layer 3: Playwright E2E (requires deployed frontend)
cd tests/e2e && npx playwright test
```

### Backend Lambda Functions

Each Lambda has its own `node_modules`. The root `package.json` only contains test scripts.

```bash
# Install per-function (needed before manual deploys)
cd backend/functions/save-score && npm install
cd backend/functions/leaderboard && npm install
# ...etc for each function
```

### Infrastructure

```bash
cd infrastructure
terraform init
terraform plan
terraform apply
```

Requires AWS CLI profile `cricket-zone` configured locally.

### Frontend Deployment

Push to `main` triggers GitHub Actions (unit tests → Lambda deploys → S3 sync → CloudFront invalidation).

Manual deploy:
```bash
aws s3 sync frontend/ s3://cricket-zone-frontend-hussain/ --delete
```

---

## Architecture

```
Browser → CloudFront (playhowzat.com) → S3 (frontend/index.html)
                                                    ↕ API calls
                                        API Gateway (HTTP API)
                                        ├── GET    /daily          → Lambda: daily-challenge
                                        ├── POST   /score          → Lambda: save-score
                                        ├── GET    /leaderboard    → Lambda: leaderboard
                                        ├── GET    /played-today   → Lambda: played-today
                                        ├── GET    /avatar/upload-url → Lambda: avatar-upload
                                        ├── DELETE /account        → Lambda: delete-account
                                        └── POST   /rename         → Lambda: rename-user
                                                    ↕
                                              DynamoDB
                                        ├── cricket-zone-scores (+ GSI: category-date-index)
                                        └── cricket-zone-content (reserved)
```

API Base URL: `https://h3laal38ta.execute-api.us-east-1.amazonaws.com`

---

## Frontend (`/frontend/index.html`)

A single-file SPA — all HTML, CSS, and JavaScript in one file (~183KB). No framework, no bundler.

### Screens
- `#landingScreen` — category cards (Bowling, Batting, Trivia), leaderboard tabs, profile header
- `#categoryScreen` — mode selector (Classic / Blitz / Daily)
- `#gameScreen` — active game (video, clues, guess input, score)
- `#resultScreen` — round result with play-next suggestion
- `#finalScreen` — session summary, score submission, leaderboard preview
- `#triviaIntroScreen` — trivia intro
- `#triviaScreen` — active trivia question with timer
- `#triviaResultScreen` — trivia results

### Key Global State
- **`G`** — runtime game state object (`mode`, `category`, `queue`, `idx`, `score`, `triviaQuestions`, etc.)
- **`VIDEO_BOWLERS`** — filtered subset of `BOWLERS` with video clips: `['anderson', 'boult', 'akhtar', 'harbhajan']`
- **`VIDEO_BATTERS`** — filtered subset of `BATTERS` with video clips: `['azam', 'tendulkar', 'pietersen', 'lara', 'anwar', 'bradman']`
- **`BATTERS`** — inline array with `{id, name, nation, era, style, clues}` for each video batter
- **`BOWLERS`** — inline array with `{id, name, ...}` for each video bowler

### Video Content
- **Batting:** `content/batting/{anwar,azam,bradman,lara,pietersen,tendulkar}.mp4`
- **Bowling:** `content/bowling/{akhtar,anderson,boult,harbhajan}.mp4`
- All videos are 720×720, H.264, compressed to ~400–1500 KiB each
- `.mov` files must be converted and compressed with ffmpeg before deployment (see Video Workflow below)

### Config Placeholders (injected at deploy time by GitHub Actions `sed`)
- `__API_URL__` → production API Gateway URL
- `__COGNITO_USER_POOL_ID__` → Cognito pool ID
- `__COGNITO_CLIENT_ID__` → Cognito app client ID
- `__COGNITO_DOMAIN__` → Cognito hosted UI domain
- `__AVATAR_BASE_URL__` → CloudFront base URL for avatars

### localStorage Keys
- `cz3` — serialized stats object (streak, wins, gamesPlayed, bestScore)
- `cz_uid` — user ID (authenticated sub or guest_* prefix)
- `cz_user_name` — display name
- `cz_user_email` — email (authenticated only)
- `cz_country` — ISO 3166-1 alpha-2 country code (for flag display)
- `howzat_last_played` — date string for bowling daily played guard
- `howzat_batting_last_played` — date string for batting daily played guard
- `howzat_trivia_last_played` — date string for trivia daily played guard

### Trivia Question Selection
Daily questions use a **seeded Fisher-Yates shuffle** keyed to the current date:
```js
function getDailyTriviaQuestions(pool) {
  const d = new Date().toISOString().split('T')[0];
  let h = 0; for (const c of d) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const j = h % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(5, pool.length));
}
```
This replaced a naive consecutive-slice algorithm that caused heavy question overlap between days.

### Header User Display
- Desktop: shows profile picture + country flag only (no username text)
- Mobile (≤520px): shows profile picture only (flag hidden)
- `#huFlag` element holds the flag; `#huName` is hidden globally via CSS

---

## Backend (`/backend/functions/`)

Seven independent Lambda functions (Node.js 20.x ESM — `.mjs` files). Each has its own `node_modules`.

| Function | Route | Auth | Purpose |
|---|---|---|---|
| `daily-challenge` | `GET /daily?category=bowling` | None | Returns today's player via date hash |
| `save-score` | `POST /score` | Optional Bearer | Writes score + upserts #summary record |
| `leaderboard` | `GET /leaderboard` | Optional Bearer | Daily top 20 or all-time Hall of Fame |
| `played-today` | `GET /played-today` | Required Bearer | Checks bowling/batting/trivia played state |
| `avatar-upload` | `GET /avatar/upload-url` | Required Bearer | Returns presigned S3 upload URL |
| `delete-account` | `DELETE /account` | Required Bearer | Deletes Cognito user + all DynamoDB scores |
| `rename-user` | `POST /rename` | Required Bearer | Updates playerName across all records |

### Auth Pattern (same across all authenticated functions)
```js
let claims = event.requestContext?.authorizer?.jwt?.claims;
if (!claims?.sub) {
  const auth = event.headers?.Authorization ?? event.headers?.authorization ?? '';
  if (auth.startsWith('Bearer ')) {
    claims = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString());
  }
}
```

### Date Validation Pattern (save-score, leaderboard, played-today)
Client date is accepted only if it falls within `[yesterday_UTC, today_UTC]`. This allows UTC- timezone users to post on the correct local date while blocking future date manipulation.

### save-score — Streak Logic
- Score = 0 → streak resets to 0
- Last played = today → streak unchanged (prevents double-increment)
- Last played = yesterday → streak + 1
- Anything else → streak = 1

### rename-user — Name Validation
- 3–20 characters, letters/numbers/spaces/underscores/hyphens only
- Profanity list checked via `toLowerCase().includes(word)`
- Updates `#summary` record first, then all game records in parallel batches of 25

---

## DynamoDB Schema

**`cricket-zone-scores`** (PAY_PER_REQUEST)
- PK: `userId` (hash) + `scoreId` (range)
- `scoreId` format for game records: `category#date#uuid` (e.g. `bowling#2026-04-19#abc123`)
- `scoreId` for summary records: `#summary` (sorts before all game records)
- GSI `category-date-index`: hash = `category`, range = `date`
- TTL attribute: `ttl` (Unix timestamp, 90-day expiry on game records; no TTL on `#summary`)

**`cricket-zone-content`** (PAY_PER_REQUEST) — reserved, unused

---

## Testing (`/tests/`)

### Layer 1: Jest Unit Tests (`/tests/unit/`)

```bash
cd tests/unit && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

**ESM mocking approach:** `moduleNameMapper` in `jest.config.mjs` redirects all `@aws-sdk/*` imports to local mock files in `__mocks__/`. This works because each Lambda resolves AWS SDK from its own `node_modules`, so `jest.unstable_mockModule` alone would not intercept.

```js
// jest.config.mjs
moduleNameMapper: {
  '^@aws-sdk/client-dynamodb$': '<rootDir>/__mocks__/client-dynamodb.mjs',
  '^@aws-sdk/lib-dynamodb$':    '<rootDir>/__mocks__/lib-dynamodb.mjs',
}
```

**Mock pattern:** Import `mockSend` from `__mocks__/lib-dynamodb.mjs` directly in tests. Call `mockSend.mockReset()` in `afterEach` to prevent cross-test contamination.

**58 tests, 5 suites:** daily-challenge (4), save-score (18), leaderboard (14), played-today (11), rename-user (11).

### Layer 2: Bruno API Tests (`/tests/api/`)

Open the `tests/api/` folder in the Bruno desktop app. Switch to the `dev` environment. Set `DEV_TEST_TOKEN` env var for authenticated tests.

CLI: `bru run --env dev tests/api/`

### Layer 3: Playwright E2E (`/tests/e2e/`)

```bash
cd tests/e2e && npx playwright install chromium && npx playwright test
```

- `fixtures/auth.ts` — `injectGuestAuth(page)` injects localStorage state; `stubApiCalls(page)` intercepts all API routes
- `bowling-classic.spec.ts` — landing → game → results flow
- `trivia.spec.ts` — trivia intro → questions → results flow
- Set `BASE_URL` env var to point at dev or prod frontend

---

## Video Workflow

When adding new player videos:

1. **Convert `.mov` to `.mp4`** (if needed):
   ```bash
   ffmpeg -i player.mov -c:v libx264 -crf 23 -preset fast -c:a aac player.mp4
   ```

2. **Compress**:
   ```bash
   ffmpeg -i player.mp4 -c:v libx264 -crf 28 -preset fast -c:a aac -b:a 96k player_compressed.mp4
   ```

3. **Name the file** after the player's `id` field in `BATTERS`/`BOWLERS` array (e.g. `harbhajan.mp4`).

4. **Register in `index.html`**:
   - Add entry to `BATTERS` or `BOWLERS` array with `id`, `name`, `nation`, `era`, `style`, `clues`
   - Add `id` string to `VIDEO_BATTERS` or `VIDEO_BOWLERS` filter list

5. **Place in** `frontend/content/batting/` or `frontend/content/bowling/`

---

## Infrastructure (`/infrastructure/main.tf`)

Single Terraform file (~758 lines) defines all AWS resources: S3 bucket (private + CORS for avatar PUT), CloudFront distribution (OAC), API Gateway (HTTP API, 7 routes), 7 Lambda functions + IAM role, 2 DynamoDB tables, Cognito user pool. Region: `us-east-1`.

## CI/CD (`.github/workflows/`)

**`deploy.yml`** — triggers on push to `main`:
1. Run Jest unit tests (`tests/unit`) — deploy blocked on failure
2. Deploy all 7 Lambda functions via `aws lambda update-function-code`
3. Inject prod config placeholders into `frontend/index.html`
4. Sync `frontend/` to S3 (excluding `content/bowling/*` which is deployed separately)
5. Invalidate CloudFront cache

**`deploy-dev.yml`** — triggers on push to `dev`, same steps but uses `DEV_*` secrets and `-dev` Lambda suffixes.

---

## Design Patterns

- **Category-extensible** — All data keyed by `category`. New categories need only frontend data + video assets; zero infrastructure changes.
- **Deterministic daily challenge** — Date-based hash selects today's player; all users worldwide see the same one without shared state writes.
- **Score deduplication** — Leaderboard Lambda deduplicates on `userId` after querying GSI, keeping highest score per user per day.
- **UTC- timezone tolerance** — Client date accepted within `[yesterday_UTC, today_UTC]` window to avoid bleed-through at midnight for users behind UTC.
- **#summary record** — Authenticated users have a `userId + '#summary'` DynamoDB record tracking cumulative stats (totalScore, streak, wins, gamesPlayed, bestScore). The leaderboard all-time mode reads this as the source of truth instead of re-aggregating GSI results.
- **Guest path** — Unauthenticated requests require `userId` prefixed with `guest_` and `playerName` in the body. Guests appear on daily leaderboard but not all-time Hall of Fame.
