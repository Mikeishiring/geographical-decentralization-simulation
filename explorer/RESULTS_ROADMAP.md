# Results Page Roadmap

The results experience today is strong for viewing individual runs but weak at
cross-scenario analysis, deeper data exploration, and surfacing the rich
per-validator/per-region data that already exists in every simulation output.

This roadmap outlines four directions for improving the results page, ordered
by impact and feasibility.

---

## 1. Multi-Scenario Comparison

**Problem:** Users can only compare one run against one foil. The pre-computed
catalog has 37 scenarios across 7 evaluation families, but there is no way to
overlay 3+ runs or sweep a parameter dimension on a single chart.

### 1a. Parameter Sweep Charts

Show all runs along a single parameter axis in one view.

- **Cost sweep** — Gini/HHI/Liveness on Y, migration cost (0, 0.001, 0.002, 0.003)
  on X, one line per paradigm. All data already exists in the dashboard catalog.
- **Gamma sweep** — same layout, gamma on X (0.33, 0.5, 0.67, 0.8).
- Automatically detect which dimension varies when >2 scenarios share a family.
- Render as small-multiples or overlaid line charts with a shared time axis.

### 1b. Side-by-Side Comparison

Pick 2-4 scenarios from the catalog → render their maps and key metrics in
parallel columns. Each column shows the animated map, KPI strip, and top
regions bar at the same relative slot position.

### 1c. Delta / Difference View

Select a baseline and a variant → show the per-slot difference for every
metric. Highlights where the variant diverges most (e.g., "Gini drops sharply
at slot 400 under cost=0.003 but stays flat under cost=0").

### 1d. Multi-Foil Overlay on Analytics Desk

Extend the existing compare mode from 1 foil to N foils. The analytics desk
already renders overlay/delta modes — generalize to accept an array of
comparison datasets. Each foil gets a distinct color.

**Data requirement:** All data exists. No new simulation runs needed.

**Effort:** 1-2 weeks.

---

## 2. Smarter Copilot

**Problem:** The SimCopilot panel is guidance-only — it can describe what the
user sees but cannot derive new metrics, compute cross-scenario comparisons, or
answer quantitative questions from the raw data.

### 2a. Data-Grounded Copilot Responses

Give the copilot access to the full artifact payload (not just summary scalars)
so it can answer questions like:

- "Which continent gained the most validators between slot 100 and 500?"
  (requires `region_counter_per_slot.json`)
- "What was the peak Gini value and when did it occur?"
  (requires `paper_geography_metrics.json`)
- "How many validators migrated in the first 200 slots vs the last 200?"
  (requires `action_reasons.csv`)

The copilot already receives `PublishedReplayViewerSnapshotContext` with current
slot values. Extend this to include the full timeseries arrays (or sampled
summaries for large payloads) so Claude can compute answers, not just narrate.

### 2b. Copilot-Generated Charts

When the copilot's answer includes a quantitative result, render it as a chart
block rather than plain text. The `BlockCanvas` already supports chart, table,
histogram, scatter, and heatmap block types — the copilot just needs to return
structured block data.

Example flow:
> User: "Compare Gini trajectory across all baseline cost levels"
> Copilot: returns a `chart` block with 4 overlaid lines, pulled from the
> cached catalog data.

### 2c. Expanded Proposed Configs

The copilot currently can only propose 4 config fields (paradigm, distribution,
validators, slots). Extend to include migration cost, attestation threshold,
slot time, and source placement — the full `SimulationConfig` shape.

**Data requirement:** Artifacts already stored; copilot prompt + context
payload needs expansion.

**Effort:** 1-2 weeks.

---

## 3. Hidden Data Surfaces

**Problem:** Every simulation run produces 14+ artifacts, but only 8 are
rendered. The richest per-validator and per-region data is marked
`renderable: false` and never shown.

### 3a. Migration Audit Trail

`action_reasons.csv` records every validator's migration decision at every
migration window: `utility_improved`, `utility_not_improved`,
`migration_cost_high`, `migrating_or_on_cooldown`.

Surface as:
- **Stacked area chart** — proportion of each action type over time. Shows
  whether centralization is driven by high costs blocking migration vs.
  genuine utility advantages in dominant regions.
- **Sankey diagram** — flow of validators between continents over the
  simulation. Which regions are net donors vs. net attractors?

### 3b. Per-Region Profit Trajectories

`region_profits.csv` contains per-region MEV offers and latency at every slot
(~40K rows for a 1000-slot run).

Surface as:
- **Small-multiples line chart** — one sparkline per continent showing
  cumulative MEV captured over time.
- **Profit inequality chart** — Gini of per-region profits (not validators)
  over time. This is the `profit_variance` / CV metric that exists in
  `paper_geography_metrics.json` but isn't wired up as an analytics query.

### 3c. Spatial Topology Metrics

`total_distance`, `avg_nnd` (average nearest-neighbor distance), and `nni`
(nearest-neighbor index) exist in the dashboard data and have color constants
defined in `simulation-evidence-constants.ts` but are not available as
analytics queries.

Surface as:
- New analytics query options: `total_distance`, `avg_nnd`, `nni`.
- These directly answer "are validators clustered or spread out?" which is
  the core decentralization question.

### 3d. Per-Validator Distributions

`proposal_time_by_slot.json` and `attest_by_slot.json` contain per-validator
timing data at every slot (~5M data points for a full run).

Surface as:
- **Box plot / violin per slot** — show the distribution of proposal times,
  not just the average. Reveals whether a few validators dominate or if
  timing is evenly spread.
- **Attestation failure heatmap** — validators on Y, slots on X, color by
  success/failure. Shows if the same validators consistently fail.

These are large datasets. Consider rendering only for a user-selected slot
range, or downsampling (every 10th slot).

### 3e. Information Source Distance

`info_avg_distance` in the dashboard data is a 40-element vector per slot
showing average validator distance from each information source. Never
visualized anywhere.

Surface as:
- **Source proximity chart** — one line per continent showing how far its
  validators are from the nearest information source over time. Directly
  relevant to the source placement evaluation (SE1).

**Data requirement:** All data exists in cache/dashboard. Some artifacts need
`renderable` flipped to `true` and new chart components.

**Effort:** 2-3 weeks for all of 3a-3e. Each sub-item is independent and can
ship incrementally.

---

## 4. Custom Analysis / Notebook Mode

**Problem:** Power users (researchers, Burak's Hex/Dune analogy) want to ask
questions the UI doesn't anticipate — parameter sweeps with custom ranges,
derived metrics, cross-scenario statistical tests.

### 4a. AI-Driven Analysis (Path A — recommended first step)

Extend the copilot to generate and execute Python analysis scripts server-side.
The user describes what they want in natural language, Claude writes a Python
script that runs against cached simulation data, and results render as blocks.

Example:
> "How does Gini coefficient at slot 500 change as migration cost increases
> from 0 to 0.01 in 10 steps?"
> → Claude generates a script that loads 4 cached runs + interpolates,
> returns a chart block.

This avoids the sandboxing and code editor complexity of a full notebook.

**Effort:** 1-2 weeks.

### 4b. Code Editor Mode (Path B — if 4a validates demand)

A Monaco-based code editor page where users write Python directly against the
simulation data. Requires:

- Persistent Python kernel per session (subprocess management)
- Sandboxing (import whitelist or Docker per session)
- Output protocol (JSON with `_type` field → chart/table/text rendering)
- Helper library: `from explorer import load_run, list_runs, plot`
- Session lifecycle (create on tab open, kill on timeout)

**Key constraint:** Running new simulations takes 1s-37min depending on config
size. The notebook experience should focus on analyzing cached results (instant)
with new simulation runs as an async background operation.

**Effort:** 3-4 weeks for a solid v1.

---

## Priority Recommendation

```
Phase 1 (next 2 weeks):
  1a  Parameter sweep charts — highest visual impact, all data exists
  3a  Migration audit trail — answers "why" not just "what"
  3b  Per-region profit trajectories — wires up existing but hidden data

Phase 2 (weeks 3-4):
  1b  Side-by-side comparison
  2a  Data-grounded copilot
  3c  Spatial topology metrics (total_distance, avg_nnd, nni)

Phase 3 (weeks 5-6):
  2b  Copilot-generated charts
  1c  Delta / difference view
  3d  Per-validator distributions (large data, needs downsampling)

Phase 4 (if demand validated):
  4a  AI-driven analysis scripts
  4b  Full notebook mode (only if 4a shows strong usage)
```

---

## Data Inventory: What Exists But Isn't Shown

| Artifact | Size (1K/1K run) | Currently shown? | Roadmap item |
|----------|-----------------|-------------------|--------------|
| `region_counter_per_slot.json` | ~900 KB | No | 2a, 1a |
| `proposal_time_by_slot.json` | ~4 MB | No | 3d |
| `attest_by_slot.json` | ~5 MB | No | 3d |
| `region_profits.csv` | ~2 MB | No | 3b |
| `action_reasons.csv` | ~40 KB | No | 3a |
| `profit_variance` (in paper_geography_metrics) | included | No (not wired as query) | 3b |
| `total_distance` | in dashboard data | No (color defined, no query) | 3c |
| `avg_nnd` / `nni` | in dashboard data | No (color defined, no query) | 3c |
| `info_avg_distance` | in dashboard data | No | 3e |
