# Explorer — AI-Powered Research Paper Interface

Interactive frontend for "Geographical Centralization Resilience in Ethereum's Block-Building Paradigms" (arXiv:2509.21475).

## Quick Start

```bash
cd explorer
npm install
npm run dev          # Frontend on :3200
npx tsx server/index.ts  # API server on :3201 (needs ANTHROPIC_API_KEY in .env)
```

## Current State (Session 6 — 2026-03-31)

### What's Built

**5 tabs:**

| Tab | Page | Status |
|-----|------|--------|
| Paper | `src/pages/PaperReaderPage.tsx` | Complete — 4-view spectrum (Editorial, Focus, Argument Map, Full Text), community note text anchoring |
| Original | `src/pages/OriginalPaperPage.tsx` | Complete — dark mode PDF viewer with annotations |
| Results | `src/pages/SimulationLabPage.tsx` | Complete — config builder, preset system, artifact viewer |
| Agent | `src/pages/AgentLabPage.tsx` | Complete — AI query bar, follow-up chips, tool_use |
| Community | `src/pages/ExploreHistoryPage.tsx` | Complete — gallery, voting, search, sort, tags, anchored notes |

**Server infrastructure:**

| Component | File | What it does |
|-----------|------|-------------|
| API proxy | `server/index.ts` | Express on :3201, Claude tool_use, exploration CRUD, simulation routes |
| Exploration store | `server/exploration-store.ts` | In-memory + JSON persistence, auto-tag extraction, voting |
| Simulation runtime | `server/simulation-runtime.ts` | Job queue, config hashing, Python worker lifecycle |
| Python worker | `server/simulation_worker.py` | Wraps researchers' Mesa simulation, produces manifests |
| Tool catalog | `server/catalog.ts` | Auto-generates Claude tool_use schema from Zod (single source of truth) |
| Study context | `server/study-context.ts` | ~10K token system prompt with paper findings |

**Key patterns:**
- Block types defined once in Zod (`src/types/blocks.ts`), shared between frontend validation and server tool schemas
- React Query for all server state (polling, caching, optimistic updates)
- Web Worker for simulation artifact parsing (off main thread)
- Spring physics animations everywhere (SPRING/SPRING_SOFT from `src/lib/theme.ts`)
- Blueprint dark theme: Canvas #050505, Surface #111111, Accent #3B82F6 (SSP), Warm #d97757 (MSP)

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
┌─────────────────────────────────────────────┐
│ Frontend (Vite :3200)                       │
│                                             │
│  PaperReader (static, 4 views)       │      │
│  OriginalPaper (static PDF viewer)   │      │
│  SimulationLab ──→ /api/simulations ─┐      │
│  AgentLab ──→ /api/explore ──────────┤      │
│  ExploreHistory ──→ /api/explorations│      │
│                                      ▼      │
│  ┌─ Vite proxy /api/* ──→ :3201 ─────┐     │
└──┘                                    │     │
                                        ▼
┌─────────────────────────────────────────────┐
│ Express API Server (:3201)                  │
│                                             │
│  POST /api/explore ──→ Claude Sonnet        │
│    └→ auto-save to ExplorationStore         │
│  GET  /api/explorations ──→ list/search     │
│  POST /api/explorations/:id/vote            │
│  POST /api/simulations ──→ SimulationRuntime│
│    └→ Python worker ──→ Mesa ABM            │
│  GET  /api/simulations/:id                  │
│  GET  /api/simulations/:id/manifest         │
│  GET  /api/simulations/:id/artifacts/:name  │
└─────────────────────────────────────────────┘
```

## File Organization

```
explorer/
├── src/
│   ├── components/
│   │   ├── blocks/          # 9 block renderers + BlockRenderer dispatcher
│   │   ├── explore/         # QueryBar, BlockCanvas, QueryHistory, ShimmerBlock, ErrorDisplay
│   │   ├── paper/           # EditorialView, ArgumentMapView, FullTextView, PaperViewModeBar, PaperSectionView
│   │   ├── community/       # SelectionPopover (text selection → note CTA)
│   │   └── layout/          # Header, TabNav, Footer
│   ├── data/
│   │   ├── default-blocks.ts    # 9 overview blocks + 8 topic cards
│   │   ├── paper-narrative.ts   # Section narratives (lede, paragraphs, pull quotes)
│   │   └── gcp-regions.ts       # 40 GCP region lat/lon lookup
│   ├── hooks/
│   │   └── useTextSelection.ts  # mouseup → TextAnchor + DOMRect for community notes
│   ├── lib/
│   │   ├── api.ts               # Explore + exploration API client
│   │   ├── simulation-api.ts    # Simulation API client
│   │   ├── theme.ts             # SPRING, SPRING_SOFT, BLOCK_COLORS constants
│   │   └── cn.ts                # clsx + tailwind-merge utility
│   ├── pages/                   # 5 page components (PaperReader, Original, Results, Agent, Community)
│   ├── types/
│   │   ├── blocks.ts            # 9 Zod schemas + discriminated union + parseBlocks()
│   │   └── anchors.ts           # TextAnchor type for community note positioning
│   └── workers/                 # Web Worker for artifact parsing
├── server/
│   ├── index.ts                 # Express API proxy
│   ├── catalog.ts               # Auto-generated tool_use schema from Zod
│   ├── exploration-store.ts     # In-memory store + JSON persistence
│   ├── simulation-runtime.ts    # Job queue + Python worker management
│   ├── simulation_worker.py     # Mesa simulation wrapper
│   └── study-context.ts         # Paper knowledge for system prompt
├── PLAN.md                      # Full implementation plan
├── DECISIONS.md                 # D1-D19 architectural decisions
└── UPSTREAM_RECOMMENDATIONS.md  # Suggestions for researchers
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

## Future Work

### Medium-term
- Edge query cache (Vercel KV): hash(query) → cached Block[] response
- Pre-warm 8 example chip queries at deploy time
- "Ask about this section" mini-query bars in DeepDivePage
- NL→config: LLM translates natural language questions to simulation presets

### Long-term (Stage 5)
- Agent-driven autonomous exploration
- Multi-turn agent loop: construct config → run simulation → interpret → follow up
- Dynamic UI specs for novel visualization types beyond the 9-block catalog
- Cost controls and multi-turn conversation state
