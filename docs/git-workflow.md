# Git Workflow

The project follows a phase-based branching and review strategy to ensure isolated development, strict scope control, and rigorous verification.

## Branch Naming

Use the format: `phase-<number>-<short-description>`

Examples:

- `phase-1-project-foundation`
- `phase-1a-worker-extension-spike`
- `phase-2-d1-persistence`
- `phase-3-source-snapshots`

## Workflow Steps

1. **Create branch:** Create the phase branch from the main branch before starting implementation.
2. **Implement:** Implement _only_ the approved scope for that specific phase. Do not begin work for subsequent phases.
3. **Verify:** Run the complete verification suite (`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`) locally.
4. **Commit & Push:** Commit the changes and push the phase branch to the remote repository.
5. **Review:** Request review and wait for explicit approval of the phase.
6. **Merge:** Merge the approved phase branch according to the selected repository strategy (e.g., squash and merge).
7. **Next Phase:** Create the next phase branch only after the current phase is fully approved and merged.
