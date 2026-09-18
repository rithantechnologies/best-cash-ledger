process.env.TEST_DATABASE_URL = process.env.DATABASE_URL;
await import('./e2e-latest-fixes.mjs');
