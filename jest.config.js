/**
 * Two projects:
 *  - "domain": pure TypeScript logic (db, repositories, sync, lib) running in Node
 *    against better-sqlite3 (see docs/DECISIONS.md D-017).
 *  - "ui": React Native component tests via jest-expo.
 */
module.exports = {
  projects: [
    {
      displayName: 'domain',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.ts'],
      transform: {
        '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', { configFile: './babel.config.js' }],
      },
      // babel-preset-expo rewrites process.env to the ESM module expo/virtual/env,
      // so the expo packages must be transformed rather than ignored.
      transformIgnorePatterns: [
        'node_modules[\\\\/](?!(expo|expo-[^\\\\/]+|@expo|@expo-google-fonts)[\\\\/])',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/tests/**/*.test.tsx'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
    },
  ],
};
