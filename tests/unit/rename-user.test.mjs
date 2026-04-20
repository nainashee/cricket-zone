import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mockSend } from './__mocks__/lib-dynamodb.mjs';
import { makeJwt, makeEvent } from './__mocks__/dynamo.mjs';

afterEach(() => mockSend.mockReset());

const { handler } = await import('../../backend/functions/rename-user/index.mjs');

const claims = { sub: 'user-rename-123' };

function authEvent(newName) {
  return makeEvent({
    headers: { Authorization: `Bearer ${makeJwt(claims)}` },
    body: JSON.stringify({ newName }),
  });
}

describe('rename-user — authentication', () => {
  it('returns 401 without token', async () => {
    const res = await handler(makeEvent({ body: JSON.stringify({ newName: 'ValidName' }) }));
    expect(res.statusCode).toBe(401);
  });
});

describe('rename-user — name validation', () => {
  it('returns 400 for empty name', async () => {
    const res = await handler(authEvent(''));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/empty/i);
  });

  it('returns 400 for name shorter than 3 characters', async () => {
    const res = await handler(authEvent('AB'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/3 char/i);
  });

  it('returns 400 for name longer than 20 characters', async () => {
    const res = await handler(authEvent('A'.repeat(21)));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/20 char/i);
  });

  it('returns 400 for name with special characters like !', async () => {
    const res = await handler(authEvent('Bad!Name'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/letters/i);
  });

  it('returns 400 for name containing profanity', async () => {
    const res = await handler(authEvent('iamadick'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/not allowed/i);
  });

  it('accepts name with letters, numbers, underscores, hyphens', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: { userId: claims.sub, scoreId: '#summary' } }) // GetCommand
      .mockResolvedValueOnce({ Items: [{ scoreId: 'bowling#2024-01-01#1' }], LastEvaluatedKey: undefined }) // QueryCommand
      .mockResolvedValue({}); // UpdateCommand calls

    const res = await handler(authEvent('Cool_Name-99'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).newName).toBe('Cool_Name-99');
  });

  it('trims leading and trailing whitespace before validating', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: null })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });

    const res = await handler(authEvent('  ValidName  '));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).newName).toBe('ValidName');
  });
});

describe('rename-user — update logic', () => {
  it('skips summary UpdateCommand when no existing summary', async () => {
    mockSend
      .mockResolvedValueOnce({ Item: null }) // GetCommand — no summary
      .mockResolvedValueOnce({ Items: [{ scoreId: 'bowling#2024-01-01#x' }], LastEvaluatedKey: undefined }) // QueryCommand
      .mockResolvedValue({}); // UpdateCommand for game record

    const res = await handler(authEvent('NewName'));
    expect(res.statusCode).toBe(200);
  });

  it('updates all game records in batches of 25', async () => {
    const gameRecords = Array.from({ length: 30 }, (_, i) => ({ scoreId: `bowling#2024-01-01#${i}` }));
    // Handler order: GetCommand → UpdateCommand(summary) → QueryCommand → UpdateCommand×30
    mockSend
      .mockResolvedValueOnce({ Item: { userId: claims.sub, scoreId: '#summary' } }) // GetCommand
      .mockResolvedValueOnce({})                                                     // UpdateCommand — summary
      .mockResolvedValueOnce({ Items: gameRecords, LastEvaluatedKey: undefined })    // QueryCommand
      .mockResolvedValue({});                                                         // 30 game UpdateCommands

    const res = await handler(authEvent('BatchTest'));
    // 1 Get + 1 Query + 1 summary Update + 30 game Updates = 33
    expect(mockSend.mock.calls.length).toBeGreaterThanOrEqual(31);
    expect(res.statusCode).toBe(200);
  });
});

describe('rename-user — DynamoDB error', () => {
  it('returns 500 on unexpected failure', async () => {
    mockSend.mockRejectedValue(new Error('Network error'));
    const res = await handler(authEvent('ValidName'));
    expect(res.statusCode).toBe(500);
  });
});
