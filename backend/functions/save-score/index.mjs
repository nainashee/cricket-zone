import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || "cricket-zone-scores";

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*" };

  try {
    const body = JSON.parse(event.body);
    const { score, category, gameMode } = body;

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

      if (typeof score !== "number" || score < 0 || score > 10000) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "score must be a number between 0 and 10000" })
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

    const isGuest  = !claims?.sub;
    const date    = new Date().toISOString().split("T")[0];
    const scoreId = `${category}#${date}#${randomUUID()}`;
    const ttl     = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60);

    await db.send(new PutCommand({
      TableName: SCORES_TABLE,
      Item: {
        userId,
        scoreId,
        playerName,
        score,
        category,
        gameMode,
        date,
        ttl,
        ...(isGuest && { isGuest: true }),
        ...(pictureUrl && { pictureUrl })
      }
    }));

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
