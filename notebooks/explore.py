"""Geographical Decentralization Explorer — Marimo Notebook MVP

Run with: marimo run notebooks/explore.py
Edit with: marimo edit notebooks/explore.py
"""

import marimo

__generated_with = "0.13.0"
app = marimo.App(width="medium", app_title="Geo-Decentralization Explorer")


@app.cell
def _():
    import marimo as mo

    mo.md(
        """
        # Geographical Decentralization Explorer

        Interactive simulation of validator migration under MEV incentives.
        Adjust the parameters below and click **Run simulation** to see how
        geography, cost, and paradigm affect decentralization metrics.
        """
    )
    return (mo,)


@app.cell
def _(mo):
    paradigm = mo.ui.dropdown(
        options={"External (SSP)": "SSP", "Local (MSP)": "MSP"},
        value="SSP",
        label="Paradigm",
    )
    num_validators = mo.ui.slider(
        start=50, stop=1000, step=50, value=200, label="Validators"
    )
    num_slots = mo.ui.slider(
        start=100, stop=2000, step=100, value=500, label="Slots"
    )
    migration_cost = mo.ui.slider(
        start=0.0, stop=0.01, step=0.001, value=0.002, label="Migration cost"
    )
    seed = mo.ui.number(start=0, stop=99999, value=25873, label="Seed")

    mo.hstack(
        [paradigm, num_validators, num_slots, migration_cost, seed],
        justify="start",
        gap=1,
    )
    return migration_cost, num_slots, num_validators, paradigm, seed


@app.cell
def _(mo, migration_cost, num_slots, num_validators, paradigm, seed):
    run_button = mo.ui.run_button(label="Run simulation")

    mo.hstack(
        [
            run_button,
            mo.md(
                f"**Config:** {paradigm.value} | {num_validators.value} validators | "
                f"{num_slots.value} slots | cost={migration_cost.value} | seed={seed.value}"
            ),
        ],
        justify="start",
        gap=1,
    )
    return (run_button,)


@app.cell
def _(run_button, paradigm, num_validators, num_slots, migration_cost, seed):
    import sys
    import os
    import time
    from pathlib import Path

    # Only run when button is clicked
    run_button.value

    # Setup paths — notebook lives in repo/notebooks/
    REPO_ROOT = Path(__file__).resolve().parent.parent
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))
    os.chdir(REPO_ROOT)

    import numpy as np
    import pandas as pd
    import random
    import yaml

    from consensus import ConsensusSettings
    from distribution import parse_gcp_latency
    from simulation import (
        DEFAULT_SIMULATION_SEED,
        build_export_payloads,
        homogeneous_validators,
        random_validators,
        simulation as run_simulation,
    )
    from source_agent import initialize_relays, initialize_signals

    # Load data
    gcp_regions = pd.read_csv(REPO_ROOT / "data" / "gcp_regions.csv").copy()
    gcp_regions["gcp_region"] = gcp_regions["Region"]
    gcp_regions["lat"] = gcp_regions["Nearest City Latitude"]
    gcp_regions["lon"] = gcp_regions["Nearest City Longitude"]
    raw_latency = pd.read_csv(REPO_ROOT / "data" / "gcp_latency.csv")
    gcp_latency = parse_gcp_latency(raw_latency.copy())

    # Load template config for relay/signal profiles + consensus settings
    template_key = paradigm.value
    template_path = REPO_ROOT / "params" / f"{template_key}-baseline.yaml"
    with template_path.open("r") as f:
        template = yaml.safe_load(f)

    consensus_settings = ConsensusSettings(**template.get("consensus_settings", {}))

    # Build relay + signal profiles from template
    relay_profiles = initialize_relays(template.get("relay_profiles", []))
    signal_profiles = initialize_signals(template.get("signal_profiles", []))

    # Generate validators (evenly distributed across macro-regions)
    validators = homogeneous_validators(gcp_regions, num_validators.value)

    timing_strategies = template.get("proposer_strategies", [{"type": "optimal_latency"}])
    location_strategies = template.get("location_strategies", [{"type": "best_relay"}])

    # Run simulation
    _seed = seed.value
    random.seed(_seed)
    np.random.seed(_seed)

    import tempfile

    output_dir = tempfile.mkdtemp(prefix="marimo_sim_")

    start = time.perf_counter()
    run_simulation(
        model=paradigm.value,
        number_of_validators=num_validators.value,
        num_slots=num_slots.value,
        validators=validators,
        gcp_regions=gcp_regions,
        gcp_latency=gcp_latency,
        consensus_settings=consensus_settings,
        relay_profiles=relay_profiles,
        signal_profiles=signal_profiles,
        timing_strategies=timing_strategies,
        location_strategies=location_strategies,
        simulation_name=f"marimo-{paradigm.value}-{num_validators.value}v",
        output_folder=output_dir,
        time_window=int(template.get("time_window", 10000)),
        fast_mode=False,
        cost=float(migration_cost.value),
        seed=_seed,
        collect_full_history=False,
        export_raw_artifacts=True,
        verbose=False,
    )
    elapsed = time.perf_counter() - start

    # Collect results from output files
    import json

    results = {}
    for fname in os.listdir(output_dir):
        fpath = os.path.join(output_dir, fname)
        if fname.endswith(".json"):
            with open(fpath) as jf:
                results[fname] = json.load(jf)
        elif fname.endswith(".csv"):
            results[fname] = pd.read_csv(fpath)

    sim_result = {
        "elapsed": elapsed,
        "output_dir": output_dir,
        "results": results,
        "paradigm": paradigm.value,
        "validators": num_validators.value,
        "slots": num_slots.value,
        "cost": migration_cost.value,
    }
    sim_result
    return (sim_result,)


@app.cell
def _(mo, sim_result):
    mo.md(
        f"""
        ## Results

        Simulation completed in **{sim_result['elapsed']:.1f}s** —
        {sim_result['paradigm']} with {sim_result['validators']} validators,
        {sim_result['slots']} slots, cost={sim_result['cost']}
        """
    )
    return


@app.cell
def _(sim_result):
    import plotly.graph_objects as go
    from plotly.subplots import make_subplots

    results = sim_result["results"]

    fig = make_subplots(
        rows=2,
        cols=2,
        subplot_titles=(
            "Average MEV per Slot",
            "Supermajority Success Rate",
            "Failed Block Proposals",
            "Average Proposal Time",
        ),
        vertical_spacing=0.12,
        horizontal_spacing=0.08,
    )

    series_map = {
        (1, 1): ("avg_mev.json", "#3B82F6"),
        (1, 2): ("supermajority_success.json", "#22C55E"),
        (2, 1): ("failed_block_proposals.json", "#EF4444"),
        (2, 2): ("proposal_time_avg.json", "#F59E0B"),
    }

    for (row, col), (fname, color) in series_map.items():
        data = results.get(fname, [])
        if data:
            fig.add_trace(
                go.Scatter(
                    y=data,
                    mode="lines",
                    line={"color": color, "width": 1.5},
                    name=fname.replace(".json", "").replace("_", " ").title(),
                ),
                row=row,
                col=col,
            )

    fig.update_layout(
        height=500,
        showlegend=False,
        template="plotly_dark",
        margin={"t": 40, "b": 30, "l": 50, "r": 20},
        font={"family": "SF Mono, Menlo, monospace", "size": 11},
    )
    fig
    return


@app.cell
def _(sim_result):
    import plotly.graph_objects as go

    results = sim_result["results"]
    geo_metrics = results.get("paper_geography_metrics.json", {})

    if geo_metrics:
        fig2 = go.Figure()
        metric_colors = {
            "gini": ("#3B82F6", "Gini (geographic)"),
            "hhi": ("#A855F7", "HHI (concentration)"),
            "liveness": ("#22C55E", "Liveness coefficient"),
            "profit_variance": ("#F59E0B", "Profit CV"),
        }

        for key, (color, label) in metric_colors.items():
            data = geo_metrics.get(key, [])
            if data:
                fig2.add_trace(
                    go.Scatter(
                        y=data,
                        mode="lines",
                        name=label,
                        line={"color": color, "width": 1.5},
                    )
                )

        fig2.update_layout(
            title="Paper Geography Metrics Over Time",
            height=350,
            template="plotly_dark",
            margin={"t": 40, "b": 30, "l": 50, "r": 20},
            font={"family": "SF Mono, Menlo, monospace", "size": 11},
            legend={"orientation": "h", "y": -0.15},
        )
        fig2
    return


@app.cell
def _(sim_result):
    import plotly.graph_objects as go

    results = sim_result["results"]
    top_regions = results.get("top_regions_final.json", [])

    if top_regions:
        # top_regions is a list of [region, count] pairs
        regions = [r[0] if isinstance(r, list) else r.get("region", "?") for r in top_regions[:15]]
        counts = [r[1] if isinstance(r, list) else r.get("count", 0) for r in top_regions[:15]]

        fig3 = go.Figure(
            go.Bar(
                x=counts,
                y=regions,
                orientation="h",
                marker_color="#3B82F6",
            )
        )
        fig3.update_layout(
            title="Final Validator Distribution (Top 15 Regions)",
            height=400,
            template="plotly_dark",
            margin={"t": 40, "b": 30, "l": 160, "r": 20},
            font={"family": "SF Mono, Menlo, monospace", "size": 11},
            yaxis={"autorange": "reversed"},
        )
        fig3
    return


@app.cell
def _(mo, sim_result):
    results = sim_result["results"]

    # Build a summary stats table
    geo = results.get("paper_geography_metrics.json", {})
    avg_mev = results.get("avg_mev.json", [])
    supermajority = results.get("supermajority_success.json", [])

    stats = {
        "Metric": [
            "Final Avg MEV",
            "Final Supermajority Rate",
            "Final Gini (geographic)",
            "Final HHI (concentration)",
            "Final Liveness",
            "Final Profit CV",
            "Runtime (seconds)",
        ],
        "Value": [
            f"{avg_mev[-1]:.4f}" if avg_mev else "N/A",
            f"{supermajority[-1]:.4f}" if supermajority else "N/A",
            f"{geo.get('gini', [0])[-1]:.4f}" if geo.get("gini") else "N/A",
            f"{geo.get('hhi', [0])[-1]:.4f}" if geo.get("hhi") else "N/A",
            f"{geo.get('liveness', [0])[-1]:.4f}" if geo.get("liveness") else "N/A",
            f"{geo.get('profit_variance', [0])[-1]:.4f}" if geo.get("profit_variance") else "N/A",
            f"{sim_result['elapsed']:.1f}",
        ],
    }

    mo.ui.table(stats, label="Summary Statistics")
    return


@app.cell
def _(mo):
    mo.md(
        """
        ---
        *Built with [Marimo](https://marimo.io) + the geographical decentralization simulation engine.*
        *Edit this notebook: `marimo edit notebooks/explore.py`*
        """
    )
    return


if __name__ == "__main__":
    app.run()
