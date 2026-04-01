# Study Generator

This app will ingest research papers and produce:

- `study-package.json`
- `validation-report.json`
- `editorial-scorecard.json`

Its job is to generate structured study data, not frontend code.

## Planned responsibilities

- classify papers
- choose the site shape
- extract claims, figures, tables, and datasets
- select and prune surfaces
- validate quality against the shared QA framework

The shared contracts live in [packages/study-schema](/Users/micha/Projects/geographical-decentralization-simulation/packages/study-schema).
