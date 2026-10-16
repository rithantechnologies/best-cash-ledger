#!/usr/bin/env node
// Checks config only. Run with node --env-file=/path/to/demo-api/.env.
// Never log encryption keys or values. Disabled by default for client setups.
if (process.env.EXPECT_DEMO_CARD_COPY !== '1') {
  console.log('Demo card runtime preflight skipped (not a demo deployment).');
  process.exit(0);
}
if (process.env.DEMO_CARD_COPY_ENABLED !== 'true') {
  console.error('Demo card runtime preflight failed: demo card feature is not enabled.');
  process.exit(1);
}
if (!/^[a-fA-F0-9]{64}$/.test(process.env.DEMO_CARD_ENCRYPTION_KEY ?? '')) {
  console.error('Demo card runtime preflight failed: encryption key missing or malformed.');
  process.exit(1);
}
console.log('Demo card runtime config validated.');
