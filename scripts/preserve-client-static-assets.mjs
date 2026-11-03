#!/usr/bin/env node
/**
 * Preserve old Next.js content-hashed assets during an atomic client release.
 * Previous mobile browser tabs can still request chunks from the old release.
 * Never overwrites assets of the new release or touches unrelated applications.
 *
 * Usage: node scripts/preserve-client-static-assets.mjs NEW_RELEASE [OLD_RELEASE ...]
 * NEW_RELEASE and OLD_RELEASE are the Cash Ledger release roots, not static paths.
 * Run after staging/build and before activating the new release. It is safe to
 * invoke again and is reusable on a future client VPS with the same layout.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const [destArg, ...sources] = process.argv.slice(2);
if (!destArg || !sources.length) {
  console.error('Usage: node preserve-client-static-assets.mjs NEW_RELEASE OLD_RELEASE [OLD_RELEASE ...]');
  process.exit(2);
}
const relative = 'web/apps/web/.next/static';
const destRoot = realpathSync(resolve(destArg));
const destination = join(destRoot, relative);
if (!existsSync(destination) || !lstatSync(destination).isDirectory()) {
  throw new Error('Staged release has no valid Next.js static directory: ' + destination);
}
const destReal = realpathSync(destination);
if (!destReal.startsWith(destRoot + sep)) throw new Error('Unsafe staged destination');
for (const arg of sources) {
  const sourceRoot = realpathSync(resolve(arg));
  if (sourceRoot === destRoot) continue;
  const source = join(sourceRoot, relative);
  if (!existsSync(source)) continue;
  if (!lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
    throw new Error('Unsafe previous release static directory');
  }
  const sourceReal = realpathSync(source);
  if (!sourceReal.startsWith(sourceRoot + sep)) throw new Error('Unsafe previous source directory');
  // cpSync(force:false) retains new-release files when filenames happen to overlap.
  // Only the immutable, hashed Next.js static tree is copied. No source deletion.
  cpSync(sourceReal, destReal, { recursive: true, force: false, errorOnExist: false, filter: (src) => !lstatSync(src).isSymbolicLink() });
  console.log('Preserved prior Next.js assets from ' + sourceRoot);
}
