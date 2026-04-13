import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || "cricket-zone-scores";

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "https://playhowzat.com" };

  try {
    const category = event.queryStringParameters?.category || "bowling";
    const alltime  = event.queryStringParameters?.alltime === "true";
    const date     = new Date().toISOString().split("T")[0];

    // Paginate through all matching items
    let items = [];
    let lastKey = undefined;

    do {
      const params = alltime
        ? {
            // All-time: query by category only, no date filter
            TableName: SCORES_TABLE,
            IndexName: "category-date-index",
            KeyConditionExpression: "category = :cat",
            ExpressionAttributeValues: { ":cat": category },
            ...(lastKey && { ExclusiveStartKey: lastKey })
          }
        : {
            // Daily: filter to today's date
            TableName: SCORES_TABLE,
            IndexName: "category-date-index",
            KeyConditionExpression: "category = :cat AND #d = :date",
            ExpressionAttributeNames: { "#d": "date" },
            ExpressionAttributeValues: { ":cat": category, ":date": date },
            ...(lastKey && { ExclusiveStartKey: lastKey })
          };

      const result = await db.send(new QueryCommand(params));
      items = items.concat(result.Items || []);
      lastKey = result.LastEvaluatedKey;

    } while (lastKey);

    // Deduplicate — keep only the highest score per userId; exclude guest scores
    const best = {};
    for (const item of items) {
      if (item.isGuest) continue;
      const uid = item.userId;
      if (!best[uid] || item.score > best[uid].score) {
        best[uid] = item;
      }
    }

    // Sort by score descending, take top 20
    const leaderboard = Object.values(best)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ leaderboard })
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
