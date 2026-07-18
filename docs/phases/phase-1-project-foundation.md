# Phase 1: Project Foundation

## 1. Objective

Initialize the monorepo structure with npm workspaces, configuring TypeScript, linting, formatting, and testing to provide a reproducible build environment.

## 2. In scope

- Setting up `packages/shared`, `packages/worker`, and `packages/extension`.
- Configuring `package-lock.json`, ESLint, Prettier, and Vitest.
- Establishing shared domain schemas (Zod) and API contracts.

## 3. Out of scope

- Database persistence (D1).
- Extension UI functionality.
- Upstream source fetching.

## 4. Inputs/dependencies

- Phase 0.5 architecture and schema definitions.

## 5. Outputs/artifacts

- Functional monorepo with `npm run build`, `lint`, `format:check`, `typecheck`, and `test` commands.
- `packages/shared` with exported types, constants, and Zod schemas.

## 6. Important domain rules

- All packages must build independently but share strict TypeScript contracts from the `shared` workspace.

## 7. Required tests

- Zod schema validation tests in `packages/shared/tests/`.

## 8. Acceptance criteria

- Clean fail-fast execution of the global suite.
- Exact two-alert MVP schemas are codified without `probability90` or `RESET_COMPLETED` subscriber event.

## 9. Current status

APPROVED

## 10. Suggested Git branch

`phase-1-project-foundation`

## 11. Completion evidence or links to reports

- `package.json` workspaces configured.
- `packages/shared` implementation passes all tests.

## 12. Risks and unresolved questions

- None.
