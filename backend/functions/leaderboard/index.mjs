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

    let leaderboard;

    if (alltime) {
      // Sum every score per userId; take playerName + pictureUrl from most recent record
      const userMap = {};
      for (const item of items) {
        if (item.isGuest || item.userId?.startsWith('guest_')) continue;
        const uid = item.userId;
        if (!userMap[uid]) {
          userMap[uid] = { userId: uid, playerName: item.playerName, pictureUrl: item.pictureUrl, totalScore: 0, latestDate: '' };
        }
        userMap[uid].totalScore += (item.score || 0);
        if (item.date > userMap[uid].latestDate) {
          userMap[uid].latestDate = item.date;
          userMap[uid].playerName = item.playerName;
          if (item.pictureUrl) userMap[uid].pictureUrl = item.pictureUrl;
        }
      }
      leaderboard = Object.values(userMap)
        .sort((a, b) => b.totalScore - a.totalScore)
        .slice(0, 20)
        .map(({ userId, playerName, pictureUrl, totalScore }) => ({ userId, playerName, pictureUrl, score: totalScore }));
    } else {
      // Daily: keep only the highest single score per userId for today
      const best = {};
      for (const item of items) {
        if (item.isGuest || item.userId?.startsWith('guest_')) continue;
        const uid = item.userId;
        if (!best[uid] || item.score > best[uid].score) {
          best[uid] = item;
        }
      }
      leaderboard = Object.values(best)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
    }

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
