// Mock for @aws-sdk/lib-dynamodb
// mockSend is exported so test files can configure return values directly.
import { jest } from '@jest/globals';

export const mockSend = jest.fn();

export const DynamoDBDocumentClient = {
  from: jest.fn(() => ({ send: mockSend })),
};

export const PutCommand    = jest.fn(function (i) { this.input = i; this.constructor = { name: 'PutCommand' }; });
export const GetCommand    = jest.fn(function (i) { this.input = i; this.constructor = { name: 'GetCommand' }; });
export const QueryCommand  = jest.fn(function (i) { this.input = i; this.constructor = { name: 'QueryCommand' }; });
export const UpdateCommand = jest.fn(function (i) { this.input = i; this.constructor = { name: 'UpdateCommand' }; });
