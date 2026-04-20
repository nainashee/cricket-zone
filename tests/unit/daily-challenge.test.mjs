import { describe, it, expect } from '@jest/globals';
import { makeEvent } from './__mocks__/dynamo.mjs';

// daily-challenge has no AWS dependencies — import directly
const { handler } = await import('../../backend/functions/daily-challenge/index.mjs');

const BOWLERS = [
  'malinga', 'bumrah', 'warne', 'murali', 'shoaib',
  'wasim', 'mcgrath', 'kumble', 'starc', 'steyn',
  'rabada', 'boult', 'anderson', 'harbhajan', 'waqar',
];

describe('daily-challenge', () => {
  it('returns 200 with bowler, date, category for bowling', async () => {
    const event = makeEvent({ queryStringParameters: { category: 'bowling' } });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('bowler');
    expect(body).toHaveProperty('date');
    expect(body.category).toBe('bowling');
    expect(BOWLERS).toContain(body.bowler);
  });

  it('defaults to bowling when no category param', async () => {
    const event = makeEvent({ queryStringParameters: null });
    const res = await handler(event);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.category).toBe('bowling');
  });

  it('returns 400 for invalid category', async () => {
    const event = makeEvent({ queryStringParameters: { category: 'batting' } });
    const res = await handler(event);
    expect(res.statusCode).toBe(400);
  });

  it('returns deterministic bowler for a given date', async () => {
    // The algorithm: parseInt(date.replace(/-/g,'')) % BOWLERS.length
    const today = new Date().toISOString().split('T')[0];
    const expected = BOWLERS[parseInt(today.replace(/-/g, '')) % BOWLERS.length];
    const event = makeEvent({ queryStringParameters: { category: 'bowling' } });
    const res = await handler(event);
    const body = JSON.parse(res.body);
    expect(body.bowler).toBe(expected);
  });
});
