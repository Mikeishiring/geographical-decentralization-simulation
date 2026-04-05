# Study Generator

This app will ingest research papers and produce:

- `study-package.json`
- `validation-report.json`
- `editorial-scorecard.json`
- `assembly-plan.json`
- `project-slot-map.json`
- `explorer-adapter/`

Its job is to generate structured study data plus safe integration scaffolds, not mutate the live frontend directly.

## Planned responsibilities

- classify papers
- choose the site shape
- extract claims, figures, tables, and datasets
- select and prune surfaces
- validate quality against the shared QA framework
- explain how the final website is assembled layer by layer

The shared contracts live in [packages/study-schema](/Users/micha/Projects/geographical-decentralization-simulation/packages/study-schema).

## New assembly-plan artifact

The `assembly-plan` is the missing bridge between "we extracted a study package" and "we know how to spin up a site from it."

It gives the generator a self-describing map of:

- which modules belong in `inputs`, `evidence`, `orchestration`, and `experience`
- what each module depends on
- what it emits
- why it exists or why it is omitted

Use `npm run explain` in `study-generator/` to inspect the layered plan for the golden fixtures.

## Project Slot Map

Use `npm run slots` to inspect where generated pieces land in this repo:

- generator bundle outputs
- explorer adapter scaffolds
- live explorer study-module targets
- server context wiring
- runtime asset paths

This is the repo-aware bridge between "we know the study shape" and "we know which project module should own it."

## Reusable templates

Use `npm run templates` to inspect the spin-up templates for:

- simulation
- empirical-event-study
- empirical-observational
- theory-mechanism
- benchmark-evaluation
- mixed

Each template declares the recommended runtime mode, surfaces, dashboard patterns, artifact kinds, and starter questions for that study class.

## Scaffold command

Use the scaffold command to write a starter study package/module layout:

```bash
cd study-generator
npm run scaffold -- --classification=simulation --title="My New Study"
```

By default this writes to `study-generator/scaffolds/<study-id>/` and produces:

- `study-package.json`
- `study-frame.ts`
- `assembly-plan.json`
- `project-slot-map.json`
- `template.json`
- `README.md`
- `layers/inputs.md`
- `layers/evidence.md`
- `layers/orchestration.md`
- `layers/experience.md`
- `explorer-adapter/README.md`
- `explorer-adapter/study-package.stub.ts`
- `explorer-adapter/sections.stub.ts`
- `explorer-adapter/narratives.stub.ts`
- `explorer-adapter/topic-cards.stub.ts`
- `explorer-adapter/paper-charts.stub.ts`

## Draft From Intake

Use the draft command when you already have a structured paper/data packet and want a first-pass site package instead of a blank scaffold.

```bash
cd study-generator
npm run draft -- --intake=examples/geo-centralization-intake.json
```

The draft flow:

1. Reads the intake packet.
2. Selects a template from explicit classification/template hints or inferred signals.
3. Builds a populated `study-package`.
4. Emits an `assembly-plan`, `validation-report`, and `editorial-scorecard`.
5. Emits a `project-slot-map` plus an `explorer-adapter` handoff bundle.

The output bundle includes:

- `intake.json`
- `study-package.json`
- `study-frame.ts`
- `assembly-plan.json`
- `project-slot-map.json`
- `validation-report.json`
- `editorial-scorecard.json`
- `draft-summary.json`
- `explorer-adapter/`
