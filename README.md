# 🏏 Howzat — Know Your Legends
### [playhowzat.com](https://playhowzat.com)

A cricket challenge platform where players identify legendary cricketers from silhouette videos and test their cricket knowledge in a rapid-fire trivia mode. Three daily challenges — Bowler, Batter, and Trivia — with multiple game modes. Built as a full-stack AWS cloud engineering portfolio project.

---

## 🎮 The Game

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

#### Bowling Legends (15 total, 3 with video)
Malinga · Bumrah · Warne · Muralitharan · Shoaib Akhtar · Wasim Akram · McGrath · Kumble · Starc · Steyn · Rabada · Boult · Anderson · Harbhajan · Waqar Younis

#### Batting Legends (3 with video)
Babar Azam · Sachin Tendulkar · Kevin Pietersen

### Cricket Trivia

Rapid-fire daily quiz. 3 questions, 20 seconds each, 20 points per correct answer (max 60/day). Questions drawn from a 360-question pool covering rules, records, history, and legends. Timer bar turns red in the final 6 seconds. Auto-advances on timeout — if you freeze, the round moves on without you.

---

## ☁️ AWS Architecture

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
  ┌────────┼──────────┬────────────┬──────────────┬─────────────┐
  ▼        ▼          ▼            ▼              ▼             ▼
GET      POST       GET          GET            GET          DELETE
/daily   /score   /leaderboard  /played-today  /avatar/    /account
                                               upload-url
  │        │          │            │              │             │
  └────────┴──────────┴────────────┴──────────────┴─────────────┘
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
│  Runtime: Node.js 20.x               │
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
- **CloudFront** — CDN with Origin Access Control, HTTPS, custom domain
- **ACM** — SSL/TLS certificate for playhowzat.com
- **API Gateway (HTTP API)** — Six routes, CORS configured for production domain
- **Lambda** — Six serverless functions on Node.js 20.x
- **DynamoDB** — Two tables with PAY_PER_REQUEST billing, GSI for leaderboard queries, TTL for 90-day score expiry
- **Cognito** — User pool with email/password auth and Google OAuth (federated sign-in), email verification enforced
- **IAM** — Least-privilege role for Lambda with scoped DynamoDB + CloudWatch permissions
- **CloudWatch** — Lambda execution logging

### Design Principles
- **Category-extensible** — All data keyed by `category` parameter. Bowling is V1. Batting (V2), Trivia (V3), and Celebrations (V4) slot in with zero infrastructure changes.
- **Serverless** — No servers to manage. Scales to zero when idle, scales automatically under load.
- **Infrastructure as Code** — All AWS resources provisioned via Terraform with local state.
- **Automated deploys** — GitHub Actions pipeline: push to `main` → S3 sync → CloudFront cache invalidation.

---

## 👤 User Accounts

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
- On sign-in, backend is queried to sync both bowling and batting played-today state across devices

---

## 📊 Leaderboard

**Today's Top 5** — shown on the landing page with four tabs:
- **Bowl** — highest bowling score per player today
- **Bat** — highest batting score per player today
- **Trivia** — highest trivia score per player today
- **Total** — combined bowling + batting + trivia score per player today; breakdown shows `🏏 / 🏃 / 🧠` contributions

**Hall of Fame** — all-time rankings by cumulative total score across all game types. Each entry shows games played, best single score, current streak, and win rate.

**Streak** — increments once per calendar day when the player wins (scores > 0). Playing multiple games in the same day does not multiply the streak. Missing a day resets it to 0.

---

## 🗂️ Project Structure

```
cricket-zone/
├── frontend/
│   ├── index.html                 # Single-file SPA (HTML/CSS/JS, ~64KB)
│   ├── favicon.ico
│   ├── favicon-96x96.png
│   ├── favicon.svg
│   ├── apple-touch-icon.png
│   ├── web-app-manifest-192x192.png
│   ├── web-app-manifest-512x512.png
│   └── site.webmanifest           # PWA manifest (name, theme colour, icons)
├── infrastructure/
│   ├── main.tf                    # All AWS infrastructure (Terraform)
│   ├── terraform.tfstate
│   └── terraform.tfstate.backup
├── backend/
│   └── functions/
│       ├── daily-challenge/       # GET /daily — returns today's player for a category
│       ├── save-score/            # POST /score — saves game result to DynamoDB
│       ├── leaderboard/           # GET /leaderboard — daily top 20 + all-time Hall of Fame
│       ├── played-today/          # GET /played-today — checks bowling + batting played state
│       ├── avatar-upload/         # GET /avatar/upload-url — presigned S3 upload URL
│       └── delete-account/        # DELETE /account — removes Cognito user + scores
├── content/
│   ├── bowling/                   # Silhouette videos for bowlers
│   ├── batting/                   # Silhouette videos for batters
│   └── celebrations/              # Reserved for V3
├── .github/
│   └── workflows/
│       └── deploy.yml             # CI/CD: Lambda deploys + S3 sync + CloudFront invalidation
├── CHANGELOG.md
├── CLAUDE.md
├── .gitignore
└── README.md
```

---

## 🛠️ Development

### Prerequisites
- Node.js 20.x (for Lambda functions)
- Terraform CLI (for infrastructure)
- AWS CLI configured with profile `cricket-zone`

### Local Development
1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd cricket-zone
   ```

2. **Install dependencies for backend functions**
   ```bash
   cd backend/functions/daily-challenge && npm install
   cd ../save-score && npm install
   cd ../leaderboard && npm install
   cd ../played-today && npm install
   cd ../avatar-upload && npm install
   cd ../delete-account && npm install
   ```

3. **Deploy infrastructure**
   ```bash
   cd infrastructure
   terraform init
   terraform plan
   terraform apply
   ```

4. **Deploy frontend**
   - The CI/CD pipeline automatically deploys on push to `main`
   - Manual deploy: `aws s3 sync frontend/ s3://cricket-zone-frontend-hussain/ --delete`

5. **Deploy a Lambda manually**
   ```bash
   cd backend/functions/<function-name>
   zip -r function.zip .
   aws lambda update-function-code \
     --function-name cricket-zone-<function-name> \
     --zip-file fileb://function.zip \
     --profile cricket-zone --region us-east-1
   ```

---

## 🔌 API Reference

Base URL: `https://h3laal38ta.execute-api.us-east-1.amazonaws.com`

### `GET /daily?category=bowling`
Returns today's player for the given category (bowling or batting).
```json
{ "category": "bowling", "date": "2026-04-15", "bowler": "harbhajan" }
```

### `POST /score`
Saves a completed game score. Authenticated requests use `Authorization: Bearer <id_token>` — userId is taken from the JWT. Unauthenticated requests require `userId` and `playerName` in the body.
```json
{
  "score": 100,
  "gameMode": "daily",
  "category": "bowling",
  "pictureUrl": "https://lh3.googleusercontent.com/..."
}
```

### `GET /leaderboard?category=bowling`
Returns today's top 20 scores, deduplicated by user (highest score per user kept).

### `GET /leaderboard?category=bowling&alltime=true`
Returns the all-time Hall of Fame — top 20 players by cumulative total score. Each row includes `gamesPlayed`, `bestScore`, `streak`, `winRate`.

### `GET /played-today`
Requires `Authorization: Bearer <id_token>`. Checks if the authenticated user has already played today's daily challenge for both categories.
```json
{ "played": true, "bowlingPlayed": true, "battingPlayed": false }
```

### `GET /avatar/upload-url?contentType=image/jpeg`
Requires `Authorization: Bearer <id_token>`. Returns a presigned S3 URL for avatar upload.

### `DELETE /account`
Requires `Authorization: Bearer <id_token>`. Deletes the Cognito user account and all associated scores.

---

## 🚀 CI/CD Pipeline

Every push to `main` triggers a GitHub Actions workflow:

1. Deploys all six Lambda functions via `aws lambda update-function-code`
2. Injects production config (API URL, Cognito IDs) into `frontend/index.html` via `sed`
3. Syncs `frontend/` to S3 bucket
4. Creates a CloudFront invalidation (`/*`) to clear cache
5. Live at playhowzat.com within ~60 seconds

Requires GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `CF_DISTRIBUTION_ID`, `PROD_API_URL`, `PROD_COGNITO_USER_POOL_ID`, `PROD_COGNITO_CLIENT_ID`, `PROD_COGNITO_DOMAIN`.

---

## 📍 Roadmap

- [x] **Phase 1** — Frontend game (Classic, Blitz, Daily modes)
- [x] **Phase 2** — AWS infrastructure (S3, CloudFront, DynamoDB, Lambda, IAM)
- [x] **Phase 3** — API Gateway + full backend integration
- [x] **Phase 4** — Video silhouettes, player names, leaderboard (top 20, Hall of Fame), score deduplication
- [x] **Phase 5** — User accounts (Cognito), Google Sign-In, email verification, avatar upload, guest score migration
- [x] **Phase 6** — Hall of Fame cumulative stats, cross-device played-today sync, player stats (streak, win rate, best score)
- [x] **Phase 7 (V2)** — Guess the Batter category (independent daily seed, dual leaderboard tabs, 277-name autocomplete)
- [x] **Phase 8 (V3)** — Cricket Trivia mode (360-question pool, 20s rapid-fire timer, daily 3-question limit, answer feedback animations, trivia leaderboard tab, play-next suggestions)
- [ ] **Phase 9 (V4)** — Guess the Celebration category

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (single file) |
| Hosting | AWS S3 + CloudFront |
| Auth | AWS Cognito + Google OAuth |
| API | AWS API Gateway (HTTP API) |
| Backend | AWS Lambda (Node.js 20.x) |
| Database | AWS DynamoDB |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| DNS | Cloudflare |
| SSL | AWS ACM |

---

*Built by Hussain Ashfaque — AWS Solutions Architect Associate | Cloud Engineering Portfolio Project*
*Live at [playhowzat.com](https://playhowzat.com) · [CHANGELOG](CHANGELOG.md) · v1.3.0*
