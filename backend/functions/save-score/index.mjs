import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || "cricket-zone-scores";

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*" };

  try {
    const body = JSON.parse(event.body);
    const { score, category, gameMode } = body;
    const triviaScore = (typeof body.triviaScore === 'number' && body.triviaScore >= 0 && body.triviaScore <= 300)
      ? Math.round(body.triviaScore)
      : 0;

    if (score === undefined || !category || !gameMode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    // Prefer claims injected by an API Gateway JWT authorizer; fall back to
    // manually decoding the Authorization header when no authorizer is attached.
    let claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) {
      const auth = event.headers?.Authorization ?? event.headers?.authorization ?? '';
      if (auth.startsWith('Bearer ')) {
        try {
          const payload = auth.split('.')[1];
          claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
        } catch { claims = null; }
      }
    }

    const pictureUrl = typeof body.pictureUrl === 'string' && body.pictureUrl.length <= 2048
      ? body.pictureUrl : undefined;

    let userId, playerName;

    if (claims?.sub) {
      // ── Authenticated path ────────────────────────────────────────────
      userId     = claims.sub;
      playerName = claims.name || claims.email || userId;
    } else {
      // ── Guest path ────────────────────────────────────────────────────
      const guestName = typeof body.playerName === "string" ? body.playerName.trim() : "";
      const guestId   = typeof body.userId     === "string" ? body.userId.trim()     : "";

      if (!guestName || guestName.length > 30) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "playerName must be 1–30 characters" })
        };
      }

      if (typeof score !== "number" || score < 0 || score > 2500) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "score must be a number between 0 and 2500" })
        };
      }

      if (!guestId.startsWith("guest_")) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid guest userId" })
        };
      }

      userId     = guestId;
      playerName = guestName;
    }

    const isGuest   = !claims?.sub;
    const serverUtc = new Date().toISOString().split("T")[0];           // today UTC
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]; // yesterday UTC
    // Accept the client's local date only if it falls within [yesterday_UTC, today_UTC].
    // This corrects the UTC-midnight bleed-through for users in UTC- timezones while
    // preventing anyone from claiming a future date to appear on tomorrow's leaderboard.
    const clientDate = typeof body.localDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.localDate)
      ? body.localDate : serverUtc;
    const date = (clientDate >= yesterday && clientDate <= serverUtc) ? clientDate : serverUtc;
    const scoreId  = `${category}#${date}#${randomUUID()}`;
    const ttl      = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

    // ── For authenticated users: fetch summary first so we have country ─
    let existing = null;
    let country  = null;

    if (!isGuest) {
      const { Item } = await db.send(new GetCommand({
        TableName: SCORES_TABLE,
        Key: { userId, scoreId: '#summary' }
      }));
      existing = Item || null;

      // Use cached country from #summary; if missing, accept validated client-provided code.
      // Detection runs in the browser (Cloudflare cdn-cgi/trace) so no Lambda outbound call needed.
      country = existing?.country || null;
      if (!country) {
        const clientCountry = typeof body.country === 'string' ? body.country.trim().toUpperCase() : '';
        if (/^[A-Z]{2}$/.test(clientCountry)) country = clientCountry;
      }
    }

    // ── Write the game record ─────────────────────────────────────────
    await db.send(new PutCommand({
      TableName: SCORES_TABLE,
      Item: {
        userId,
        scoreId,
        playerName,
        score,
        ...(triviaScore > 0 && { triviaScore }),
        category,
        gameMode,
        date,
        ttl,
        ...(isGuest             && { isGuest: true }),
        ...(pictureUrl !== undefined && { pictureUrl }),
        ...(country    !== null      && { country }),
      }
    }));

    // ── Upsert user summary record (authenticated users only) ─────────
    if (!isGuest) {
      const isWin   = score > 0;
      const today2  = new Date().toISOString().split("T")[0];
      const yest2   = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      const lastDate = existing?.lastPlayed ? existing.lastPlayed.split("T")[0] : null;

      let newStreak;
      if (!isWin) {
        newStreak = 0;
      } else if (lastDate === today2) {
        // Already played today — don't increment again
        newStreak = existing?.streak || 1;
      } else if (lastDate === yest2) {
        // Consecutive day — extend streak
        newStreak = (existing?.streak || 0) + 1;
      } else {
        // First game ever, or streak broken
        newStreak = 1;
      }

      const summary = {
        userId,
        scoreId:          '#summary',
        totalScore:       (existing?.totalScore       || 0) + score,
        totalTriviaScore: (existing?.totalTriviaScore || 0) + triviaScore,
        gamesPlayed:      (existing?.gamesPlayed      || 0) + 1,
        wins:             (existing?.wins             || 0) + (isWin ? 1 : 0),
        bestScore:        Math.max(existing?.bestScore || 0, score),
        streak:           newStreak,
        lastPlayed:       new Date().toISOString(),
        playerName,
        ...(pictureUrl !== undefined && { pictureUrl }),
        ...(country    !== null      && { country }),
      };

      await db.send(new PutCommand({
        TableName: SCORES_TABLE,
        Item: summary
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Score saved", scoreId, summary })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: "Score saved", scoreId })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" })
    };
  }
};
