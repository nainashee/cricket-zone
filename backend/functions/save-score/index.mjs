import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || "cricket-zone-scores";

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "https://playhowzat.com" };

  try {
    const body = JSON.parse(event.body);
    const { userId, playerName, score, category, gameMode } = body;

    if (!userId || !playerName || score === undefined || !category || !gameMode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields" })
      };
    }

    const date = new Date().toISOString().split("T")[0];
    const scoreId = `${category}#${date}#${randomUUID()}`;
    const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days

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
        ttl
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
