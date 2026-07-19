Set-Location "packages/shared"
npx vitest run --reporter=json --outputFile=verification-results.json
Set-Location "../../packages/extension"
npx vitest run --reporter=json --outputFile=verification-results.json
Set-Location "../../packages/worker"
npx vitest run --reporter=json --outputFile=verification-results.json
Set-Location "../.."
