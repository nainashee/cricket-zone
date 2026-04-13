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

    // Query primary key directly — no GSI needed
    // scoreId format: "bowling#<date>#<uuid>"; filter to daily mode only
    // Note: no Limit here — Limit applies before FilterExpression in DynamoDB,
    // so a Limit:1 with a filter could read 1 non-daily record and return played:false incorrectly
    const result = await db.send(new QueryCommand({
      TableName: SCORES_TABLE,
      KeyConditionExpression: "userId = :uid AND begins_with(scoreId, :prefix)",
      FilterExpression: "gameMode = :mode",
      ExpressionAttributeValues: {
        ":uid": claims.sub,
        ":prefix": `bowling#${date}#`,
        ":mode": "daily"
      }
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ played: (result.Count ?? 0) > 0 })
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
