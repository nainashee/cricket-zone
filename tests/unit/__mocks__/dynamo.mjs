import { jest } from '@jest/globals';

/**
 * Shared DynamoDB mock factory.
 * Call makeMockDb(responses) where responses is a map of
 * CommandClass → return value (or array of return values for sequential calls).
 *
 * Usage:
 *   const db = makeMockDb({
 *     GetCommand: { Item: { userId: 'u1', scoreId: '#summary' } },
 *     PutCommand: {},
 *     QueryCommand: [{ Items: [], Count: 0 }, { Items: [row], Count: 1 }],
 *   });
 */
export function makeMockDb(responses = {}) {
  const callCounts = {};

  const send = jest.fn(async (command) => {
    const name = command.constructor?.name ?? 'Unknown';
    callCounts[name] = (callCounts[name] || 0) + 1;

    if (!(name in responses)) return {};

    const val = responses[name];
    if (Array.isArray(val)) {
      // Return items in sequence; repeat last item when exhausted
      const idx = Math.min(callCounts[name] - 1, val.length - 1);
      return val[idx];
    }
    return val;
  });

  return { send, _callCounts: callCounts };
}

/**
 * Build a minimal valid JWT with the given claims (no real signature).
 * Used to create a fake Authorization header for tests.
 */
export function makeJwt(claims) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.fakesig`;
}

/**
 * Build an event object that looks like an API Gateway HTTP API v2 event.
 */
export function makeEvent(overrides = {}) {
  return {
    queryStringParameters: null,
    headers: {},
    body: null,
    requestContext: { authorizer: null },
    ...overrides,
  };
}
