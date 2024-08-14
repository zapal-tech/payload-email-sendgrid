import { readFileSync } from 'fs';

/** @type {import('jest').Config} */
const config = {
  rootDir: '.',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*spec.ts'],
  testTimeout: 10000,
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', { ...JSON.parse(readFileSync(`${import.meta.dirname}/.swcrc`, 'utf-8')) }],
  },
  verbose: true,
};

export default config;
