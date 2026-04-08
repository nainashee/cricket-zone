import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "https://playhowzat.com" };

  try {
    const category = event.queryStringParameters?.category || "bowling";
    const date = new Date().toISOString().split("T")[0];

    const result = await db.send(new QueryCommand({
      TableName: "cricket-zone-scores",
      IndexName: "category-date-index",
      KeyConditionExpression: "category = :cat AND #d = :date",
      ExpressionAttributeNames: { "#d": "date" },
      ExpressionAttributeValues: {
        ":cat": category,
        ":date": date
      },
      ScanIndexForward: false,
      Limit: 10
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ leaderboard: result.Items })
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