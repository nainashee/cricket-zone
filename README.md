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
│  (index.html)   │
└─────────────────┘

Browser → API Gateway → Lambda → DynamoDB

┌──────────────────────────┐
│   API Gateway (HTTP API) │  Single endpoint, CORS enabled
│  h3laal38ta.execute-api  │  for playhowzat.com
└──────────┬───────────────┘
           │
    ┌──────┼──────┐
    ▼      ▼      ▼
┌───────┐ ┌──────────┐ ┌────────────┐
│ GET   │ │ POST     │ │ GET        │
│/daily │ │/score    │ │/leaderboard│
└───┬───┘ └────┬─────┘ └─────┬──────┘
    │          │              │
    ▼          ▼              ▼
┌──────────────────────────────────────┐
│           Lambda Functions           │
│  howzat-daily-challenge              │
│  howzat-save-score                   │
│  howzat-leaderboard                  │
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
- **API Gateway (HTTP API)** — Single REST endpoint, CORS configured for production domain
- **Lambda** — Three serverless functions on Node.js 20.x
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
| Appear on Hall of Fame | ✅ | ✅ |
| Custom display name | ✅ | ✅ |
| Profile photo | ❌ | ✅ |
| Upload custom avatar | ❌ | ✅ |
| Google Sign-In | ❌ | ✅ |

**Authentication flow:**
- Email/password sign-up with mandatory email verification before first sign-in
- Google OAuth via Cognito federated identity (one click)
- Google profile picture shown automatically after sign-in
- Custom avatar upload to S3 (overrides Google picture if uploaded)
- Guest scores posted before sign-in are automatically migrated to the authenticated account

---

## 🗂️ Project Structure

```
cricket-zone/
├── frontend/
│   └── index.html                 # Single-file SPA (HTML/CSS/JS, ~64KB)
├── infrastructure/
│   ├── main.tf                    # All AWS infrastructure (Terraform)
│   ├── terraform.tfstate
│   └── terraform.tfstate.backup
├── backend/
│   └── functions/
│       ├── daily-challenge/       # GET /daily — returns today's bowler
│       │   ├── index.mjs
│       │   └── package.json
│       ├── save-score/            # POST /score — saves game result to DynamoDB
│       │   ├── index.mjs
│       │   └── package.json
│       └── leaderboard/           # GET /leaderboard — top 20 scores
│           ├── index.mjs
│           └── package.json
├── content/
│   ├── bowling/                   # Silhouette videos and data for bowlers
│   ├── batting/                   # Reserved for V2
│   └── celebrations/              # Reserved for V3
├── .github/
│   └── workflows/
│       └── deploy.yml             # CI/CD: S3 deploy + CloudFront invalidation
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

---

## 🔌 API Reference

Base URL: `https://h3laal38ta.execute-api.us-east-1.amazonaws.com`

### `GET /daily?category=bowling`
Returns today's bowler for the daily challenge.
```json
{
  "category": "bowling",
  "date": "2026-04-12",
  "bowler": "harbhajan"
}
```

### `POST /score`
Saves a completed game score to DynamoDB. Accepts an optional `Authorization: Bearer <id_token>` header — authenticated scores are attributed to the Cognito user sub; unauthenticated scores use a guest UUID.
```json
{
  "userId": "guest_mg8n4xp",
  "playerName": "Hussain",
  "score": 1000,
  "gameMode": "daily",
  "category": "bowling"
}
```

### `GET /leaderboard?category=bowling`
Returns today's top 20 scores, deduplicated by user (highest score per user kept).
```json
{
  "leaderboard": [
    {
      "userId": "abc-cognito-sub",
      "playerName": "Hussain",
      "score": 1000,
      "gameMode": "daily",
      "category": "bowling",
      "date": "2026-04-12"
    }
  ]
}
```

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
- [ ] **Phase 6 (V2)** — Guess the Batter category
- [ ] **Phase 7 (V3)** — Guess the Celebration category

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

*Built by Hussain — AWS Solutions Architect Associate | Cloud Engineering Portfolio Project*
