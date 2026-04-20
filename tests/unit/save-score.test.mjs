import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockSend } from './__mocks__/lib-dynamodb.mjs';
import { makeJwt, makeEvent } from './__mocks__/dynamo.mjs';

afterEach(() => mockSend.mockReset());

const { handler } = await import('../../backend/functions/save-score/index.mjs');

const TODAY     = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];

function guestEvent(body = {}) {
  return makeEvent({
    body: JSON.stringify({
      score: 100,
      category: 'bowling',
      gameMode: 'classic',
      playerName: 'Tester',
      userId: 'guest_abc123',
      localDate: TODAY,
      ...body,
    }),
  });
}

function authEvent(claims, body = {}) {
  const token = makeJwt(claims);
  return makeEvent({
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      score: 100,
      category: 'bowling',
      gameMode: 'classic',
      localDate: TODAY,
      ...body,
    }),
  });
}

describe('save-score — guest path', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));

  it('saves score and returns 200 with scoreId', async () => {
    const res = await handler(guestEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('scoreId');
    expect(body.scoreId).toMatch(/^bowling#/);
  });

  it('returns 400 when playerName is missing', async () => {
    const res = await handler(guestEvent({ playerName: '' }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when playerName exceeds 30 chars', async () => {
    const res = await handler(guestEvent({ playerName: 'A'.repeat(31) }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when userId does not start with guest_', async () => {
    const res = await handler(guestEvent({ userId: 'hacker_123' }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when score > 2500', async () => {
    const res = await handler(guestEvent({ score: 9999 }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when score is negative', async () => {
    const res = await handler(guestEvent({ score: -1 }));
    expect(res.statusCode).toBe(400);
  });
});

describe('save-score — missing required fields', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));

  it('returns 400 when score is missing', async () => {
    const res = await handler(guestEvent({ score: undefined }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when category is missing', async () => {
    const res = await handler(guestEvent({ category: undefined }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when gameMode is missing', async () => {
    const res = await handler(guestEvent({ gameMode: undefined }));
    expect(res.statusCode).toBe(400);
  });
});

describe('save-score — authenticated path', () => {
  const claims = { sub: 'user-123', name: 'Hussain', email: 'h@test.com' };

  it('saves score and returns 200 with summary', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: null }) // GetCommand — no existing summary
      .mockResolvedValueOnce({})             // PutCommand — game record
      .mockResolvedValueOnce({});            // PutCommand — summary

    const res = await handler(authEvent(claims));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('summary');
    expect(body.summary.userId).toBe('user-123');
  });

  it('increments streak when last played was yesterday', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { streak: 3, lastPlayed: `${YESTERDAY}T10:00:00.000Z`, totalScore: 500, gamesPlayed: 5, wins: 4, bestScore: 200 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await handler(authEvent(claims, { score: 100 }));
    expect(JSON.parse(res.body).summary.streak).toBe(4);
  });

  it('keeps streak unchanged when already played today', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { streak: 5, lastPlayed: `${TODAY}T08:00:00.000Z`, totalScore: 500, gamesPlayed: 5, wins: 5, bestScore: 200 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await handler(authEvent(claims, { score: 100 }));
    expect(JSON.parse(res.body).summary.streak).toBe(5);
  });

  it('resets streak to 1 when previous play was not yesterday', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
    mockSend
      .mockResolvedValueOnce({ Item: { streak: 10, lastPlayed: `${twoDaysAgo}T10:00:00.000Z`, totalScore: 500, gamesPlayed: 10, wins: 8, bestScore: 300 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await handler(authEvent(claims, { score: 100 }));
    expect(JSON.parse(res.body).summary.streak).toBe(1);
  });

  it('sets streak to 0 when score is 0', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { streak: 5, lastPlayed: `${YESTERDAY}T10:00:00.000Z`, totalScore: 500, gamesPlayed: 5, wins: 5, bestScore: 200 } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await handler(authEvent(claims, { score: 0 }));
    expect(JSON.parse(res.body).summary.streak).toBe(0);
  });
});

describe('save-score — triviaScore validation', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));

  it('clamps triviaScore above 300 to 0 (treated as invalid)', async () => {
    const res = await handler(guestEvent({ triviaScore: 999 }));
    expect(res.statusCode).toBe(200);
  });

  it('accepts valid triviaScore within range', async () => {
    const res = await handler(guestEvent({ triviaScore: 60 }));
    expect(res.statusCode).toBe(200);
  });
});

describe('save-score — date validation', () => {
  beforeEach(() => mockSend.mockResolvedValue({}));

  it('accepts localDate = today', async () => {
    const res = await handler(guestEvent({ localDate: TODAY }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).scoreId).toContain(TODAY);
  });

  it('accepts localDate = yesterday (UTC- timezone users)', async () => {
    const res = await handler(guestEvent({ localDate: YESTERDAY }));
    expect(res.statusCode).toBe(200);
  });

  it('rejects future date and falls back to serverUtc', async () => {
    const future = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const res = await handler(guestEvent({ localDate: future }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).scoreId).toContain(TODAY);
  });
});

describe('save-score — DynamoDB error', () => {
  it('returns 500 on unexpected DynamoDB failure', async () => {
    mockSend.mockRejectedValue(new Error('DynamoDB timeout'));
    const res = await handler(guestEvent());
    expect(res.statusCode).toBe(500);
  });
});
