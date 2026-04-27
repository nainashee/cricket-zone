import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockSend } from './__mocks__/lib-dynamodb.mjs';
import { makeJwt, makeEvent } from './__mocks__/dynamo.mjs';

afterEach(() => mockSend.mockReset());

const { handler } = await import('../../backend/functions/leaderboard/index.mjs');

const TODAY = new Date().toISOString().split('T')[0];

function makeRow(overrides = {}) {
  return {
    userId: 'user-1',
    scoreId: `bowling#${TODAY}#abc`,
    playerName: 'Player One',
    score: 100,
    category: 'bowling',
    date: TODAY,
    ...overrides,
  };
}

describe('leaderboard — daily mode', () => {
  it('returns 200 with leaderboard array', async () => {
    mockSend.mockResolvedValue({ Items: [makeRow()], Count: 1 });
    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling' } }));
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(JSON.parse(res.body).leaderboard)).toBe(true);
  });

  it('deduplicates by userId keeping highest score', async () => {
    mockSend.mockResolvedValue({
      Items: [
        makeRow({ scoreId: 'bowling#x#1', score: 50 }),
        makeRow({ scoreId: 'bowling#x#2', score: 200 }),
        makeRow({ scoreId: 'bowling#x#3', score: 100 }),
      ],
      Count: 3,
    });
    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling' } }));
    const body = JSON.parse(res.body);
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard[0].score).toBe(200);
  });

  it('includes guest entries in daily mode', async () => {
    mockSend.mockResolvedValue({ Items: [makeRow({ userId: 'guest_xyz', isGuest: true })], Count: 1 });
    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling' } }));
    expect(JSON.parse(res.body).leaderboard).toHaveLength(1);
  });

  it('sorts by score + triviaScore descending', async () => {
    mockSend.mockResolvedValue({
      Items: [
        makeRow({ userId: 'u1', scoreId: 'x#1', score: 100, triviaScore: 20 }),
        makeRow({ userId: 'u2', scoreId: 'x#2', score: 200, triviaScore: 0  }),
        makeRow({ userId: 'u3', scoreId: 'x#3', score: 50,  triviaScore: 60 }),
      ],
      Count: 3,
    });
    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling' } }));
    const lb = JSON.parse(res.body).leaderboard;
    expect(lb[0].userId).toBe('u2'); // 200
    expect(lb[1].userId).toBe('u1'); // 120
    expect(lb[2].userId).toBe('u3'); // 110
  });

  it('caps at 20 results', async () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeRow({ userId: `user-${i}`, scoreId: `bowling#${TODAY}#${i}`, score: i * 10 })
    );
    mockSend.mockResolvedValue({ Items: items, Count: 30 });
    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling' } }));
    expect(JSON.parse(res.body).leaderboard.length).toBeLessThanOrEqual(20);
  });
});

describe('leaderboard — all-time mode', () => {
  it('excludes guests', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [makeRow({ userId: 'guest_abc', isGuest: true }), makeRow({ userId: 'user-1' })], Count: 2 })
      .mockResolvedValue({ Item: null }); // GetCommand for summary per user

    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling', alltime: 'true' } }));
    const lb = JSON.parse(res.body).leaderboard;
    expect(lb.some(r => r.userId?.startsWith('guest_'))).toBe(false);
  });

  it('uses summary totalScore when available', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [makeRow({ score: 100 })], Count: 1 })
      .mockResolvedValueOnce({ Item: { totalScore: 9999, totalTriviaScore: 0, gamesPlayed: 50, wins: 40, bestScore: 500, streak: 10, lastPlayed: `${TODAY}T10:00:00.000Z` } });

    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling', alltime: 'true' } }));
    expect(JSON.parse(res.body).leaderboard[0].score).toBe(9999);
  });

  it('shows streak when lastPlayed is today', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [makeRow()], Count: 1 })
      .mockResolvedValueOnce({ Item: { totalScore: 100, gamesPlayed: 1, wins: 1, bestScore: 100, streak: 5, lastPlayed: `${TODAY}T10:00:00.000Z` } });

    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling', alltime: 'true' } }));
    expect(JSON.parse(res.body).leaderboard[0].streak).toBe(5);
  });

  it('shows streak 0 when lastPlayed is stale (missed days)', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
    mockSend
      .mockResolvedValueOnce({ Items: [makeRow()], Count: 1 })
      .mockResolvedValueOnce({ Item: { totalScore: 100, gamesPlayed: 5, wins: 5, bestScore: 200, streak: 7, lastPlayed: `${twoDaysAgo}T10:00:00.000Z` } });

    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling', alltime: 'true' } }));
    expect(JSON.parse(res.body).leaderboard[0].streak).toBe(0);
  });
});

describe('leaderboard — ?me=true', () => {
  it('returns 401 without Bearer token', async () => {
    const res = await handler(makeEvent({ queryStringParameters: { me: 'true' } }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await handler(makeEvent({
      queryStringParameters: { me: 'true' },
      headers: { Authorization: 'Bearer not.a.jwt' },
    }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with summary for authenticated user', async () => {
    mockSend.mockResolvedValue({ Item: { userId: 'user-99', totalScore: 500 } });
    const res = await handler(makeEvent({
      queryStringParameters: { me: 'true' },
      headers: { Authorization: `Bearer ${makeJwt({ sub: 'user-99' })}` },
    }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).summary.userId).toBe('user-99');
  });

  it('returns null summary when user has no record', async () => {
    mockSend.mockResolvedValue({ Item: undefined });
    const res = await handler(makeEvent({
      queryStringParameters: { me: 'true' },
      headers: { Authorization: `Bearer ${makeJwt({ sub: 'new-user' })}` },
    }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).summary).toBeNull();
  });
});

describe('leaderboard — date validation', () => {
  beforeEach(() => mockSend.mockResolvedValue({ Items: [], Count: 0 }));

  it('accepts valid clientDate within window', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling', date: yesterday } }));
    expect(res.statusCode).toBe(200);
  });

  it('falls back to serverUtc for future date', async () => {
    const future = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await handler(makeEvent({ queryStringParameters: { category: 'bowling', date: future } }));
    expect(res.statusCode).toBe(200);
  });
});
