/* global process, console */
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const outdir = 'dist';
const isProd = process.env.NODE_ENV === 'production';
const configuredApiUrl = process.env.WORKER_API_BASE_URL;
let apiUrl = configuredApiUrl;
let apiOrigin;

if (isProd) {
  if (!apiUrl) {
    console.error('ERROR: WORKER_API_BASE_URL is required for production builds.');
    process.exit(1);
  }
  if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
    console.error('ERROR: WORKER_API_BASE_URL cannot be localhost in production.');
    process.exit(1);
  }

  try {
    const parsedApiUrl = new URL(apiUrl);
    if (parsedApiUrl.protocol !== 'https:') {
      throw new Error('production API URL must use HTTPS');
    }
    apiOrigin = parsedApiUrl.origin;
    apiUrl = apiUrl.replace(/\/$/, '');
  } catch (error) {
    console.error(`ERROR: Invalid WORKER_API_BASE_URL: ${error.message}`);
    process.exit(1);
  }
}

const safeApiUrl = apiUrl || 'http://localhost:8787';

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

// Read and process manifest
const manifestPath = path.join(process.cwd(), 'manifest.json');
const manifestStr = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestStr);

if (isProd) {
  manifest.host_permissions = [`${apiOrigin}/*`];
}

fs.writeFileSync(path.join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2));

fs.copyFileSync(path.join(process.cwd(), 'src', 'popup.html'), path.join(outdir, 'popup.html'));

// If there's a popup.css, copy it too
if (fs.existsSync(path.join(process.cwd(), 'src', 'popup.css'))) {
  fs.copyFileSync(path.join(process.cwd(), 'src', 'popup.css'), path.join(outdir, 'popup.css'));
}

await esbuild.build({
  entryPoints: ['src/popup.ts'],
  bundle: true,
  minify: isProd,
  legalComments: 'none',
  sourcemap: false,
  outfile: path.join(outdir, 'popup.js'),
  define: {
    'process.env.WORKER_API_BASE_URL': JSON.stringify(safeApiUrl),
  },
});
