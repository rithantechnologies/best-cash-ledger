import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
const script = new URL('./preserve-client-static-assets.mjs', import.meta.url).pathname;
const staticDir = 'web/apps/web/.next/static';

test('preserves old release chunks but never overwrites newly built chunks', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'cashledger-static-compat-'));
  try {
    const newer = join(temporary, 'new-release');
    const older = join(temporary, 'old-release');
    for (const root of [newer, older]) mkdirSync(join(root, staticDir, 'chunks'), { recursive: true });
    writeFileSync(join(older, staticDir, 'chunks/old-hash.js'), 'old-client-js');
    writeFileSync(join(older, staticDir, 'chunks/shared.js'), 'old-shared');
    writeFileSync(join(newer, staticDir, 'chunks/new-hash.js'), 'new-client-js');
    writeFileSync(join(newer, staticDir, 'chunks/shared.js'), 'new-shared');
    execFileSync(process.execPath, [script, newer, older]);
    assert.equal(readFileSync(join(newer, staticDir, 'chunks/old-hash.js'), 'utf8'), 'old-client-js');
    assert.equal(readFileSync(join(newer, staticDir, 'chunks/new-hash.js'), 'utf8'), 'new-client-js');
    assert.equal(readFileSync(join(newer, staticDir, 'chunks/shared.js'), 'utf8'), 'new-shared');
    execFileSync(process.execPath, [script, newer, older]);
    assert.equal(readFileSync(join(newer, staticDir, 'chunks/shared.js'), 'utf8'), 'new-shared');
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
