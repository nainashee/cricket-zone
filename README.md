# Howzat — Know Your Legends
### [playhowzat.com](https://playhowzat.com)

A cricket challenge platform where players identify legendary cricketers from silhouette videos and test their cricket knowledge in a rapid-fire trivia mode. Three daily challenges — Bowler, Batter, and Trivia — with multiple game modes. Built as a full-stack AWS cloud engineering portfolio project.

---

## The Game

Three daily challenges — one resets at midnight, they're all gone for the day once played.

### Silhouette Challenges (Bowling + Batting)

Guess the cricketer from their silhouette video. Three game modes, autocomplete from 300+ legend names.

| Mode | Players | Rules |
|------|---------|-------|
| **Classic** | 3 per category | 5 guesses each, progressive clues unlock on each wrong answer |
| **Blitz** | 3 per category | 15 second timer per player, pure instinct |
| **Daily** | 1 per category | Same player for everyone worldwide, resets at midnight UTC |

#### Scoring

| Guess | Bowling | Batting |
|-------|---------|---------|
| 1st correct | 100 pts | 200 pts |
| 2nd correct | 75 pts | 150 pts |
| 3rd correct | 50 pts | 100 pts |
| 4th correct | 25 pts | 50 pts |
| 5th correct | 15 pts | 25 pts |

#### Bowling Legends (15 total, 4 with video)
Malinga · Bumrah · Warne · Muralitharan · Shoaib Akhtar · Wasim Akram · McGrath · Kumble · Starc · Steyn · Rabada · **Boult** · **Anderson** · **Harbhajan Singh** · Waqar Younis

Video clips: Akhtar · Anderson · Boult · Harbhajan Singh

#### Batting Legends (6 with video)
**Babar Azam** · **Sachin Tendulkar** · **Kevin Pietersen** · **Brian Lara** · **Saeed Anwar** · **Don Bradman**

### Cricket Trivia

Rapid-fire daily quiz. 5 questions, 20 seconds each, 20 points per correct answer (max 100/day). Questions drawn from a 360-question pool covering rules, records, history, and legends. Questions are selected via a seeded Fisher-Yates shuffle keyed to the date — every player worldwide gets the same 5 questions each day, distributed across the full pool. Timer bar turns red in the final 6 seconds. Auto-advances on timeout.

---

## AWS Architecture

```
Browser (playhowzat.com)
        │
        ▼
┌─────────────────┐
│   CloudFront    │  CDN + HTTPS + custom domain
│  Distribution   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    S3 Bucket    │  Static frontend hosting (private, OAC)
│  (index.html)   │  + user avatar storage
└─────────────────┘

Browser → API Gateway → Lambda → DynamoDB

┌──────────────────────────────────┐
│     API Gateway (HTTP API)       │  CORS enabled for playhowzat.com
│  h3laal38ta.execute-api          │
└──────────┬───────────────────────┘
           │
  ┌────────┼──────────┬────────────┬──────────────┬─────────────┬──────────┐
  ▼        ▼          ▼            ▼              ▼             ▼          ▼
GET      POST       GET          GET            GET          DELETE     POST
/daily   /score   /leaderboard  /played-today  /avatar/    /account   /rename
                                               upload-url
  │        │          │            │              │             │          │
  └────────┴──────────┴────────────┴──────────────┴─────────────┴──────────┘
                               │
                               ▼
┌──────────────────────────────────────┐
│           Lambda Functions           │
│  cricket-zone-daily-challenge        │
│  cricket-zone-save-score             │
│  cricket-zone-leaderboard            │
│  cricket-zone-played-today           │
│  cricket-zone-avatar-upload          │
│  cricket-zone-delete-account         │
│  cricket-zone-rename-user            │
│  Runtime: Node.js 20.x (ESM)         │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│              DynamoDB                │
│  cricket-zone-scores                 │
│  └─ GSI: category-date-index         │
│  cricket-zone-content                │
└──────────────────────────────────────┘
```

### Services Used
- **S3** — Static frontend hosting (private bucket, OAC) + user avatar storage
- **CloudFront** — CDN with Origin Access Control, HTTPS, custom domain; per-asset TTLs: `no-cache` for `index.html`, 1-hour for JSON assets, 1-year immutable for videos, 1-week for static root files
- **ACM** — SSL/TLS certificate for playhowzat.com
- **API Gateway (HTTP API)** — Seven routes, CORS configured for production domain; throttled at 100 req/s (stage default) with a tighter 20 req/s override on `POST /score`
- **Lambda** — Seven serverless functions on Node.js 20.x
- **DynamoDB** — Two tables with PAY_PER_REQUEST billing, GSI for leaderboard queries, TTL for 90-day score expiry
- **Cognito** — User pool with email/password auth and Google OAuth (federated sign-in), email verification enforced
- **IAM** — Least-privilege role for Lambda with scoped DynamoDB + CloudWatch permissions
- **CloudWatch** — 10 alarms (Lambda errors × 7, API GW 4xx/5xx, CloudFront 5xx), SNS email alerts, and an operational dashboard with health snapshot, Lambda, API Gateway, and CloudFront panels

### Design Principles
- **Category-extensible** — All data keyed by `category` parameter. Bowling is V1. Batting (V2), Trivia (V3), and Celebrations (V4) slot in with zero infrastructure changes.
- **Serverless** — No servers to manage. Scales to zero when idle, scales automatically under load.
- **Infrastructure as Code** — All AWS resources provisioned via Terraform with local state.
- **Automated deploys** — GitHub Actions pipeline: unit tests must pass → Lambda deploys → S3 sync → CloudFront cache invalidation.

---

## User Accounts

Players can play as a guest or create a free account.

| Feature | Guest | Signed In |
|---------|-------|-----------|
| Play all game modes | ✅ | ✅ |
| Save scores to leaderboard | ✅ | ✅ |
| Appear on Hall of Fame | ❌ | ✅ |
| Custom display name | ✅ | ✅ |
| Profile photo | ❌ | ✅ |
| Upload custom avatar | ❌ | ✅ |
| Google Sign-In | ❌ | ✅ |
| Cross-device played-today sync | ❌ | ✅ |
| Daily streak tracking | ❌ | ✅ |

**Authentication flow:**
- Email/password sign-up with mandatory email verification before first sign-in
- Google OAuth via Cognito federated identity (one click)
- Google profile picture shown automatically after sign-in
- Custom avatar upload to S3 (overrides Google picture if uploaded)
- Guest scores posted before sign-in are automatically migrated to the authenticated account
- On sign-in, backend is queried to sync bowling, batting, and trivia played-today state across devices

---

## Leaderboard

**Today's Top 5** — shown on the landing page with four tabs:
- **Bowl** — highest bowling score per player today
- **Bat** — highest batting score per player today
- **Trivia** — highest trivia score per player today
- **Total** — combined bowling + batting + trivia score per player today

**Hall of Fame** — all-time rankings by cumulative total score across all game types. Each entry shows games played, best single score, current streak, and win rate.

**Streak** — increments once per calendar day when the player wins (scores > 0). Playing multiple games in the same day does not multiply the streak. Missing a day resets it to 0.

---

## Project Structure

```
cricket-zone/
├── frontend/
│   ├── index.html                 # Single-file SPA (HTML/CSS/JS)
│   ├── assets/
│   │   ├── batters.json           # Full batting legends list
│   │   ├── bowlers.json           # Full bowling legends list
│   │   └── trivia.json            # 360-question trivia pool
│   └── content/
│       ├── batting/               # Silhouette MP4s: anwar, azam, bradman, lara, pietersen, tendulkar
│       └── bowling/               # Silhouette MP4s: akhtar, anderson, boult, harbhajan
├── backend/
│   └── functions/
│       ├── daily-challenge/       # GET /daily
│       ├── save-score/            # POST /score
│       ├── leaderboard/           # GET /leaderboard
│       ├── played-today/          # GET /played-today
│       ├── avatar-upload/         # GET /avatar/upload-url
│       ├── delete-account/        # DELETE /account
│       └── rename-user/           # POST /rename
├── tests/
│   ├── unit/                      # Layer 1: Jest (58 tests)
│   │   ├── jest.config.mjs
│   │   ├── __mocks__/             # AWS SDK mock factory
│   │   └── *.test.mjs
│   ├── api/                       # Layer 2: Bruno API collection
│   │   ├── bruno.json
│   │   ├── environments/          # dev.bru, prod.bru
│   │   └── */                     # Request files per endpoint
│   └── e2e/                       # Layer 3: Playwright
│       ├── playwright.config.ts
│       ├── fixtures/auth.ts       # localStorage injection + API stubs
│       └── *.spec.ts
├── infrastructure/
│   └── main.tf                    # All AWS infrastructure (Terraform)
├── .github/
│   └── workflows/
│       ├── deploy.yml             # CI/CD: test → Lambda deploy → S3 → CloudFront
│       └── deploy-dev.yml         # Dev environment pipeline
├── package.json                   # Root scripts (test:unit, test:api, test:e2e)
├── CHANGELOG.md
├── CLAUDE.md
└── README.md
```

---

## Testing

The project has a 3-layer testing pyramid.

### Layer 1: Jest — Unit Tests

Tests Lambda business logic in isolation with all AWS SDK calls mocked.

```bash
cd tests/unit
npm install
node --experimental-vm-modules node_modules/jest/bin/jest.js
```

**58 tests across 5 suites:**

| Suite | Tests |
|-------|-------|
| `daily-challenge` | Bowler selection determinism, invalid category |
| `save-score` | Guest/auth paths, streak logic, date validation, triviaScore clamping |
| `leaderboard` | Deduplication, guest filtering, all-time mode, `?me=true` auth |
| `played-today` | Auth, three category flags, date boundary logic |
| `rename-user` | Name validation, profanity filter, batch record updates |

### Layer 2: Bruno — API Tests

Integration tests against live endpoints. Open `tests/api/` in the Bruno desktop app, or run via CLI:

```bash
npm install -g @usebruno/cli
bru run --env dev tests/api/
```

Set `DEV_TEST_TOKEN` environment variable for authenticated endpoint tests.

### Layer 3: Playwright — E2E Tests

Full browser automation against the deployed frontend. API calls are stubbed via `page.route()` for deterministic results.

```bash
cd tests/e2e
npm install
npx playwright install chromium
npx playwright test
```

---

## Development

### Prerequisites
- Node.js 20.x
- Terraform CLI
- AWS CLI configured with profile `cricket-zone`

### Local Development

```bash
git clone <repository-url>
cd cricket-zone

# Install Lambda dependencies
for f in save-score leaderboard played-today avatar-upload delete-account rename-user; do
  cd backend/functions/$f && npm install && cd ../../..
done

# Run unit tests
cd tests/unit && npm install && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

### Deploy Infrastructure
```bash
cd infrastructure && terraform init && terraform apply
```

### Deploy a Lambda Manually
```bash
cd backend/functions/<function-name>
zip -r function.zip .
aws lambda update-function-code \
  --function-name cricket-zone-<function-name> \
  --zip-file fileb://function.zip \
  --profile cricket-zone --region us-east-1
```

---

## API Reference

Base URL: `https://h3laal38ta.execute-api.us-east-1.amazonaws.com`

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/daily?category=bowling` | None | Today's featured player |
| POST | `/score` | Optional Bearer | Save game score |
| GET | `/leaderboard?category=&date=&alltime=&me=` | Optional Bearer | Daily / all-time leaderboard |
| GET | `/played-today?date=` | Required Bearer | Check played state for all categories |
| GET | `/avatar/upload-url?contentType=` | Required Bearer | Presigned S3 upload URL |
| DELETE | `/account` | Required Bearer | Delete account + all scores |
| POST | `/rename` | Required Bearer | Update display name |

---

## CI/CD Pipeline

Every push to `main` triggers GitHub Actions:

1. **Unit tests** — 58 Jest tests must pass (deploy blocked if any fail)
2. **Lambda deploys** — all seven functions updated via `aws lambda update-function-code`
3. **Config injection** — API URL and Cognito IDs injected into `frontend/index.html` via `sed`
4. **S3 sync** — four targeted upload commands with per-asset `Cache-Control` headers:
   - `index.html` → `no-cache` (injected prod config must always revalidate)
   - `assets/*.json` → `public, max-age=3600` (invalidated by CloudFront `/*` invalidation on each deploy)
   - `content/batting/` → `public, max-age=31536000, immutable` (large video files that never change)
   - Root icons / PWA manifest → `public, max-age=604800`
5. **CloudFront invalidation** — `/*` invalidation; live at playhowzat.com within ~60 seconds

Required GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `CF_DISTRIBUTION_ID`, `PROD_API_URL`, `PROD_COGNITO_USER_POOL_ID`, `PROD_COGNITO_CLIENT_ID`, `PROD_COGNITO_DOMAIN`.

---

## Monitoring & Observability

All monitoring is provisioned via Terraform (`infrastructure/main.tf`) and is fully version-controlled. No manual console configuration.

### Alert Delivery — SNS

An SNS topic (`cricket-zone-alerts`) routes all alarm state changes to `nain.ashee@gmail.com`. Every alarm sends both `ALARM` (fires) and `OK` (recovers) notifications so recoveries are visible without logging into the console.

### CloudWatch Alarms — 10 Total

All alarms use a 5-minute evaluation window and `treat_missing_data = notBreaching` to avoid false positives during quiet periods.

#### Lambda — 7 Alarms (one per function)

| Alarm | Metric | Threshold | Fires when… |
|---|---|---|---|
| `cricket-zone-save-score-errors` | `Errors` Sum | > 0 | Any save-score crash |
| `cricket-zone-leaderboard-errors` | `Errors` Sum | > 0 | Any leaderboard crash |
| `cricket-zone-daily-challenge-errors` | `Errors` Sum | > 0 | Any daily-challenge crash |
| `cricket-zone-played-today-errors` | `Errors` Sum | > 0 | Any played-today crash |
| `cricket-zone-avatar-upload-errors` | `Errors` Sum | > 0 | Any avatar-upload crash |
| `cricket-zone-delete-account-errors` | `Errors` Sum | > 0 | Any delete-account crash |
| `cricket-zone-rename-user-errors` | `Errors` Sum | > 0 | Any rename-user crash |

Threshold is `> 0` because any Lambda error in production warrants attention — there is no expected error rate.

#### API Gateway — 2 Alarms

| Alarm | Metric | Threshold | Fires when… |
|---|---|---|---|
| `cricket-zone-apigw-5xx` | `5XXError` Sum | > 5 / 5 min | Server errors (Lambda crashes, timeouts, misconfiguration) |
| `cricket-zone-apigw-4xx` | `4XXError` Sum | > 50 / 5 min | Abnormal client error volume — abuse burst or broken client |

The 4xx threshold is set at 50 rather than 0 because a small rate of 400 responses is normal (validation rejections from legitimate clients). The 5xx threshold is set at 5 to absorb isolated cold-start timeouts without paging.

#### CloudFront — 1 Alarm

| Alarm | Metric | Threshold | Fires when… |
|---|---|---|---|
| `cricket-zone-cloudfront-5xx` | `5xxErrorRate` Average | > 5% | S3 origin unreachable or distribution misconfigured |

### CloudWatch Dashboard — `cricket-zone`

A single dashboard provides the full operational picture in one view. Layout is top-to-bottom by urgency: critical state first, drill-down detail below.

```
┌──────────────────────────────────────────────────────────────────┐
│  ROW 1 — Health Snapshot                          (full width)   │
│  All 10 alarms as colored status boxes                           │
│  Green = OK · Red = ALARM · Grey = no data yet                   │
└──────────────────────────────────────────────────────────────────┘
┌─────────────────────────────┬────────────────────────────────────┐
│  ROW 2 — Lambda             │                                    │
│  Left: Errors (all 7 fns)   │  Right: Duration p95 (all 7 fns)  │
│  Which function is failing? │  Cold starts / DynamoDB timeouts?  │
└─────────────────────────────┴────────────────────────────────────┘
┌──────────────────┬──────────────────┬──────────────────────────┐
│  ROW 3 — API GW  │                  │                          │
│  4xx Errors      │  5xx Errors      │  Latency p95             │
│  (alarm line 50) │  (alarm line 5)  │                          │
└──────────────────┴──────────────────┴──────────────────────────┘
┌──────────────────┬──────────────────┬──────────────────────────┐
│  ROW 4 — CF      │                  │                          │
│  5xx Error Rate  │  Cache Hit Rate  │  Requests                │
│  (alarm line 5%) │  (validate TTLs) │  (traffic baseline)      │
└──────────────────┴──────────────────┴──────────────────────────┘
```

**Why each panel exists:**

- **Health Snapshot** — one glance answers "is anything broken right now?" without reading a single graph
- **Lambda Errors** — pinpoints which function is failing; p95 duration catches DynamoDB slowdowns and cold-start spikes before they breach timeouts
- **API Gateway 4xx/5xx** — alarm threshold lines are drawn directly on the graphs, so you can see how close a metric is to firing without opening alarm config; latency p95 is the end-to-end request time from the client's perspective
- **CloudFront Cache Hit Rate** — directly validates that the caching work (fixed TTLs, `/content/*` behavior) is actually taking effect; a rate near 0% means every request is hitting S3 and CloudFront is doing nothing useful; a rate of 80–95% confirms the CDN is serving the load

### How to Access

- **Console:** AWS Console → CloudWatch → Dashboards → `cricket-zone`
- **Alarms:** AWS Console → CloudWatch → Alarms → filter `cricket-zone`
- **Direct link:** `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=cricket-zone`

---

## Roadmap

- [x] **Phase 1** — Frontend game (Classic, Blitz, Daily modes)
- [x] **Phase 2** — AWS infrastructure (S3, CloudFront, DynamoDB, Lambda, IAM)
- [x] **Phase 3** — API Gateway + full backend integration
- [x] **Phase 4** — Video silhouettes, leaderboard (top 20, Hall of Fame), score deduplication
- [x] **Phase 5** — User accounts (Cognito), Google Sign-In, avatar upload, guest score migration
- [x] **Phase 6** — Hall of Fame cumulative stats, cross-device sync, streak + win rate
- [x] **Phase 7 (V2)** — Guess the Batter (independent daily seed, dual leaderboard, 6 video batters)
- [x] **Phase 8 (V3)** — Cricket Trivia (360-question pool, seeded shuffle, daily 5-question limit)
- [x] **Phase 9** — 3-layer testing pyramid (Jest 58 tests, Bruno API collection, Playwright E2E)
- [x] **Phase 10** — Infrastructure hardening: API Gateway throttling, CloudFront caching fixed, per-asset Cache-Control headers, strict Lambda input validation, CloudWatch alarms + dashboard
- [ ] **Phase 11 (V4)** — Guess the Celebration category

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (single file) |
| Hosting | AWS S3 (static assets + avatar storage) + CloudFront (CDN, OAC) |
| Auth | AWS Cognito + Google OAuth |
| API | AWS API Gateway (HTTP API) |
| Backend | AWS Lambda (Node.js 20.x ESM) |
| Database | AWS DynamoDB |
| Monitoring | AWS CloudWatch (alarms + dashboard) + SNS (email alerts) |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| Unit Tests | Jest (ESM, `--experimental-vm-modules`) |
| API Tests | Bruno |
| E2E Tests | Playwright |
| Video Processing | ffmpeg (H.264, CRF 28, 720×720, compressed to 400–1500 KiB) |
| DNS | Cloudflare |
| SSL | AWS ACM |

---

*Built by Hussain Ashfaque — AWS Solutions Architect Associate | Cloud Engineering Portfolio Project*
*Live at [playhowzat.com](https://playhowzat.com) · [CHANGELOG](CHANGELOG.md) · v1.5.0*
