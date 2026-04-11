# 🌍 Geographical Decentralization Simulation

This repository contains the simulation and evaluation code for the paper "Geographical Centralization Resilience in Ethereum's Block-Building Paradigms".

## Installation

Please install Python and the dependencies by running the following command:
```bash
pip install -r requirements.txt
```

Run the Python test suite with:
```bash
python -m pytest -q
```

## Evaluations

### Batch Scheduler

If you want to queue several seeds and only start a new `fab run-*` batch after an earlier batch has fully finished, use:

```bash
cd evaluations
fab run-seed-queue --seeds=1,2,3 --max-parallel=2
```

If `tasks` is omitted, all supported evaluation `run-*` tasks will be queued in order. The scheduler keeps at most `2` seed batches running at once. A batch is considered finished only when all tmux panes created by that `fab run-*` task have returned to the shell.

You can also queue multiple evaluation tasks in order:

```bash
cd evaluations
fab run-seed-queue --seeds=1,2 --tasks=run-baseline,run-hetero-both --max-parallel=2
```

Useful options:
- `--poll-interval=30`: check tmux status every 30 seconds.
- `--session-prefix=batch`: prefix for generated tmux session names.
- `--kill-when-done`: automatically kill finished tmux sessions after detection.
- `--latency-std-dev-ratio=0.25`: override the default latency sampling ratio (`0.5`) for every queued run.
- `--latency-std-dev-ratios=0.25,0.5`: queue multiple latency sampling ratios in one batch run.

For plot tasks, passing `--seed=12345` and/or `--latency-std-dev-ratio=0.25` makes the script read from output folders ending in `_latstd_0.25` and `_seed_12345`, and generated figure filenames will also get the same suffixes automatically.

### Baseline

Run the simulation with homogeneous validators and homogeneous information sources.

```bash
cd evaluations
fab run-baseline
fab run-baseline --seed=12345
fab run-baseline --seed=12345 --latency-std-dev-ratio=0.25
fab run-baseline --seed=12345 --latency-std-dev-ratio=0.25,0.5
fab run-baseline --seed=12345 --latency-std-dev-ratio=0.25,0.5 --max-parallel=4
fab run-baseline --seed=25871,25872 --latency-std-dev-ratio=0.2,0.3,0.4,0.6,0.7,0.8 --cost=0.002 --max-parallel=8
fab run-baseline --seed=25871 --latency-std-dev-ratio=0.2,0.3,0.4,0.6,0.7,0.8 --cost=0.002 --max-parallel=8
```

Plot the results.
```bash
cd plot
fab plot-baseline
fab plot-baseline --seed=12345
fab plot-baseline --seed=12345 --latency-std-dev-ratio=0.25
```

### SE 1: Information-Source Placement Effect

Run the simulation with homogeneous validators but heterogeneous information sources. Specifically, we focus on two cases:
- `latency-aligned`: Information sources are placed in regions with low latency (Asia, Europe, and North America).
- `latency-misaligned`: Information sources are placed in regions with high latency (Africa, Oceania, South America).

```bash
cd evaluations
fab run-heterogeneous-information-sources
fab run-heterogeneous-information-sources --seed=12345
```

Plot the results.
```bash
cd evaluations
fab plot-heterogeneous-information-sources
fab plot-heterogeneous-information-sources --seed=12345
```

### SE 2: Validator Distribution Effect
Run the simulation with homogeneous information sources but heterogeneous validators. Specifically, the validators are sampled from the [real-world distribution](https://dune.com/data/dune.rig_ef.validator_metadata).

```bash
cd evaluations
fab run-heterogeneous-validators
fab run-heterogeneous-validators --seed=12345
```

Plot the results.
```bash
cd plot
fab plot-heterogeneous_validators
fab plot-heterogeneous_validators --seed=12345
```

### SE 3: Joint Heterogeneity
Run the simulation with heterogeneous validators and heterogeneous information sources.

```bash
cd evaluations
fab run-hetero-both
fab run-hetero-both --seed=12345
```

Polt the results.
```bash
cd plot
fab plot-hetero-both
fab plot-hetero-both --seed=12345
```

### SE 4: Consensus-Parameter Effect

We also test other settings to further understand how consensus changes would affect geographical decentralization.

#### Attestation Threshold Effect

```bash
# test different \gamma (consensus threshold)
cd evaluations
fab run-different-gammas
fab run-different-gammas --seed=12345

# plot different \gamma (consensus threshold)
fab plot-different-gammas
fab plot-different-gammas --seed=12345
```

#### Shorter Slot Time Effect

```bash
# test eip-7782
cd evaluations
fab run-eip7782 
fab run-eip7782 --seed=12345

# plot eip-7782
cd plot
fab plot-eip7782
fab plot-eip7782 --seed=12345
```

### Other Figures

#### Validator Distribution and Inter-region Internet Latencies 

```bash
cd plot
python3 country_density_plus_continent_latency.py
```

#### Heatmap of Median Latency

```bash
cd plot
python3 latency_heatmap.py
```

#### Marginal Benefit Distribution

```bash
cd plot
python3 marginal_benefit.py
```

#### Experiments with Different Scales

```bash
# plot different-scale
cd plot
fab plot-different-scale
```

#### Migration Costs

```bash
# plot cost
cd plot
fab plot-cost
```

#### Validator Convergence Locus

Two figures on validator convergence are also generated when running `fab plot-baseline` and `fab plot-hetero-both`.

## Explorer App

The Explorer is an interactive web app for exploring the paper, running simulations via the browser, and querying an AI agent about findings.

See [`explorer/CLAUDE.md`](explorer/CLAUDE.md) for detailed architecture and development documentation.

### Explorer Quick Start

```bash
cd explorer
npm install

# Copy and configure environment
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env

# Start dev servers
npm run dev          # Frontend on :3200
npm run dev:api      # API server on :3201
```

### Docker (Production)

```bash
docker build -t geo-decentralization .
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=your_key geo-decentralization
```

### Explorer Architecture

```
┌─────────────────────────────────────────────────────┐
│ Python Simulation (root)                            │
│  simulation.py → Mesa ABM                           │
│  consensus.py  → slot timing, attestation rewards   │
│  models.py     → SSP / MSP paradigm models          │
│  data/         → GCP latency, validator locations    │
│  params/       → YAML scenario configs               │
└─────────────────────┬───────────────────────────────┘
                      │ spawned by simulation worker
                      ▼
┌─────────────────────────────────────────────────────┐
│ Explorer (React + Express)                          │
│                                                     │
│  Paper Reader  — 4-view spectrum + citations        │
│  Results Lab   — config builder + artifact viewer   │
│  Agent Lab     — AI query bar (Claude tool_use)     │
│  Community     — shared explorations + voting       │
│                                                     │
│  Express API (:3201) → Claude Sonnet + Mesa runner  │
└─────────────────────────────────────────────────────┘
```

## Deployment

The Explorer app deploys to [Railway](https://railway.app) via Docker:
- 8 vCPUs, 16 GB RAM
- 5 GB persistent volume for simulation cache
- Health check at `/api/health`

## Citation

```bibtex
@article{geographical-decentralization-2025,
  title={Geographical Centralization Resilience in Ethereum's Block-Building Paradigms},
  year={2025},
  eprint={2509.21475},
  archivePrefix={arXiv}
}
```

## License

[MIT](LICENSE)
