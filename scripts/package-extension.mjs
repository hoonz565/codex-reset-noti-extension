/* eslint-disable no-undef */
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_DIR = path.resolve(__dirname, '../packages/extension');
const DIST_DIR = path.resolve(EXTENSION_DIR, 'dist');
const OUTPUT_FILE = path.resolve(__dirname, '../extension-release.zip');

if (!fs.existsSync(DIST_DIR)) {
  console.error('dist directory does not exist. Run build first.');
  process.exit(1);
}

const output = fs.createWriteStream(OUTPUT_FILE);
const archive = archiver('zip', {
  zlib: { level: 9 },
});

output.on('close', function () {
  const fileBuffer = fs.readFileSync(OUTPUT_FILE);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest('hex');
  console.log(`Successfully created ${OUTPUT_FILE}`);
  console.log(`SHA-256 Checksum: ${hex}`);

  // Verify contents for security
  // We can't easily read inside the zip right now but we can ensure we only packed dist/
});

archive.on('error', function (err) {
  throw err;
});

archive.pipe(output);
archive.directory(DIST_DIR, false);
archive.finalize();
