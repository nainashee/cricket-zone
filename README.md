# 🏏 Howzat — Know Your Legends
### [playhowzat.com](https://playhowzat.com)

A cricket trivia game where players identify legendary bowlers from their silhouette bowling action. Built as a full-stack AWS cloud engineering portfolio project.

---

## 🎮 The Game

Guess the bowler from their silhouette. Three game modes, 15 legends, one daily challenge shared worldwide.

| Mode | Bowlers | Rules |
|------|---------|-------|
| **Classic** | 10 | 4 guesses each, progressive clues unlock on each wrong answer |
| **Blitz** | 15 | 15 second timer per bowler, pure instinct |
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
│  howzat-scores                       │
│  └─ GSI: category-date-index         │
│  howzat-content                      │
└──────────────────────────────────────┘
```

### Services Used
- **S3** — Static frontend hosting with private bucket policy
- **CloudFront** — CDN with Origin Access Control (OAC), HTTPS, custom domain
- **ACM** — SSL/TLS certificate for playhowzat.com
- **API Gateway (HTTP API)** — Single REST endpoint, CORS configured for production domain
- **Lambda** — Three serverless functions on Node.js 20.x
- **DynamoDB** — Two tables with PAY_PER_REQUEST billing, GSI for leaderboard queries, TTL for score expiry
- **IAM** — Least-privilege role for Lambda with scoped DynamoDB + CloudWatch permissions
- **CloudWatch** — Lambda execution logging

### Design Principles
- **Category-extensible** — All data keyed by `category` parameter. Bowling is V1. Batting (V2) and Celebrations (V3) slot in with zero infrastructure changes.
- **Serverless** — No servers to manage. Scales to zero when idle, scales automatically under load.
- **Infrastructure as Code** — All AWS resources provisioned via Terraform with local state.
- **Automated deploys** — GitHub Actions pipeline: push to `main` → S3 sync → CloudFront cache invalidation.

---

## 🗂️ Project Structure

```
howzat/
├── frontend/
│   ├── index.html                 # Single-file frontend (HTML/CSS/JS)
│   └── content/
│       └── bowling/               # Static assets for bowling category
├── infrastructure/
│   ├── main.tf                    # All AWS infrastructure (Terraform)
│   ├── terraform.tfstate          # Terraform state files
│   └── terraform.tfstate.backup
├── backend/
│   └── functions/
│       ├── daily-challenge/       # GET /daily — returns today's bowler
│       │   ├── index.mjs
│       │   └── package.json
│       ├── save-score/            # POST /score — saves game result to DynamoDB
│       │   ├── index.mjs
│       │   └── package.json
│       └── leaderboard/           # GET /leaderboard — top 10 scores today
│           ├── index.mjs
│           └── package.json
├── content/
│   ├── batting/                   # Content for future batting category
│   ├── bowling/                   # Silhouette images and data for bowlers
│   └── celebrations/              # Content for future celebrations category
├── .github/
│   └── workflows/
│       └── deploy.yml             # CI/CD: S3 deploy + CloudFront invalidation
├── Cricket_Zone_Project_Roadmap.pdf  # Project roadmap document
├── .gitignore
└── README.md
```

---

## �️ Development

### Prerequisites
- Node.js 20.x (for Lambda functions)
- Terraform CLI (for infrastructure)
- AWS CLI configured with appropriate permissions

### Local Development
1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd howzat
   ```

2. **Install dependencies for backend functions**
   ```bash
   cd backend/functions/daily-challenge
   npm install
   cd ../save-score
   npm install
   cd ../leaderboard
   npm install
   ```

3. **Deploy infrastructure**
   ```bash
   cd ../../../infrastructure
   terraform init
   terraform plan
   terraform apply
   ```

4. **Deploy frontend**
   - The CI/CD pipeline automatically deploys on push to `main`
   - For manual deploy, sync `frontend/` to the S3 bucket

### Testing Lambda Functions Locally
Use AWS SAM CLI or invoke functions directly with test events.

---

## �🔌 API Reference

Base URL: `https://h3laal38ta.execute-api.us-east-1.amazonaws.com`

### `GET /daily?category=bowling`
Returns today's bowler for the daily challenge.
```json
{
  "category": "bowling",
  "date": "2026-04-08",
  "bowler": "harbhajan"
}
```

### `POST /score`
Saves a completed game score to DynamoDB.
```json
{
  "userId": "guest_mg8n4xp",
  "playerName": "guest_mg8n4xp",
  "score": 1000,
  "gameMode": "daily",
  "category": "bowling",
  "date": "2026-04-08"
}
```

### `GET /leaderboard?category=bowling`
Returns today's top 10 scores for the category.
```json
{
  "leaderboard": [
    {
      "userId": "guest_mg8n4xp",
      "playerName": "guest_mg8n4xp",
      "score": 1000,
      "gameMode": "daily",
      "category": "bowling",
      "date": "2026-04-08"
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

---

## 📍 Roadmap

- [x] **Phase 1** — Frontend game (Classic, Blitz, Daily modes)
- [x] **Phase 2** — AWS infrastructure (S3, CloudFront, DynamoDB, Lambda, IAM)
- [x] **Phase 3** — API Gateway + full backend integration
- [ ] **Phase 4** — Player names, leaderboard sorted by score, video silhouettes
- [ ] **Phase 5 (V2)** — Guess the Batter category
- [ ] **Phase 6 (V3)** — Guess the Celebration category

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (single file) |
| Hosting | AWS S3 + CloudFront |
| API | AWS API Gateway (HTTP API) |
| Backend | AWS Lambda (Node.js 20.x) |
| Database | AWS DynamoDB |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| DNS | Cloudflare |
| SSL | AWS ACM |

---

*Built by Hussain — AWS Solutions Architect Associate | Cloud Engineering Portfolio Project*
