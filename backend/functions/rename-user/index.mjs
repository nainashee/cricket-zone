import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || "cricket-zone-scores";

const NAME_RE = /^[a-zA-Z0-9 _-]+$/;
const PROFANITY = ['fuck', 'shit', 'cunt', 'dick', 'bitch', 'asshole', 'nigger', 'faggot', 'prick', 'twat', 'wanker', 'bastard'];

function validateName(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name)                    return { error: 'Name cannot be empty' };
  if (name.length < 3)          return { error: 'Name must be at least 3 characters' };
  if (name.length > 20)         return { error: 'Name must be 20 characters or fewer' };
  if (!NAME_RE.test(name))      return { error: 'Only letters, numbers, spaces, underscores, and hyphens are allowed' };
  const lower = name.toLowerCase();
  if (PROFANITY.some(w => lower.includes(w))) return { error: 'That name is not allowed' };
  return { name };
}

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "https://playhowzat.com" };

  try {
    // ── Auth (same pattern as save-score) ─────────────────────────────
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
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    // ── Validate name ─────────────────────────────────────────────────
    const body = JSON.parse(event.body || '{}');
    const result = validateName(body.newName);
    if (result.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: result.error }) };
    }
    const newName = result.name;
    const userId = claims.sub;

    // ── Update #summary record ────────────────────────────────────────
    const { Item: existing } = await db.send(new GetCommand({
      TableName: SCORES_TABLE,
      Key: { userId, scoreId: '#summary' }
    }));

    if (existing) {
      await db.send(new UpdateCommand({
        TableName: SCORES_TABLE,
        Key: { userId, scoreId: '#summary' },
        UpdateExpression: 'SET playerName = :n',
        ExpressionAttributeValues: { ':n': newName }
      }));
    }

    // ── Update all game records for this user ─────────────────────────
    // Query by userId (primary key hash) — no index needed
    let lastKey;
    const scoreIds = [];
    do {
      const res = await db.send(new QueryCommand({
        TableName: SCORES_TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        ProjectionExpression: 'scoreId',
        ...(lastKey && { ExclusiveStartKey: lastKey })
      }));
      for (const item of res.Items || []) {
        // Skip the #summary record — already updated above
        if (item.scoreId !== '#summary') scoreIds.push(item.scoreId);
      }
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);

    // UpdateItem each game record in parallel (batches of 25 to avoid throttling)
    for (let i = 0; i < scoreIds.length; i += 25) {
      await Promise.all(scoreIds.slice(i, i + 25).map(scoreId =>
        db.send(new UpdateCommand({
          TableName: SCORES_TABLE,
          Key: { userId, scoreId },
          UpdateExpression: 'SET playerName = :n',
          ExpressionAttributeValues: { ':n': newName }
        }))
      ));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, newName })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
