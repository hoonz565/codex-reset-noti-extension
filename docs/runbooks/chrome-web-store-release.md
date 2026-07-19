# Chrome Web Store Release Runbook

## Overview

Procedure for packaging and releasing the Chrome Extension to the Chrome Web Store.

## 1. Prepare Package

Run the packaging script to generate a deterministic ZIP:

```bash
npm run package:extension
```

The script outputs `extension-release.zip` and a SHA-256 checksum.

## 2. Pre-flight Checklist

- `manifest.json` version has been bumped.
- Minimum required permissions only.
- Extension explicitly targets the production Worker URL.
- No `localhost` or staging URLs in the package.
- No source maps (`.map`) or test files (`.test.ts`) in the ZIP.
- No secrets or keys in the ZIP.

## 3. Store Listing Assets

Ensure the following are ready:

- 128x128 Icon
- Promotional tile
- Privacy policy URL
- Privacy disclosures (explaining why `storage` or `alarms` are needed).

## 4. Submission

1. Log into the Chrome Developer Dashboard.
2. Select the extension.
3. Upload `extension-release.zip`.
4. Submit for review.

## 5. Review & Rejection Handling

If rejected:

- Review the Google rejection reason.
- Address the exact feedback without introducing new features.
- Repackage and resubmit.
