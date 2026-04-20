export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/*.test.mjs'],
  moduleNameMapper: {
    '^@aws-sdk/client-dynamodb$': '<rootDir>/__mocks__/client-dynamodb.mjs',
    '^@aws-sdk/lib-dynamodb$':    '<rootDir>/__mocks__/lib-dynamodb.mjs',
  },
};
