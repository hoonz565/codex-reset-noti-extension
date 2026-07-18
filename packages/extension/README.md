# Extension ID Management

## Development Extension ID

During local development, Chrome dynamically assigns an Extension ID when you click "Load unpacked".
We ensure this ID is completely **stable and deterministic** using **Option B**: Chrome's inherent directory-hash mechanism.

Chrome generates an unpacked extension ID by computing a SHA-256 hash of the exact **absolute directory path** of the extension on disk (using UTF-16LE encoding), extracting the first 16 bytes, and mapping the hex characters (0-9 -> a-j, a-f -> k-p).

Because the workspace path (e.g., `D:\codex-reset\packages\extension\dist`) does not change between rebuilds or reloads, the resulting Extension ID remains exactly the same.
For example, for this workspace, the ID is deterministically `ljbjnnpmhdcmbadkcedoenjpkplddfpc`. Rebuilding the extension (`npm run build`) simply updates the files inside `dist/`, keeping the directory path identical.

## Production Extension ID

The development Extension ID must **never** be conflated with the production ID.
The production Extension ID is assigned uniquely by the Chrome Web Store upon publishing.

Our Wrangler `ALLOWED_ORIGINS` environment variables cleanly separate these concerns:
- **Local/Dev:** Uses the deterministically generated unpacked ID.
- **Production:** Uses the actual Chrome Web Store ID (added post-MVP).

`installationId` is purely an untrusted field in the POST body to differentiate subscription devices; it is fundamentally unrelated to CORS origin checks.
