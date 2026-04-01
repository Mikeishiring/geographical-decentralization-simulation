# Study Generation QA Framework

This document defines the quality bar for any research-paper website generated on top of the Explorer.

The standard is not "produce an attractive site." The standard is:

- adapt the site to the paper
- ground every important claim
- use existing components only when they fit the paper
- remove components that imply evidence or interactivity the paper does not support
- fail closed when support is weak

The typed foundation for this framework lives in [quality.ts](/Users/micha/Projects/geographical-decentralization-simulation/explorer/src/studies/quality.ts).

## Philosophy

High standard comes from gates, not vibes.

Core principles:

- Truth over completeness: omit weak material instead of smoothing it into the narrative.
- Evidence before interface: the evidence structure determines the site shape.
- Paper-adaptive composition: do not force every paper into the same tab set.
- Renderer is stable, study package is variable.
- Validation is required before publish.

## Required Artifacts

Every generated study should produce three outputs in addition to the study package:

1. `study-package.json`
2. `validation-report.json`
3. `editorial-scorecard.json`

These outputs can be JSON, TS-backed data, or both, but they must exist conceptually and be reviewable.

## Generation Stages

### 1. Classify the paper

Each paper must be assigned one classification:

- `simulation`
- `empirical-event-study`
- `empirical-observational`
- `theory-mechanism`
- `benchmark-evaluation`
- `mixed`

This choice determines:

- which surfaces are recommended
- which surfaces are disallowed
- what quality thresholds apply
- what kinds of claims require extra caution

### 2. Select surfaces

Surface selection is driven by the evidence structure, not by the current website default.

Recommended surfaces by class:

- `simulation`: `paper`, `deep-dive`, `results`, `simulation-lab`, `agent`
- `empirical-event-study`: `paper`, `deep-dive`, `dashboard`, `agent`
- `empirical-observational`: `paper`, `deep-dive`, `dashboard`, `agent`
- `theory-mechanism`: `paper`, `deep-dive`, `agent`
- `benchmark-evaluation`: `paper`, `deep-dive`, `results`, `agent`
- `mixed`: `paper`, `deep-dive`, `results`, `dashboard`, `agent`

Disallowed without a real runtime:

- `simulation-lab`

If a surface is omitted, the generator must record an omission reason.

Allowed omission reasons:

- `not-supported-by-sources`
- `no-usable-artifact`
- `duplicate-of-stronger-surface`
- `implies-false-interactivity`
- `weak-component-fit`
- `visual-noise`

### 3. Build content from evidence

The generator may create:

- metadata
- sections
- narratives
- topic cards
- figures
- dashboards
- prompt context
- runtime presets

But every generated unit must trace back to sources or data artifacts.

The generator should never:

- invent a dashboard because dashboards are expected
- keep map or simulation components when they do not fit
- use agent prose to fill evidence gaps
- imply causality stronger than the paper supports

### 4. Validate

All study packages must pass the required gates listed below.

### 5. Score

Passing validation is necessary but not sufficient. The study must also meet the editorial score thresholds for its paper class.

## Validation Gates

Every generated study must pass all of these:

### `sources-attached`

Checks:

- every visible claim has source anchors
- every source reference resolves
- all external links are valid or intentionally omitted

Fail examples:

- uncited summary text
- a topic card with no backing claims
- a recommendation card with no source context

### `claims-grounded`

Checks:

- claims are labeled as direct, paraphrase, derived, or inference
- no unsupported quantitative claim is rendered as fact
- unknown distributions or unattributed effects are explicitly bounded

Fail examples:

- "Kairos captured X%" when the paper does not identify that split
- "this proves" when the paper only suggests

### `charts-grounded`

Checks:

- each chart maps to a dataset, table, or figure
- axes and units come from source material
- replays are labeled as replays when not derived from raw data

Fail examples:

- synthetic dashboard charts with no artifact source
- inferred metrics displayed as measured variables

### `surfaces-justified`

Checks:

- each tab/surface answers a distinct question
- each surface exists because the paper supports it

Fail examples:

- a simulation lab on a purely observational paper
- a dashboard tab that duplicates the paper reader

### `runtime-honest`

Checks:

- runtime controls exist only if backed by an actual executable/runtime adapter
- presets match supported runtime parameters

Fail examples:

- fake toggles for re-running event-study regressions
- simulation controls for a static paper

### `recommendations-labeled`

Checks:

- recommendations are clearly marked as implications, discussion items, or paper proposals
- no recommendation is framed as validated by the paper unless it is

Fail examples:

- "dynamic reserve price fixes the mechanism"
- "the protocol should adopt X" when the paper only outlines it

### `component-pruning`

Checks:

- components with weak evidence fit are removed
- the paper is not overloaded with legacy UI

Fail examples:

- geography maps for a non-spatial paper
- community or appendix sections that add no value

### `duplication-check`

Checks:

- no two surfaces say the same thing with different wording
- charts and narrative are complementary rather than repetitive

Fail examples:

- a topic card, overview block, and dashboard hero all restating the same claim

## Editorial Scorecard

Each generated study gets a 0-10 score in these dimensions:

- `truthfulness`
- `evidence-density`
- `component-fit`
- `narrative-clarity`
- `visual-usefulness`
- `pruning-discipline`
- `terminology-accuracy`
- `interaction-usefulness`

### Minimum thresholds

Thresholds vary by paper class and are defined in [quality.ts](/Users/micha/Projects/geographical-decentralization-simulation/explorer/src/studies/quality.ts).

In general:

- overall score should be above 8
- every individual dimension should clear a per-dimension floor
- low average is not acceptable if one critical dimension fails

Hard rule:

- a study that fails `truthfulness` or `component-fit` should not publish, even if the average score is high

## Paper-Type Standards

### Simulation papers

Priority dimensions:

- truthfulness
- runtime-honesty
- visual-usefulness
- interaction-usefulness

Specific checks:

- do presets match the paper setup
- are runtime controls real
- are exact outputs clearly separated from interpretation

### Empirical event-study papers

Priority dimensions:

- truthfulness
- evidence-density
- narrative-clarity
- pruning-discipline

Specific checks:

- are pre/post regimes legible
- is event timing clearly annotated
- is causal language restrained
- is the dashboard built around actual observables

### Theory / mechanism papers

Priority dimensions:

- terminology-accuracy
- narrative-clarity
- component-fit

Specific checks:

- avoid fake empirical dashboards
- prefer diagrams, tables, equations, and structured claims
- keep interactions minimal and purposeful

## Review Requirements

The generator must emit a short justification bundle:

- why this paper was classified this way
- which surfaces were included
- which surfaces were omitted and why
- which claims are low confidence
- which charts are figure replays versus raw-data views

This should make reviewer attention narrow and high-value.

## Example: Event Study Paper

For a paper like an auction event study:

- keep `paper`, `deep-dive`, `dashboard`, `agent`
- remove `simulation-lab`
- organize around pre/post comparison, event window, demand vs payment mismatch, surplus shift, and design implications
- explicitly mark unidentified distributions as unknown

This is the standard the generator should meet before it is considered publishable.
