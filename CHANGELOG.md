# Changelog

All notable changes to Howzat — Know Your Legends are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.3.0] - 2026-04-16

### Added

- **Cricket Trivia mode** — fourth game card on the landing page; 3 questions per day drawn from a 360-question pool covering rules, records, history, and legends
- **Rapid-fire timer** — 20-second countdown bar per question; if time expires the round auto-advances and marks the question as "Time's up"
- **Answer feedback** — correct answers trigger a green bounce animation and a floating `+20 pts` badge; wrong answers trigger a red shake, reveal the correct option in green, and show a `✗ Wrong` badge; timeouts show a `⏱ Time's up` badge
- **Trivia intro screen** — shown before each trivia session; explains the rapid-fire format with stat pills (3 questions / 20s / 20 pts each) and a Start Quiz button
- **Trivia daily gate** — `howzat_trivia_last_played` localStorage key; card dims and shows "✓ Done today" badge after playing; resets at midnight alongside bowling and batting
- **Trivia leaderboard tab** — `🧠 Trivia` tab on the daily Top 5 leaderboard; standalone trivia scores tracked under `category: 'trivia'` in DynamoDB
- **Play Next suggestions** — after completing any daily game, unplayed game cards appear above "Today's Leaderboard" so players can jump straight into the next challenge; section is hidden once all three daily games are played
- **Trivia scores in Total tab** — combined daily leaderboard now merges bowling + batting + trivia game scores; breakdown subtext shows `🏏 / 🏃 / 🧠` contributions per player
- **Trivia-only players in Hall of Fame** — all-time leaderboard now fetches bowling, batting, and trivia categories in parallel and merges by `userId`; players who have only played trivia are no longer invisible

### Changed

- **Leaderboard tab order** — reordered to Bowl → Bat → Trivia → Total (⚡ Total moved to end)
- **Landing page card order** — Bowler → Batter → Trivia → Celebration (Coming Soon); Celebration moved to last since it is not yet playable
- **Celebration card label** — updated from V3 to V4 in development
- **Play Next placement** — section appears above "Today's Leaderboard" on the game-complete screen, not below it
- **Hall of Fame total** — simplified to use `summary.totalScore` directly (already the authoritative sum across all game types); removed stale `+ totalTriviaScore` double-add

### Fixed

- **Trivia hover bleedthrough** — after answering a question, the mouse's resting position no longer bleeds hover styling onto the fresh buttons of the next question; pointer events are briefly suspended (180ms) after each render
- **Script crash on boot** — `TRIVIA_TIMER_SECS` was referenced in the `G` object initialiser but declared ~1000 lines later; temporal dead zone caused a `ReferenceError` that killed the entire script before `boot()` ran, preventing the auth modal from appearing; constants moved above `G`
- **Total tab missing trivia** — daily combined leaderboard was only summing bowling + batting; trivia game scores were entirely excluded from the Total tab

---

## [1.2.0] - 2026-04-15

### Added

- **Scoring rescaled** — bowling points table `[100, 75, 50, 25, 15]`; batting `[200, 150, 100, 50, 25]`; DynamoDB wiped for a fresh start on the new scale
- **Forest green accent colour** — accent changed from teal to `#3a7d44`; saturation tuned across two follow-up commits

### Fixed

- **Streak increment** — streak now increments at most once per calendar day; previously incremented once per winning game, so playing multiple daily games on the same day could inflate the streak
- **Accent colour saturation** — two rounds of desaturation after initial green switch

---

## [1.1.0] - 2026-04-14

### Added

- **Batter Challenge** — second daily challenge running independently from the Bowler Challenge; uses a separate date seed (`date + 'bat'`) so the two challenges never share the same player on any given day
- **Double points for batting** — point table `[200, 150, 100, 50, 25]` vs bowling's `[100, 75, 50, 25, 15]`
- **Batting played-today gate** — separate `howzat_batting_last_played` localStorage key; state syncs and resets independently at midnight UTC
- **`BATTERS` / `VIDEO_BATTERS` arrays** — initial batting roster: Babar Azam, Sachin Tendulkar, Kevin Pietersen with full clue sets and nation/era/style metadata
- **`frontend/assets/batters.json`** — 277 famous international batter names across all eras used for autocomplete suggestions
- **Live video previews on challenge cards** — both Bowler Challenge and Batter Challenge cards now show a blurred looping silhouette video of today's player instead of a static icon; loaded by `loadCardPreviews()` on boot
- **303-name bowler autocomplete** — `frontend/assets/bowlers.json` added to the frontend assets folder

### Changed

- **Challenge cards renamed** — "Daily Challenge" → "Bowler Challenge"; "Batting Daily/Challenge" → "Batter Challenge"
- **Video aspect ratio** — game video player updated to `1:1` square ratio
- **`VIDEO_BOWLERS` trimmed to 3** — only Anderson, Boult, and Shoaib Akhtar have video assets; Classic and Blitz queues adjusted accordingly
- **Hero section simplified** — removed the full hero video preview block (video element, placeholder, CTA overlay, played overlay, pill label) from the landing page; card previews replace its purpose
- **`loadHeroDailyVideo()` renamed to `loadCardPreviews()`** — function now only handles the two card banner previews

### Performance

- All video assets recompressed with ffmpeg (`crf 23`, `720×720`, `libx264`, `preset slow`, `-an`) — 93–96% size reduction across bowling and batting clips

---

## [1.0.1] - 2026-04-14

### Fixed

- Daily challenge date seed now uses UTC (`toISOString().split("T")[0]`) instead of local browser time, eliminating a timezone mismatch where players east of UTC would see the next day's bowler before midnight UTC, and players west of UTC would see the previous day's bowler after midnight UTC — now consistent with the backend Lambda functions

---

## [1.0.0] - 2026-04-13

Full public launch. Covers everything built from initial commit through cross-device sync and Hall of Fame stats.

### Added

**Game**
- Three game modes: Classic (10 bowlers, 5 guesses each with progressive clues), Blitz (12 bowlers, 15s timer), Daily (1 shared bowler per day, resets at midnight UTC)
- 15 legendary bowlers with silhouette video clips (Malinga, Bumrah, Warne, Muralitharan, Shoaib Akhtar, Wasim Akram, McGrath, Kumble, Starc, Steyn, Rabada, Boult, Anderson, Harbhajan, Waqar Younis)
- Daily challenge gate — played state, done badge, live countdown to midnight, local-date seed, automatic reset
- Hero daily challenge video preview on landing page
- Share card on game completion (styled HTML card)
- Player name modal — gates final screen, saves real name to leaderboard

**Leaderboard & Stats**
- Today's Top 5 daily leaderboard on landing page, with YOU row for players outside top 5
- Hall of Fame — all-time top 20 leaderboard showing cumulative total score per player
- Hall of Fame stats row per player: games played, current streak, win rate (%), best single score
- `GET /played-today` Lambda + API route — checks DynamoDB for today's daily play, enables cross-device replay prevention
- Cross-device played-today sync: on sign-in, backend is queried and `howzat_last_played` is set if already played on another device
- Hall of Fame syncs `best` and `games` into local `cz3` storage on load, keeping header stats accurate on any device

**Auth & User Accounts**
- Cognito user pool with email/password registration and mandatory email verification before first sign-in
- Google OAuth federated sign-in via Cognito hosted UI
- Guest mode — persistent guest UUID, guest name prompt before session, post-game score save
- Profile dropdown in header: display name, avatar, sign out, delete account
- Avatar upload to S3 with per-user flag; Google profile picture shown as default after sign-in
- Delete account modal with confirmation

**Infrastructure**
- Full AWS serverless stack: S3 (frontend hosting + avatar storage), CloudFront (CDN, OAC, custom domain), API Gateway (HTTP API), Lambda (Node.js 20.x), DynamoDB (PAY_PER_REQUEST, GSI, 90-day TTL), Cognito, ACM, IAM, CloudWatch
- All infrastructure defined in Terraform (`infrastructure/main.tf`)
- CI/CD pipeline via GitHub Actions: push to `main` → S3 sync → CloudFront invalidation
- Lambda functions: `daily-challenge`, `save-score`, `leaderboard`, `delete-account`, `avatar-upload`, `played-today`
- DynamoDB tables: `cricket-zone-scores` (primary key: `userId` + `scoreId`, GSI: `category-date-index`), `cricket-zone-content`
- Score persistence: `streak`, `wins`, `gamesPlayed`, `pictureUrl` stored alongside each score record

### Fixed

- Guest scores excluded from leaderboard (authenticated players only)
- Guest UUID generation broken on HTTP dev environment
- Score not appearing on leaderboard — race condition between save and fetch, GSI eventual consistency delay
- JWT decode from `Authorization` header in `save-score` Lambda (fallback when no API Gateway authorizer)
- Daily challenge card played state not persisting correctly (done badge, countdown, midnight reset)
- `cz_uid` not updated on Google sign-in — guest ID persisted after authentication, causing score attribution to wrong userId
- S3 avatar overwriting Google profile picture on login — restored only when user has previously uploaded a custom avatar
- Google profile picture not appearing in header or leaderboard rows — Cognito user pool client missing `read_attributes` for `picture`; `onerror` handlers falling straight to initials without trying Google picture
- Leaderboard rows hardcoded S3 avatar URL with no fallback — now cascades: custom S3 → `pictureUrl` from DB → initials
- Daily challenge card not reapplying played state after Google sign-in callback
- In-memory `stats` object not updated before `refreshH()` after Hall of Fame sync — header displayed stale values despite localStorage being written
- Delete account confirmation replaced inline dropdown confirm with a proper modal
- `howzat_last_played` gate was device-only (localStorage) — now synced from DynamoDB on every sign-in

### Changed

- Rebranded from Cricket Zone to Howzat — title, header, share text, logo SVG
- Hall of Fame aggregation changed from best single game score to cumulative sum of all daily scores per player
- Hall of Fame score label changed from game mode tag to `TOTAL`
- Leaderboard deduplicates by `userId`, keeping highest score per user per day
- Header player name `max-width` increased from `100px` to `200px`
- `save-score` Lambda: `playerName` for authenticated users now sourced from JWT claims (`name` → `email` → `sub`), not request body
- `played-today` check uses primary key query with `FilterExpression: gameMode = daily` — avoids false positives from classic/blitz scores on the same day

---

*Built by Hussain Ashfaque — AWS Solutions Architect Associate | Cloud Engineering Portfolio Project*
*Live at [playhowzat.com](https://playhowzat.com)*
