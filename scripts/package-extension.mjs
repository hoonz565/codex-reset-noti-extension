/* eslint-disable no-undef */
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { ZipArchive } from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');
const extensionDir = path.join(projectDir, 'packages', 'extension');
const distDir = path.join(extensionDir, 'dist');
const outputFile = path.join(projectDir, 'extension-release.zip');
const checksumFile = `${outputFile}.sha256`;
const fixedZipDate = new Date('1980-01-01T00:00:00.000Z');
const allowedFiles = ['manifest.json', 'popup.css', 'popup.html', 'popup.js'];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function collectFiles(directory, relativeDirectory = '') {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    } else {
      fail(`unsupported build output entry: ${relativePath}`);
    }
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function validateApiBaseUrl(rawUrl) {
  if (!rawUrl) {
    fail('WORKER_API_BASE_URL is required for extension packaging.');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail('WORKER_API_BASE_URL must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'https:') {
    fail('WORKER_API_BASE_URL must use HTTPS.');
  }
  if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    fail('WORKER_API_BASE_URL cannot target a local host.');
  }
  if (parsed.hostname.includes('staging')) {
    fail('WORKER_API_BASE_URL cannot target a staging host.');
  }
  if (parsed.hostname === 'willcodexquotareset.com') {
    fail('The extension cannot target the upstream source directly.');
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    fail('WORKER_API_BASE_URL must be an origin without a path, query, or fragment.');
  }

  return parsed.origin;
}

function validateBuild(files, apiOrigin) {
  const relativeFiles = files.map((file) => file.relativePath);
  if (JSON.stringify(relativeFiles) !== JSON.stringify(allowedFiles)) {
    fail(`unexpected extension build contents: ${relativeFiles.join(', ')}`);
  }

  const manifestPath = path.join(distDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expectedPermission = `${apiOrigin}/*`;
  if (
    !Array.isArray(manifest.host_permissions) ||
    manifest.host_permissions.length !== 1 ||
    manifest.host_permissions[0] !== expectedPermission
  ) {
    fail(`production manifest must contain only host permission ${expectedPermission}`);
  }

  const forbiddenContent = [
    'localhost',
    '127.0.0.1',
    'codex-reset-notifier-staging',
    'willcodexquotareset.com/api/forecast',
    'ADMIN_API_TOKEN',
    'EMAIL_PROVIDER_API_KEY',
  ];
  for (const file of files) {
    const content = fs.readFileSync(file.absolutePath, 'utf8');
    for (const forbidden of forbiddenContent) {
      if (content.includes(forbidden)) {
        fail(`${file.relativePath} contains forbidden release content: ${forbidden}`);
      }
    }
  }
}

function createArchive(files) {
  return new Promise((resolve, reject) => {
    fs.rmSync(outputFile, { force: true });
    const output = fs.createWriteStream(outputFile);
    const archive = new ZipArchive({
      zlib: { level: 9 },
      forceLocalTime: false,
    });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('warning', reject);
    archive.on('error', reject);
    archive.pipe(output);

    for (const file of files) {
      archive.append(fs.readFileSync(file.absolutePath), {
        name: file.relativePath,
        date: fixedZipDate,
        mode: 0o644,
      });
    }

    archive.finalize().catch(reject);
  });
}

function validateArchive(files) {
  const zip = new AdmZip(outputFile);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .sort((a, b) => a.entryName.localeCompare(b.entryName));
  const expectedNames = files.map((file) => file.relativePath);
  const actualNames = entries.map((entry) => entry.entryName);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail(`archive entries differ from validated build output: ${actualNames.join(', ')}`);
  }

  for (const entry of entries) {
    const source = fs.readFileSync(path.join(distDir, ...entry.entryName.split('/')));
    if (!entry.getData().equals(source)) {
      fail(`archive entry differs from build output: ${entry.entryName}`);
    }
  }
}

const apiOrigin = validateApiBaseUrl(process.env.WORKER_API_BASE_URL);
const npmCommand = process.env.npm_execpath ? process.execPath : 'npm';
const npmArgs = process.env.npm_execpath
  ? [process.env.npm_execpath, 'run', 'build', '--workspace', '@codex-reset/extension']
  : ['run', 'build', '--workspace', '@codex-reset/extension'];
const build = spawnSync(npmCommand, npmArgs, {
  cwd: projectDir,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    WORKER_API_BASE_URL: apiOrigin,
  },
  stdio: 'inherit',
});
if (build.error) {
  fail(`could not start production extension build: ${build.error.message}`);
}
if (build.status !== 0) {
  fail(`production extension build failed with exit code ${build.status ?? 1}`);
}

const files = collectFiles(distDir);
validateBuild(files, apiOrigin);
await createArchive(files);
validateArchive(files);

const hash = crypto.createHash('sha256').update(fs.readFileSync(outputFile)).digest('hex');
fs.writeFileSync(checksumFile, `${hash}  ${path.basename(outputFile)}\n`);

console.log(`Created ${outputFile}`);
console.log(`SHA-256: ${hash}`);
console.log(`Checksum file: ${checksumFile}`);
