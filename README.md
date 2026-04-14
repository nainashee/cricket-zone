# 🏏 Howzat — Know Your Legends
### [playhowzat.com](https://playhowzat.com)

A cricket trivia game where players identify legendary bowlers from their silhouette bowling action. Built as a full-stack AWS cloud engineering portfolio project.

---

## 🎮 The Game

Guess the bowler from their silhouette video. Three game modes, 15 legends, one daily challenge shared worldwide.

| Mode | Bowlers | Rules |
|------|---------|-------|
| **Classic** | 10 | 5 guesses each, progressive clues unlock on each wrong answer |
| **Blitz** | 12 | 15 second timer per bowler, pure instinct |
| **Daily** | 1 | Same bowler for everyone, resets at midnight UTC |

### The Legends
Malinga · Bumrah · Warne · Muralitharan · Shoaib Akhtar · Wasim Akram · McGrath · Kumble · Starc · Steyn · Rabada · Boult · Anderson · Harbhajan · Waqar Younis

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
- **Category-extensible** — All data keyed by `category` parameter. Bowling is V1. Batting (V2) and Celebrations (V3) slot in with zero infrastructure changes.
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

**Authentication flow:**
- Email/password sign-up with mandatory email verification before first sign-in
- Google OAuth via Cognito federated identity (one click)
- Google profile picture shown automatically after sign-in
- Custom avatar upload to S3 (overrides Google picture if uploaded)
- Guest scores posted before sign-in are automatically migrated to the authenticated account
- On sign-in, backend is queried to sync played-today state across devices

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
│       ├── daily-challenge/       # GET /daily — returns today's bowler
│       ├── save-score/            # POST /score — saves game result to DynamoDB
│       ├── leaderboard/           # GET /leaderboard — daily top 20 + all-time Hall of Fame
│       ├── played-today/          # GET /played-today — checks if user played daily today
│       ├── avatar-upload/         # GET /avatar/upload-url — presigned S3 upload URL
│       └── delete-account/        # DELETE /account — removes Cognito user + scores
├── content/
│   ├── bowling/                   # Silhouette videos and data for bowlers
│   ├── batting/                   # Reserved for V2
│   └── celebrations/              # Reserved for V3
├── .github/
│   └── workflows/
│       └── deploy.yml             # CI/CD: S3 deploy + CloudFront invalidation
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
Returns today's bowler for the daily challenge.
```json
{ "category": "bowling", "date": "2026-04-13", "bowler": "harbhajan" }
```

### `POST /score`
Saves a completed game score. Authenticated requests use `Authorization: Bearer <id_token>` — userId is taken from the JWT. Unauthenticated requests require `userId` and `playerName` in the body.
```json
{
  "score": 1000,
  "gameMode": "daily",
  "category": "bowling",
  "pictureUrl": "https://lh3.googleusercontent.com/...",
  "streak": 3,
  "wins": 5,
  "gamesPlayed": 7
}
```

### `GET /leaderboard?category=bowling`
Returns today's top 20 scores, deduplicated by user (highest score per user kept). Guest scores excluded.

### `GET /leaderboard?category=bowling&alltime=true`
Returns the all-time Hall of Fame — top 20 players by cumulative total score. Each row includes `gamesPlayed`, `bestScore`, `streak`, `winRate`.

### `GET /played-today`
Requires `Authorization: Bearer <id_token>`. Checks if the authenticated user has already played today's daily challenge.
```json
{ "played": true }
```

### `GET /avatar/upload-url?contentType=image/jpeg`
Requires `Authorization: Bearer <id_token>`. Returns a presigned S3 URL for avatar upload.

### `DELETE /account`
Requires `Authorization: Bearer <id_token>`. Deletes the Cognito user account and all associated scores.

---

## 🚀 CI/CD Pipeline

Every push to `main` triggers a GitHub Actions workflow:

1. Syncs `frontend/` to S3 bucket
2. Creates a CloudFront invalidation (`/*`) to clear cache
3. Live at playhowzat.com within ~60 seconds

Requires GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `CF_DISTRIBUTION_ID`.

---

## 📍 Roadmap

- [x] **Phase 1** — Frontend game (Classic, Blitz, Daily modes)
- [x] **Phase 2** — AWS infrastructure (S3, CloudFront, DynamoDB, Lambda, IAM)
- [x] **Phase 3** — API Gateway + full backend integration
- [x] **Phase 4** — Video silhouettes, player names, leaderboard (top 20, Hall of Fame), score deduplication
- [x] **Phase 5** — User accounts (Cognito), Google Sign-In, email verification, avatar upload, guest score migration
- [x] **Phase 6** — Hall of Fame cumulative stats, cross-device played-today sync, player stats (streak, win rate, best score)
- [ ] **Phase 7 (V2)** — Guess the Batter category
- [ ] **Phase 8 (V3)** — Guess the Celebration category

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
*Live at [playhowzat.com](https://playhowzat.com) · [CHANGELOG](CHANGELOG.md) · v1.0.1*
