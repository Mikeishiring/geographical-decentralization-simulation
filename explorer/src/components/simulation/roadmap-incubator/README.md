# Roadmap Incubator

This folder stages roadmap work that is intentionally not wired into the live
results surfaces yet.

## Coverage

- `PublishedScenarioSweepPanel.tsx`
  - Roadmap `1a`
  - Published parameter-sweep charts across frozen family datasets.
- `PublishedSideBySideIncubator.tsx`
  - Roadmap `1b`
  - Synchronized 2-4 column replay comparison.
- `PublishedDeltaIncubator.tsx`
  - Roadmap `1c`
  - Baseline/variant delta workstation for aligned metric gaps.
- `PublishedMultiFoilOverlayIncubator.tsx`
  - Roadmap `1d`
  - N-foil analytics overlay staging.
- `CopilotGroundingIncubator.tsx`
  - Roadmap `2a`, `2b`, `2c`
  - Full grounding packets, generated block previews, and expanded configs.
- `ExactHiddenDataIncubator.tsx`
  - Roadmap `3a`, `3b`, `3c`, `3d`, `3e`
  - Hidden exact-run artifact surfaces.
- `CustomAnalysisNotebookIncubator.tsx`
  - Roadmap `4a`, `4b`
  - Dormant custom-analysis recipes and notebook-mode contracts.

## Shared helpers

- `csvArtifacts.ts`
  - Parsers for dormant exact-run artifacts and frozen payloads.
- `buildRoadmapIncubatorBlocks.ts`
  - Block builders for hidden exact-run data surfaces.
- `copilotGrounding.ts`
  - Grounding packet builders for exact and published copilot extensions.
- `analysisWorkbench.ts`
  - Hidden analysis-recipe and notebook-session builders for phase 4.

## Activation notes

- None of these modules should be imported by the live results UI until the
  activation pass starts.
- Preferred activation order still follows `explorer/RESULTS_ROADMAP.md`.
- When activation begins, wire one incubator module at a time into the live
  surface and keep the dormant source intact until the replacement is stable.
