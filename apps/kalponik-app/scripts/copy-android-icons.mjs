#!/usr/bin/env node
// Copies the launcher icons in src-tauri/icons/android into the generated
// Android project. Run it after `pnpm tauri android init` and after any
// `git checkout` of src-tauri/gen.
//
// The set has the legacy square icon, the round icon and the adaptive icon
// (foreground, background colour and a monochrome layer for Android 13+
// themed icons). `tauri icon` can't make that from one image: its round icon
// is the square one and it has no monochrome layer, so it isn't used for
// Android.

import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(appDir, 'src-tauri', 'icons', 'android');
const res = path.join(appDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');

if (!existsSync(res)) {
  console.error(`No Android project at ${res}. Run \`pnpm tauri android init\` first.`);
  process.exit(1);
}
cpSync(src, res, { recursive: true });
console.log(`Copied launcher icons into ${path.relative(appDir, res)}`);
