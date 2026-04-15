import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || "cricket-zone-scores";

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "https://playhowzat.com" };

  try {
    // Extract sub from JWT — prefer API Gateway authorizer claims, fall back to manual decode
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

    if (!claims?.sub) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized" })
      };
    }

    const date = new Date().toISOString().split("T")[0];

    // Query both bowling and batting in parallel
    // scoreId format: "<category>#<date>#<uuid>"; filter to daily mode only
    // Note: no Limit — Limit applies before FilterExpression so Limit:1 could return played:false incorrectly
    const [bowlResult, batResult] = await Promise.all([
      db.send(new QueryCommand({
        TableName: SCORES_TABLE,
        KeyConditionExpression: "userId = :uid AND begins_with(scoreId, :prefix)",
        FilterExpression: "gameMode = :mode",
        ExpressionAttributeValues: { ":uid": claims.sub, ":prefix": `bowling#${date}#`, ":mode": "daily" }
      })),
      db.send(new QueryCommand({
        TableName: SCORES_TABLE,
        KeyConditionExpression: "userId = :uid AND begins_with(scoreId, :prefix)",
        FilterExpression: "gameMode = :mode",
        ExpressionAttributeValues: { ":uid": claims.sub, ":prefix": `batting#${date}#`, ":mode": "daily" }
      }))
    ]);

    const bowlingPlayed = (bowlResult.Count ?? 0) > 0;
    const battingPlayed = (batResult.Count  ?? 0) > 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ played: bowlingPlayed, bowlingPlayed, battingPlayed })
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
