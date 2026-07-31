/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testMatch: ["**/*.spec.ts", "**/*.e2e-spec.ts"],
  // Integration tests pull a Postgres testcontainer image on first run.
  testTimeout: 120_000,
  moduleNameMapper: {
    "^@ilikebuffet/shared/test$": "<rootDir>/../../packages/shared/test/index.ts",
    "^@ilikebuffet/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
};
