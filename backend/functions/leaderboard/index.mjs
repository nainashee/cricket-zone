import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const db = DynamoDBDocumentClient.from(client);

const SCORES_TABLE = process.env.SCORES_TABLE || "cricket-zone-scores";

export const handler = async (event) => {
  const headers = { "Access-Control-Allow-Origin": "https://playhowzat.com" };

  try {
    const category = event.queryStringParameters?.category || "bowling";
    const alltime  = event.queryStringParameters?.alltime === "true";
    const me       = event.queryStringParameters?.me === "true";
    const date     = new Date().toISOString().split("T")[0];

    // ── GET /leaderboard?me=true — return the authenticated user's summary ──
    if (me) {
      const auth = event.headers?.Authorization ?? event.headers?.authorization ?? '';
      if (!auth.startsWith('Bearer ')) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }
      let claims;
      try {
        claims = JSON.parse(Buffer.from(auth.split('.')[1], 'base64url').toString());
      } catch {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
      }
      const { Item: summary } = await db.send(new GetCommand({
        TableName: SCORES_TABLE,
        Key: { userId: claims.sub, scoreId: '#summary' }
      }));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ summary: summary || null })
      };
    }

    // ── Paginate through all matching game records ─────────────────────────
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
          userMap[uid] = { userId: uid, playerName: item.playerName, pictureUrl: item.pictureUrl, totalScore: 0, totalTriviaScore: 0, bestScore: 0, gamesPlayed: 0, wins: null, streak: null, latestDate: '' };
        }
        const s = item.score || 0;
        userMap[uid].totalScore += s;
        userMap[uid].gamesPlayed++;                        // count actual records — always accurate
        if (s > userMap[uid].bestScore) userMap[uid].bestScore = s;
        if (item.date > userMap[uid].latestDate) {
          userMap[uid].latestDate = item.date;
          userMap[uid].playerName = item.playerName;
          if (item.pictureUrl) userMap[uid].pictureUrl = item.pictureUrl;
        }
      }

      // Fetch summary records for wins + streak — parallel GetItem calls (GetItem is authorised)
      await Promise.all(Object.keys(userMap).map(async (uid) => {
        try {
          const { Item: summary } = await db.send(new GetCommand({
            TableName: SCORES_TABLE,
            Key: { userId: uid, scoreId: '#summary' }
          }));
          if (summary) {
            if (summary.wins             !== undefined) userMap[uid].wins             = summary.wins;
            if (summary.streak           !== undefined) userMap[uid].streak           = summary.streak;
            // Use summary as source of truth for cross-category totals — the GSI query
            // only covers one category so its running sum would be incomplete.
            if (summary.totalScore       !== undefined) userMap[uid].totalScore       = summary.totalScore;
            if (summary.totalTriviaScore !== undefined) userMap[uid].totalTriviaScore = summary.totalTriviaScore;
            if (summary.gamesPlayed      !== undefined) userMap[uid].gamesPlayed      = summary.gamesPlayed;
            if (summary.bestScore        !== undefined) userMap[uid].bestScore        = summary.bestScore;
          }
        } catch (_) { /* summary not yet created — GSI-computed values remain as fallback */ }
      }));

      leaderboard = Object.values(userMap)
        .sort((a, b) => {
          const aTotal = (a.totalScore || 0) + (a.totalTriviaScore || 0);
          const bTotal = (b.totalScore || 0) + (b.totalTriviaScore || 0);
          return bTotal - aTotal;
        })
        .slice(0, 20)
        .map(({ userId, playerName, pictureUrl, totalScore, totalTriviaScore, bestScore, gamesPlayed, wins, streak }) => {
          const winRate = (gamesPlayed > 0 && wins != null) ? Math.round(wins / gamesPlayed * 100) : null;
          const triviaScore = totalTriviaScore || 0;
          return { userId, playerName, pictureUrl, score: totalScore, triviaScore, bestScore, gamesPlayed, streak, winRate };
        });

    } else {
      // Daily: keep only the highest single score per userId for today.
      // Guests who explicitly saved their score are included here (they are
      // excluded from all-time which requires a persistent #summary record).
      // Comparison uses score + triviaScore so trivia contribution is ranked.
      const best = {};
      for (const item of items) {
        const uid = item.userId;
        if (!uid) continue;
        const itemTotal = (item.score || 0) + (item.triviaScore || 0);
        const bestTotal = best[uid] ? (best[uid].score || 0) + (best[uid].triviaScore || 0) : -1;
        if (itemTotal > bestTotal) {
          best[uid] = item;
        }
      }
      leaderboard = Object.values(best)
        .sort((a, b) => {
          const aTotal = (a.score || 0) + (a.triviaScore || 0);
          const bTotal = (b.score || 0) + (b.triviaScore || 0);
          return bTotal - aTotal;
        })
        .slice(0, 20)
        .map(item => ({
          ...item,
          triviaScore: item.triviaScore || 0,
          total: (item.score || 0) + (item.triviaScore || 0),
        }));
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
