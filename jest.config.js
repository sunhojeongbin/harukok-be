/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'cjs', 'json', 'ts'],
  roots: ['<rootDir>/src', '<rootDir>/test/tooling'],
  testRegex: '.*\\.spec\\.(ts|js|cjs)$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};
