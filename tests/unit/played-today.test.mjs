import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockSend } from './__mocks__/lib-dynamodb.mjs';
import { makeJwt, makeEvent } from './__mocks__/dynamo.mjs';

afterEach(() => mockSend.mockReset());

const { handler } = await import('../../backend/functions/played-today/index.mjs');

const TODAY = new Date().toISOString().split('T')[0];
const claims = { sub: 'user-abc' };

function authEvent(queryStringParameters = {}) {
  return makeEvent({
    headers: { Authorization: `Bearer ${makeJwt(claims)}` },
    queryStringParameters: { date: TODAY, ...queryStringParameters },
  });
}

describe('played-today — authentication', () => {
  it('returns 401 with no Authorization header', async () => {
    const res = await handler(makeEvent({ queryStringParameters: { date: TODAY } }));
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with non-Bearer format', async () => {
    const res = await handler(makeEvent({
      headers: { Authorization: 'Basic abc123' },
      queryStringParameters: { date: TODAY },
    }));
    expect(res.statusCode).toBe(401);
  });
});

describe('played-today — not played', () => {
  beforeEach(() => mockSend.mockResolvedValue({ Items: [], Count: 0 }));

  it('returns all flags false when nothing played today', async () => {
    const res = await handler(authEvent());
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.played).toBe(false);
    expect(body.bowlingPlayed).toBe(false);
    expect(body.battingPlayed).toBe(false);
    expect(body.triviaPlayed).toBe(false);
  });
});

describe('played-today — individual categories', () => {
  it('returns bowlingPlayed:true when bowling score exists', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{}], Count: 1 }) // bowling
      .mockResolvedValueOnce({ Items: [],  Count: 0 }) // batting
      .mockResolvedValueOnce({ Items: [],  Count: 0 }); // trivia

    const body = JSON.parse((await handler(authEvent())).body);
    expect(body.bowlingPlayed).toBe(true);
    expect(body.battingPlayed).toBe(false);
    expect(body.triviaPlayed).toBe(false);
    expect(body.played).toBe(true);
  });

  it('returns battingPlayed:true when batting score exists', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [],  Count: 0 })
      .mockResolvedValueOnce({ Items: [{}], Count: 1 })
      .mockResolvedValueOnce({ Items: [],  Count: 0 });

    const body = JSON.parse((await handler(authEvent())).body);
    expect(body.battingPlayed).toBe(true);
    expect(body.bowlingPlayed).toBe(false);
  });

  it('returns all flags true when all three played', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [{}], Count: 1 })
      .mockResolvedValueOnce({ Items: [{}], Count: 1 })
      .mockResolvedValueOnce({ Items: [{}], Count: 1 });

    const body = JSON.parse((await handler(authEvent())).body);
    expect(body.bowlingPlayed).toBe(true);
    expect(body.battingPlayed).toBe(true);
    expect(body.triviaPlayed).toBe(true);
    expect(body.played).toBe(true);
  });
});

describe('played-today — date validation', () => {
  beforeEach(() => mockSend.mockResolvedValue({ Items: [], Count: 0 }));

  it('accepts yesterday as valid date', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    expect((await handler(authEvent({ date: yesterday }))).statusCode).toBe(200);
  });

  it('falls back to serverUtc for future date', async () => {
    const future = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    expect((await handler(authEvent({ date: future }))).statusCode).toBe(200);
  });

  it('falls back to serverUtc for invalid date format', async () => {
    expect((await handler(authEvent({ date: 'not-a-date' }))).statusCode).toBe(200);
  });
});

describe('played-today — DynamoDB error', () => {
  it('returns 500 on failure', async () => {
    mockSend.mockRejectedValue(new Error('DynamoDB error'));
    expect((await handler(authEvent())).statusCode).toBe(500);
  });
});
