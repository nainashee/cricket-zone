import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const cognito = new CognitoIdentityProviderClient({ region: "us-east-1" });
const dynamo  = new DynamoDBClient({ region: "us-east-1" });
const db      = DynamoDBDocumentClient.from(dynamo);

const USER_POOL_ID  = process.env.COGNITO_USER_POOL_ID;
const SCORES_TABLE  = process.env.SCORES_TABLE || "cricket-zone-scores";

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "*" };

  try {
    let claims = event.requestContext?.authorizer?.jwt?.claims;
    if (!claims?.sub) {
      const auth = event.headers?.Authorization ?? event.headers?.authorization ?? "";
      if (auth.startsWith("Bearer ")) {
        try {
          const payload = auth.split(".")[1];
          claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        } catch { claims = null; }
      }
    }

    if (!claims?.sub) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    const userId   = claims.sub;
    const username = claims["cognito:username"] || userId;

    // 1. Delete all DynamoDB scores for this user
    let lastKey;
    do {
      const result = await db.send(new QueryCommand({
        TableName: SCORES_TABLE,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ExclusiveStartKey: lastKey,
      }));
      for (const item of (result.Items || [])) {
        await db.send(new DeleteCommand({
          TableName: SCORES_TABLE,
          Key: { userId: item.userId, scoreId: item.scoreId },
        }));
      }
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    // 2. Delete Cognito user
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
    }));

    return { statusCode: 200, headers, body: JSON.stringify({ message: "Account deleted" }) };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
