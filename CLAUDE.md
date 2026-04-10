# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Howzat — Know Your Legends** is a serverless cricket trivia game where players identify legendary bowlers from silhouette videos. Deployed at playhowzat.com. Built as an AWS cloud engineering portfolio project.

## Commands

### Backend Lambda Functions

There is no root `package.json`. Each Lambda function has its own:

```bash
# Install dependencies (must be done per-function)
cd backend/functions/daily-challenge && npm install
cd backend/functions/save-score && npm install
cd backend/functions/leaderboard && npm install
```

No build, lint, or test scripts are configured — tests are stubbed.

### Infrastructure

```bash
cd infrastructure
terraform init
terraform plan
terraform apply
```

Requires AWS CLI profile `cricket-zone` configured locally.

### Frontend Deployment

Push to `main` triggers GitHub Actions (auto sync to S3 + CloudFront invalidation).

Manual deploy:
```bash
aws s3 sync frontend/ s3://cricket-zone-frontend-hussain/ --delete
```

## Architecture

```
Browser → CloudFront (playhowzat.com) → S3 (frontend/index.html)
                                                    ↕ API calls
                                        API Gateway (HTTP API)
                                        ├── GET  /daily      → Lambda: daily-challenge
                                        ├── POST /score      → Lambda: save-score
                                        └── GET  /leaderboard→ Lambda: leaderboard
                                                    ↕
                                              DynamoDB
                                        ├── cricket-zone-scores
                                        └── cricket-zone-content
```

### Frontend (`/frontend/index.html`)

A single-file SPA (~64KB) — all HTML, CSS, and JavaScript in one file. No framework, no bundler.

- **5 screens**: `#landingScreen`, `#categoryScreen`, `#gameScreen`, `#resultScreen`, `#finalScreen`
- **Global state object `G`**: holds all runtime game state
- **`BOWLERS` array**: 15 bowlers hardcoded; `VIDEO_BOWLERS` filters to the 12 with video clips
- **localStorage keys**: `cz3` (stats), `cz_uid` (user ID), `cz_name` (player name)
- **3 game modes**: Classic (10 bowlers, 5 guesses each), Blitz (all bowlers, 15s timer), Daily (1 bowler, shared across all players)
- All game data (bowler names, nations, eras, clues) is hardcoded in the frontend — no content API calls

### Backend (`/backend/functions/`)

Three independent Lambda functions (Node.js 20.x ESM modules — `.mjs`):

| Function | Route | Purpose |
|---|---|---|
| `daily-challenge` | `GET /daily?category=bowling` | Returns today's bowler using a date-based hash |
| `save-score` | `POST /score` | Writes score to DynamoDB with 90-day TTL |
| `leaderboard` | `GET /leaderboard?category=bowling` | Queries GSI, deduplicates by user, returns top 20 |

API base: `https://h3laal38ta.execute-api.us-east-1.amazonaws.com`

### DynamoDB Schema

**`cricket-zone-scores`**
- Primary key: `userId` (hash) + `scoreId` (range, format: `category#date#uuid`)
- GSI: `category` (hash) + `date` (range) — used by leaderboard queries
- TTL attribute: `ttl` (Unix timestamp, 90-day expiry)
- Billing: PAY_PER_REQUEST

**`cricket-zone-content`**
- Primary key: `category` (hash) + `itemId` (range)
- Currently unused; reserved for future dynamic content

### Infrastructure (`/infrastructure/main.tf`)

Single Terraform file defines all AWS resources: S3 bucket, CloudFront distribution (with OAC), API Gateway (HTTP API), Lambda functions + IAM role, DynamoDB tables. Region: `us-east-1`.

### CI/CD (`.github/workflows/deploy.yml`)

Triggers on push to `main`. Requires GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET`, `CF_DISTRIBUTION_ID`.

## Design Patterns

- **Category-extensible**: All data is keyed by a `category` parameter (`"bowling"` currently). Adding a new category (batting, fielding) requires only new frontend data and video assets — zero infrastructure changes.
- **Deterministic daily challenge**: The daily bowler is selected by hashing the current date, so all players worldwide see the same bowler each day without any shared state writes.
- **Score deduplication**: The leaderboard Lambda deduplicates on `userId` client-side after querying the GSI, keeping only the highest score per user per day.
