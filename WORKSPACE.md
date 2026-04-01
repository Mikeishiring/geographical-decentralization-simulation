# Workspace Layout

This repository now has a light workspace split between:

- `explorer/`: the renderer and runtime for research sites
- `study-generator/`: the future paper-to-study-package generator
- `packages/study-schema/`: shared schema and QA primitives

The current Explorer remains in place to avoid breaking deployment paths, Docker paths, and existing docs. The split is real at the package level, but migration to `apps/explorer` can happen later once the generator stabilizes.

## Intended responsibilities

### `explorer/`

- render `StudyPackage` data
- host the paper/dashboard/agent/community UX
- run any exact study runtime adapters that belong to the published site

### `study-generator/`

- ingest paper PDFs, HTML, datasets, figures, and notes
- classify the paper
- choose the site shape
- emit `study-package`, `validation-report`, and `editorial-scorecard`

### `packages/study-schema/`

- shared schema types
- quality/validation contracts
- classification and surface-selection primitives

## Near-term migration path

1. Keep Explorer stable.
2. Move all shared types and QA rules into `packages/study-schema`.
3. Build the generator against the shared schema.
4. Only move `explorer/` to `apps/explorer/` once deployment and docs are ready for the path change.
