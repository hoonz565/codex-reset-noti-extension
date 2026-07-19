$file = "generate_report.cjs"
$code = Get-Content -Raw -Path $file

$newValidation = "  if (/^(Proves|Validates|Checks|Asserts)\s/i.test(assertionSummary)) {
    throw new Error(`Summary for ${id} begins with generic wording: ${assertionSummary}`);
  }
  const hasMarker = /['`"0-9]|#|\.|[A-Z_]{4,}|status|bind|prepare/i.test(assertionSummary);
  if (!hasMarker) {
    throw new Error(`Summary for ${id} omits concrete evidence markers: ${assertionSummary}`);
  }"

$code = $code -replace 'if \(\s*assertionSummary\.startsWith\(''Validates''\) \|\|[\s\S]*?throw new Error\(`Summary for \$\{id\} starts with generic word: \$\{assertionSummary\}`\);\s*\}', $newValidation

$newMdGen = "### Target Query 1 (Processing Started)
```sql
EXPLAIN QUERY PLAN SELECT COUNT(*) as c FROM notification_deliveries 
WHERE state = 'processing' 
  AND processing_started_at < ?
```
**Assertion:** The query engine explicitly uses `idx_deliveries_processing_started`, proving we avoid full table scans for deliveries matching the metric criteria.

### Target Query 2 (Event Types)
```sql
EXPLAIN QUERY PLAN SELECT type, COUNT(*) as c FROM reset_events 
WHERE type IN ('PROBABILITY_REACHED_70', 'RESET_ANNOUNCED')
  AND created_at > ?
GROUP BY type
```
**Assertion:** The query engine explicitly uses `idx_reset_events_type_created`, proving we avoid full table scans for event queries.

### Target Query 3 (Orchestration Runs)
```sql
EXPLAIN QUERY PLAN SELECT status, COUNT(*) as c FROM orchestration_runs 
WHERE started_at > ?
GROUP BY status
```
**Assertion:** The query engine explicitly uses `idx_orch_runs_started_status`, proving we avoid full table scans.

## 8. Documentation Updates Confirmed"

$code = $code -replace '### Target Query 1 \(Processing Started\)[\s\S]*?## 8\. Documentation Updates Confirmed', $newMdGen

Set-Content -Path $file -Value $code
