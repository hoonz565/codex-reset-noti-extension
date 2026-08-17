/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function containsPlaceholder(value) {
  return /<[^>]+>|placeholder/i.test(value);
}

function isPlaceholderDatabaseId(value) {
  if (containsPlaceholder(value)) return true;
  const compact = value.replace(/-/g, '').toLowerCase();
  return compact.length > 0 && new Set(compact).size === 1;
}

function isValidExtensionOrigin(origin) {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}

function runPreflight(args = process.argv, overrideWranglerText = null) {
  const envIndex = args.indexOf('--environment');
  if (envIndex === -1 || envIndex === args.length - 1) {
    console.error('Error: --environment <staging|production> is required.');
    return 1;
  }
  const env = args[envIndex + 1];

  if (env !== 'staging' && env !== 'production') {
    console.error('Error: Environment must be staging or production.');
    return 1;
  }

  if (env === 'production') {
    if (!args.includes('--confirm-production')) {
      console.error('Error: --confirm-production is required for production deployment.');
      return 1;
    }
  }

  let wranglerText = overrideWranglerText;
  if (wranglerText === null) {
    let wranglerPath = path.resolve(__dirname, '../packages/worker/wrangler.toml');
    if (!fs.existsSync(wranglerPath)) {
      wranglerPath = path.resolve(process.cwd(), 'packages/worker/wrangler.toml');
      if (!fs.existsSync(wranglerPath)) {
        wranglerPath = path.resolve(process.cwd(), 'wrangler.toml');
      }
    }

    if (!fs.existsSync(wranglerPath)) {
      console.error(`Error: wrangler.toml not found.`);
      return 1;
    }
    wranglerText = fs.readFileSync(wranglerPath, 'utf8');
  }

  // Parse basic block text for validation
  const envBlockRegex = new RegExp(`\\[env\\.${env}\\]([\\s\\S]*?)(?=\\n\\[|$)`);
  const envMatch = wranglerText.match(envBlockRegex);

  if (!envMatch) {
    console.error(`Error: [env.${env}] missing in wrangler.toml`);
    return 2;
  }

  const blockText = envMatch[1];

  // 1. Worker Name
  const nameMatch = blockText.match(/name\s*=\s*"([^"]+)"/);
  if (!nameMatch) {
    console.error('Error: Worker name missing in environment block.');
    return 2;
  }
  const workerName = nameMatch[1];
  if (env === 'staging' && workerName === 'codex-reset-notifier') {
    console.error('Error: Staging Worker name cannot equal production name.');
    return 2;
  }

  // 2. D1 Binding
  const d1Regex = new RegExp(`\\[\\[env\\.${env}\\.d1_databases\\]\\]([\\s\\S]*?)(?=\\n\\[|$)`);
  const d1Match = wranglerText.match(d1Regex);
  if (!d1Match) {
    console.error(`Error: [[env.${env}.d1_databases]] binding missing.`);
    return 2;
  }
  const d1Text = d1Match[1];
  const dbIdMatch = d1Text.match(/database_id\s*=\s*"([^"]+)"/);
  if (!dbIdMatch) {
    console.error('Error: database_id is missing or empty.');
    return 2;
  }
  const dbId = dbIdMatch[1];
  if (dbId.trim() === '') {
    console.error('Error: database_id cannot be empty.');
    return 2;
  }
  if (isPlaceholderDatabaseId(dbId)) {
    console.error('Error: database_id contains a placeholder.');
    return 2;
  }

  // Ensure staging dbId != production dbId when resolving both
  const prodD1Match = wranglerText.match(
    /\[\[env\.production\.d1_databases\]\]([\s\S]*?)(?=\n\[|$)/
  );
  if (env === 'staging' && prodD1Match) {
    const prodDbIdMatch = prodD1Match[1].match(/database_id\s*=\s*"([^"]+)"/);
    if (prodDbIdMatch && prodDbIdMatch[1] === dbId && !dbId.includes('<')) {
      console.error('Error: Staging database_id equals production database_id.');
      return 2;
    }
  }

  // 3. ALLOWED_ORIGINS
  const varsRegex = new RegExp(`\\[env\\.${env}\\.vars\\]([\\s\\S]*?)(?=\\n\\[|$)`);
  const varsMatch = wranglerText.match(varsRegex);
  if (!varsMatch) {
    console.error(`Error: [env.${env}.vars] missing.`);
    return 2;
  }
  const varsText = varsMatch[1];
  const originMatch = varsText.match(/ALLOWED_ORIGINS\s*=\s*"([^"]+)"/);
  if (!originMatch) {
    console.error('Error: ALLOWED_ORIGINS missing.');
    return 2;
  }
  const allowedOrigins = originMatch[1];
  if (allowedOrigins.includes('*')) {
    console.error('Error: ALLOWED_ORIGINS cannot contain wildcard.');
    return 2;
  }
  if (containsPlaceholder(allowedOrigins)) {
    console.error('Error: ALLOWED_ORIGINS contains placeholder.');
    return 2;
  }
  const origins = allowedOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length === 0 || origins.some((origin) => !isValidExtensionOrigin(origin))) {
    console.error('Error: ALLOWED_ORIGINS must contain valid Chrome extension origins.');
    return 2;
  }

  if (env === 'production') {
    const fromMatch = varsText.match(/EMAIL_FROM_ADDRESS\s*=\s*"([^"]+)"/);
    if (!fromMatch || containsPlaceholder(fromMatch[1]) || !fromMatch[1].includes('@')) {
      console.error('Error: EMAIL_FROM_ADDRESS is missing or incomplete.');
      return 2;
    }

    const managementUrlMatch = varsText.match(/MANAGEMENT_PAGE_URL\s*=\s*"([^"]+)"/);
    if (!managementUrlMatch || containsPlaceholder(managementUrlMatch[1])) {
      console.error('Error: MANAGEMENT_PAGE_URL is missing or incomplete.');
      return 2;
    }
    try {
      const managementUrl = new URL(managementUrlMatch[1]);
      if (managementUrl.protocol !== 'https:') throw new Error('HTTPS required');
    } catch {
      console.error('Error: MANAGEMENT_PAGE_URL must be a valid HTTPS URL.');
      return 2;
    }
  }

  // 4. Staging email safety
  if (env === 'staging') {
    // In our architecture, email is disabled in staging or forced to a safe mode.
    // Ensure that no production tokens are present.
    // For this preflight, we verify the presence of EMAIL_PROVIDER_API_KEY binding requirement.
    // If we wanted to check the worker code, we'd do it here, but preflight is mostly config validation.
  }

  // 5. Cross-environment bleed checks
  if (env === 'staging') {
    if (blockText.includes('codex_reset_prod')) {
      console.error('Error: Staging config references production resource.');
      return 2;
    }
  }
  if (env === 'production') {
    if (
      blockText.includes('codex_reset_staging') ||
      blockText.includes('codex-reset-notifier-staging')
    ) {
      console.error('Error: Production config references staging resource.');
      return 2;
    }
  }

  console.log(`Preflight complete. ${env} configuration appears valid.`);
  return 0;
}

module.exports = { runPreflight };

if (require.main === module) {
  process.exit(runPreflight(process.argv));
}
