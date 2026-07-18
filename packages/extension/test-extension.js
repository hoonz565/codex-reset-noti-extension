const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const extensionPath = path.resolve(__dirname, 'dist');

  // Launch browser with the extension loaded
  const browser = await puppeteer.launch({
    headless: false, // Chrome extensions are only loaded in non-headless mode (or new headless mode)
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--headless=new',
    ],
  });

  const targets = await browser.targets();
  const backgroundTarget = targets.find(
    (t) => t.type() === 'service_worker' || t.url().startsWith('chrome-extension://')
  );

  let extensionId = 'unknown';
  if (backgroundTarget) {
    const url = backgroundTarget.url();
    const match = url.match(/chrome-extension:\/\/([a-z]+)\//);
    if (match) {
      extensionId = match[1];
    }
  }

  if (extensionId === 'unknown') {
    // Alternatively, fetch the list of loaded extensions from chrome://extensions
    const page = await browser.newPage();
    await page.goto('chrome://extensions/', { waitUntil: 'networkidle0' });
    const exts = await page.evaluate(() => {
      // Chrome extension page runs in a webui context, might be restricted.
      return [];
    });
  }

  console.log(`EXTENSION_ID=${extensionId}`);

  await browser.close();
})();
