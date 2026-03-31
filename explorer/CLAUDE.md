# Explorer — AI-Powered Research Paper Interface

Interactive frontend for "Geographical Centralization Resilience in Ethereum's Block-Building Paradigms" (arXiv:2509.21475).

## Quick Start

```bash
cd explorer
npm install
npm run dev          # Frontend on :3200
npx tsx server/index.ts  # API server on :3201 (needs ANTHROPIC_API_KEY in .env)
```

## Repository Structure (Two Layers)

### Layer 1: Python Simulation (root)
Mesa agent-based model simulating Ethereum consensus with geographical latency.

| File | Purpose |
|------|---------|
| `simulation.py` | Main simulation entry point |
| `consensus.py` | ConsensusSettings — slot timing, attestation thresholds, reward weights |
| `models.py` | Mesa model definitions |
| `validator_agent.py` | Validator agent behavior |
| `source_agent.py` | Block source agent |
| `distribution.py` | Geographical distribution logic |
| `measure.py` | Simulation measurement/metrics |
| `constants.py` | Protocol constants (slot duration, rewards) |
| `preprocess_data.py` | Data preprocessing pipeline |
| `visualization.py` | Matplotlib visualization |
| `data/` | GCP latency CSVs, validator data, GeoJSON |
| `params/` | YAML configs: SSP/MSP baselines, latency-aligned/misaligned scenarios |
| `analysis/` | Post-hoc analysis scripts (trend, comparison, empirical) |
| `plot/` | Publication-quality figure generation |
| `figure/` | Generated PDFs (latency heatmaps, continent comparisons, marginal benefit) |
| `.benchmarks/` | Archived pre-optimization simulation snapshots |

### Layer 2: Explorer Frontend (`explorer/`)
React + Express app wrapping the simulation with AI-powered paper exploration.

## Current State (2026-03-31)

### What's Built

**5 pages:**

| Tab | Page | Status |
|-----|------|--------|
| Paper | `PaperReaderPage.tsx` | Complete — 4-view spectrum (Editorial, Focus, Argument Map, Original PDF), community note text anchoring, citation cross-links |
| Results | `SimulationLabPage.tsx` | Complete — config builder, preset system, artifact viewer, analytics desk |
| Agent | `AgentLabPage.tsx` | Complete — AI query bar, follow-up chips, tool_use |
| Community | `ExploreHistoryPage.tsx` | Complete — gallery, voting, search, sort, tags, anchored notes |
| Deep Dive | `DeepDivePage.tsx` | Complete — section-level paper exploration |

**Server infrastructure:**

| Component | File | What it does |
|-----------|------|-------------|
| API proxy | `server/index.ts` | Express on :3201, Claude tool_use, exploration CRUD, simulation routes |
| Exploration store | `server/exploration-store.ts` | In-memory + JSON persistence, auto-tag extraction, voting |
| Simulation runtime | `server/simulation-runtime.ts` | Job queue, config hashing, Python worker lifecycle |
| Python worker | `server/simulation_worker.py` | Wraps researchers' Mesa simulation, produces manifests |
| Tool catalog | `server/catalog.ts` | Auto-generates Claude tool_use schema from Zod (single source of truth) |
| Study context | `server/study-context.ts` | ~10K token system prompt with paper findings |
| Agent loop | `server/agent-loop-*.ts` | Orchestrator, store, types for multi-turn agent execution |

**Frontend component domains:**

| Directory | Contents |
|-----------|----------|
| `components/blocks/` | 9 block renderers + BlockRenderer dispatcher |
| `components/explore/` | QueryBar, BlockCanvas, QueryHistory, ShimmerBlock |
| `components/paper/` | EditorialView, ArgumentMapView, FullTextView, CommunityPreview |
| `components/community/` | SelectionPopover, InlineSectionNotes |
| `components/simulation/` | SimConfigPanel, SimResultsPanel, analytics desk, published replay |
| `components/agent/` | AgentStepCard, AgentConfigReview, AgentCostBar |
| `components/decorative/` | GlobeWireframe, NodeConstellation, NodeArc |
| `components/layout/` | Header, TabNav, Footer |

**Key patterns:**
- Block types defined once in Zod (`src/types/blocks.ts`), shared between frontend validation and server tool schemas
- React Query for all server state (polling, caching, optimistic updates)
- Web Worker for simulation artifact parsing (off main thread)
- Spring physics animations everywhere (SPRING/SPRING_SOFT from `src/lib/theme.ts`)
- Blueprint dark theme: Canvas #050505, Surface #111111, Accent #3B82F6 (SSP), Warm #d97757 (MSP)
- Source provenance pills: fidelity spectrum (Exact → Derived → Interpreted → Speculative)
- Citation pills with arXiv cross-links

### Phase Completion

| Phase | Goal | Status |
|-------|------|--------|
| 1. Block catalog + static findings | Visual design, 9 block types, topic cards | ✅ Done |
| 2. LLM exploration | Claude tool_use, query bar, shimmer loading | ✅ Done |
| 3. Deep Dive + Simulation Lab | Paper sections, config builder, artifact rendering | ✅ Done |
| 4. Community + polish | Exploration pool, voting, URL sharing, rate limiting | ✅ Done |
| 5. Agent-driven exploration | Autonomous multi-turn agent loop | 🔲 Deferred |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Python Simulation (root)                                     │
│  simulation.py → Mesa ABM (validators, sources, consensus)   │
│  params/*.yaml → scenario configs (SSP/MSP baselines)        │
│  data/*.csv → GCP latency, validator locations               │
└──────────────────────┬───────────────────────────────────────┘
                       │ spawned by server/simulation_worker.py
                       ▼
┌──────────────────────────────────────────────────────────────┐
│ Explorer Frontend (Vite :3200)                               │
│                                                              │
│  PaperReader (static, 4 views)                               │
│  DeepDive (section narratives)                               │
│  SimulationLab ──→ /api/simulations ─┐                       │
│  AgentLab ──→ /api/explore ──────────┤                       │
│  ExploreHistory ──→ /api/explorations│                       │
│                                      ▼                       │
│  ┌─ Vite proxy /api/* ──→ :3201 ─────┐                      │
└──┘                                    │                      │
                                        ▼
┌──────────────────────────────────────────────────────────────┐
│ Express API Server (:3201)                                   │
│                                                              │
│  POST /api/explore ──→ Claude Sonnet (tool_use)              │
│    └→ auto-save to ExplorationStore                          │
│  GET  /api/explorations ──→ list/search                      │
│  POST /api/explorations/:id/vote                             │
│  POST /api/simulations ──→ SimulationRuntime                 │
│    └→ Python worker ──→ Mesa ABM (root simulation)           │
│  GET  /api/simulations/:id                                   │
│  GET  /api/simulations/:id/manifest                          │
│  GET  /api/simulations/:id/artifacts/:name                   │
└──────────────────────────────────────────────────────────────┘

Deployment: Railway (Dockerfile at root)
```

## Key Decisions

- **D1**: Static blocks for default view (zero API cost on page load)
- **D2**: Claude Sonnet for queries (balance of speed + reasoning quality)
- **D3**: Prompt caching with `cache_control: ephemeral` (90% input cost reduction)
- **D8**: Temperature 0 (deterministic for caching + reproducibility)
- **D11**: Three-tier gatekeeping (topic cards → community pool → fresh Claude call)
- **D13**: 9 atomic tool primitives (not monolithic render_blocks)
- **D18**: Blocks are immutable snapshots. Explorations have full CRUD.

See `DECISIONS.md` for full decision log (D1-D19).

## Development Rules

- Immutable patterns only (spread, never mutate state)
- Files <800 lines, functions <50 lines
- Tailwind only (no CSS modules), cn() for conditional classes
- Spring physics for all animations (no ease/linear)
- React Query for all server state (no useState for API data)
- Zod at boundaries for runtime validation
- No console.log in committed code

## Security Notes

- **NEVER commit `.env` files** — `.gitignore` covers them but be vigilant
- Anthropic API key goes in `explorer/.env` only (see `.env.example`)
- Repo is currently PRIVATE — see "Open-Sourcing Checklist" before making public

## TODO — Before Open-Sourcing

### Critical (Blockers)
- [ ] Audit full git history for any leaked secrets (`git log -S`, BFG Repo-Cleaner or `git filter-repo`)
- [ ] Decision: fork to clean repo vs. rewrite history on current repo
- [ ] Remove or redact any confidential research data not meant for public release
- [ ] Ensure all `.env.example` files have only placeholder values (currently OK)
- [ ] Add LICENSE file (choose: MIT, Apache-2.0, or academic)
- [ ] Rotate any API keys that may have been exposed during development

### Before Public Release
- [ ] Write root README.md (project overview, paper link, setup instructions)
- [ ] Add CONTRIBUTING.md with dev setup, PR conventions
- [ ] Pin dependency versions in `package.json` and `requirements.txt`
- [ ] Create `requirements.txt` or `pyproject.toml` for Python simulation deps (Mesa, etc.)
- [ ] Remove `.benchmarks/` directory or confirm it's meant to be public
- [ ] Review `dashboard/` directory — appears to be legacy Dash app, remove if unused
- [ ] Remove `.claude/worktrees/` from repo if present

### Nice-to-have
- [ ] CI pipeline (GitHub Actions: lint, type-check, build)
- [ ] Docker Compose for local dev (frontend + API + simulation)
- [ ] Pre-commit hooks for secret scanning
- [ ] Edge query cache (Vercel KV): hash(query) → cached Block[] response
- [ ] Pre-warm example chip queries at deploy time
- [ ] NL→config: LLM translates natural language to simulation presets

## Future Work

### Medium-term
- "Ask about this section" mini-query bars in DeepDivePage
- Edge query cache (Vercel KV): hash(query) → cached Block[] response
- NL→config: LLM translates natural language questions to simulation presets
- Improve simulation analytics desk with comparison views

### Long-term (Stage 5)
- Agent-driven autonomous exploration
- Multi-turn agent loop: construct config → run simulation → interpret → follow up
- Dynamic UI specs for novel visualization types beyond the 9-block catalog
- Cost controls and multi-turn conversation state
