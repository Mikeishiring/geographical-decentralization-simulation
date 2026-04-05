# Study Packages

The explorer is now structured so the website stays stable while the active study is swapped by configuration.

## What belongs in a study package

Each study under this folder should export one `StudyPackage` that owns:

- editorial metadata, claims, artifacts, and dashboards
- paper sections, narratives, and topic cards
- runtime defaults, paper-reference overrides, and published-results wiring
- assistant prompts and study-specific guidance

The server copilot contexts are derived from the active `StudyPackage`, so adding a new paper should not require edits in `explorer/server/index.ts`.

## How to add a new study

1. Create a new study module in this folder that exports a `StudyPackage`.
2. Register it in [index.ts](/Users/micha/Projects/geographical-decentralization-simulation/explorer/src/studies/index.ts).
3. Point both `STUDY_ID` and `VITE_STUDY_ID` at the new package id in [explorer/.env.example](/Users/micha/Projects/geographical-decentralization-simulation/explorer/.env.example) or your real `.env`.
4. Keep raw datasets, published replay assets, and source references attached to the package instead of hardcoding them in server routes.

## Packaging rules

- Treat `packages/study-schema` as the contract for reusable study structure.
- Keep study-specific interpretation in `assistant.systemPromptSupplement` so the same package can drive the Paper, Results, and copilot surfaces.
- Preserve current surface ids and runtime adapter semantics unless the schema is extended deliberately.
- Prefer adding a new study package over branching the website code for each paper.
