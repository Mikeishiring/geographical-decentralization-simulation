# analysis_utils.py
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import numpy as np
import matplotlib.pyplot as plt

from distribution import SphericalSpace, init_distance_matrix
from measure import (
    cluster_matrix,
    total_distance,
    average_nearest_neighbor_distance,
    nearest_neighbor_index_spherical,
)

SPACE = SphericalSpace()


# ------------------------ Data containers ------------------------
@dataclass
class MetricSeries:
    clusters: np.ndarray
    total_dist: np.ndarray
    avg_nnd: np.ndarray
    nni: np.ndarray


# ------------------------ I/O helpers ------------------------
def load_json(path: Path):
    with open(path, "r") as f:
        return json.load(f)


def _load_json_if_exists(path: Path):
    if path.is_file():
        with open(path, "r") as f:
            return json.load(f)
    return None


def load_slots(path: Path) -> List[Any]:
    data = load_json(path)
    if not isinstance(data, list):
        raise ValueError(f"{path} is not a list-of-slots JSON.")
    return data


def find_slots_file(run_dir: Path) -> Path:
    candidates = [
        run_dir / "data.json",
        run_dir / "slots.json",
        *sorted(run_dir.glob("slots*.json")),
        *sorted(run_dir.glob("**/slots*.json")),
        *sorted(run_dir.glob("**/data.json")),
    ]
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError(f"No slots JSON found under {run_dir}")


# ------------------------ Metrics ------------------------
def _safe_metrics_for_points(
    points: Sequence[Any],
) -> Tuple[float, float, float, float]:
    if points is None or len(points) <= 1:
        return 0.0, 0.0, 0.0, 0.0
    dm = init_distance_matrix(points, SPACE)
    c = float(cluster_matrix(dm))
    td = float(total_distance(dm))
    nnd = float(average_nearest_neighbor_distance(dm))
    nni = float(nearest_neighbor_index_spherical(dm, SPACE)[0])
    return c, td, nnd, nni


def compute_metrics_per_slot(
    slots: Sequence[Sequence[Any]],
    granularity: int = 1,
) -> MetricSeries:
    n = len(slots)
    clusters = np.zeros(n, dtype=float)
    total_dist = np.zeros(n, dtype=float)
    avg_nnd = np.zeros(n, dtype=float)
    nni = np.zeros(n, dtype=float)

    last = (0.0, 0.0, 0.0, 0.0)
    g = max(1, granularity)
    for i, pts in enumerate(slots):
        if i % g == 0:
            last = _safe_metrics_for_points(pts)
        elif pts is None or len(pts) <= 1:
            last = (0.0, 0.0, 0.0, 0.0)
        clusters[i], total_dist[i], avg_nnd[i], nni[i] = last
    return MetricSeries(clusters, total_dist, avg_nnd, nni)


def maybe_rolling(arr: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return arr
    if window % 2 == 0:
        window += 1
    k = window // 2
    x = np.concatenate([np.full(k, np.nan), arr, np.full(k, np.nan)])
    out = np.empty_like(arr, dtype=float)
    for i in range(len(arr)):
        out[i] = np.nanmean(x[i : i + window])
    return out


# ------------------------ Plotting helpers ------------------------
def single_line(ax: plt.Axes, x, y, title, ylabel):
    ax.plot(x, y, lw=1.6)
    ax.set_title(title)
    ax.set_xlabel("Slot")
    ax.set_ylabel(ylabel)


def save_fig(fig: plt.Figure, outfile: Path, fmt: str, dpi: int):
    outfile = outfile.with_suffix(f".{fmt}")
    fig.tight_layout()
    fig.savefig(outfile, dpi=dpi)
    if fmt.lower() != "pdf":
        fig.savefig(outfile.with_suffix(".pdf"))
    print("✓", outfile)


def write_metrics_csv(path: Path, x: Sequence[int], m: MetricSeries):
    import csv

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["slot", "clusters", "total_distance", "avg_nnd", "nni"])
        for i, s in enumerate(x):
            w.writerow([s, m.clusters[i], m.total_dist[i], m.avg_nnd[i], m.nni[i]])
    print("✓", path)


def write_series_csv(
    path: Path, x: Sequence[int], series: Sequence[float], header=("slot", "value")
):
    import csv

    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(list(header))
        for s, v in zip(x, series):
            w.writerow([s, v])
    print("✓", path)


# ------------------------ Dash-extras computation ------------------------
def _sum_list_or_zero(xs):
    return float(sum(xs)) if xs else 0.0


def compute_extras_for_slot_series(
    run_dir: Path,
    slots: Sequence[Sequence[Any]],
) -> Dict[str, Any]:
    n = len(slots)
    mev_by_slot = _load_json_if_exists(run_dir / "mev_by_slot.json")
    attest_by_slot = _load_json_if_exists(run_dir / "attest_by_slot.json")
    failed_blocks = _load_json_if_exists(run_dir / "failed_block_proposals.json")
    proposal_time_by_slot = _load_json_if_exists(run_dir / "proposal_time_by_slot.json")
    relay_data = _load_json_if_exists(run_dir / "relay_data.json")
    relay_names = _load_json_if_exists(run_dir / "relay_names.json") or []

    mev_hist = None
    if isinstance(mev_by_slot, list) and len(mev_by_slot) >= n:
        mev_hist = [_sum_list_or_zero(mev_by_slot[i]) for i in range(n)]

    attest_hist = None
    if isinstance(attest_by_slot, list) and len(attest_by_slot) >= n:
        attest_hist = [_sum_list_or_zero(attest_by_slot[i]) for i in range(n)]

    failed_hist = None
    if isinstance(failed_blocks, list) and len(failed_blocks) >= n:
        failed_hist = [float(failed_blocks[i]) for i in range(n)]

    proposal_hist = None
    if isinstance(proposal_time_by_slot, list) and len(proposal_time_by_slot) >= n:
        proposal_hist = [
            _sum_list_or_zero([t for t in proposal_time_by_slot[i] if t > 0])
            for i in range(n)
        ]

    relay_series: Dict[str, List[float]] = {}
    if isinstance(relay_data, list) and n > 0:
        relay_positions = []
        if relay_data:
            if (
                isinstance(relay_data[0], list)
                and relay_data[0]
                and isinstance(relay_data[0][0], (int, float))
            ):
                relay_positions = [relay_data]
            else:
                relay_positions = relay_data[0] if relay_data else []
        if not relay_positions:
            relay_names = []
        elif not relay_names or len(relay_names) != len(relay_positions):
            relay_names = [f"relay{i+1}" for i in range(len(relay_positions))]
        for rname in relay_names:
            relay_series[rname] = [0.0] * n
        for i in range(n):
            pts = slots[i]
            if not pts or not relay_positions:
                continue
            for j, rpos in enumerate(relay_positions):
                try:
                    avg_d = (
                        float(np.mean([SPACE.distance(pt, rpos) for pt in pts]))
                        if pts
                        else 0.0
                    )
                except Exception:
                    avg_d = 0.0
                relay_series[relay_names[j]][i] = avg_d

    return {
        "mev": mev_hist,
        "attest": attest_hist,
        "failed": failed_hist,
        "proposal": proposal_hist,
        "relay": relay_series,
    }


# ------------------------ Countries / Regions ------------------------
def load_region_to_country(data_dir: Path) -> Dict[str, str]:
    """Parse gcp_regions.csv mapping Region -> country (last token of 'location')."""
    import csv

    csv_path = data_dir / "gcp_regions.csv"
    if not csv_path.is_file():
        return {}
    mapping = {}
    with open(csv_path, newline="") as f:
        rdr = csv.DictReader(f)
        for row in rdr:
            region = row.get("Region") or row.get("region") or ""
            loc = row.get("location") or row.get("Location") or ""
            if not region:
                continue
            country = loc.split(",")[-1].strip() if "," in loc else loc.strip()
            mapping[region] = country or "Unknown"
    return mapping


def compute_country_histograms(run_dir: Path, data_dir: Path) -> Dict[str, Any]:
    """
    Returns:
      {
        "overall": Counter-like dict country->count over all slots,
        "final": dict country->count at final slot,
        "top_overall": list[(country,count)] top-15,
        "top_final": list[(country,count)] top-15,
      }
    """
    region_counts_per_slot = _load_json_if_exists(
        run_dir / "region_counter_per_slot.json"
    )
    if not isinstance(region_counts_per_slot, dict) or not region_counts_per_slot:
        return {}
    region_to_country = load_region_to_country(data_dir)
    # overall
    overall: Dict[str, int] = {}
    final: Dict[str, int] = {}

    # Keys are slot indices as strings; iterate sorted by int
    slots_sorted = sorted(region_counts_per_slot.keys(), key=lambda s: int(s))
    for slot in slots_sorted:
        pairs = region_counts_per_slot[slot]  # list of [region, count]
        agg: Dict[str, int] = {}
        for region, count in pairs:
            country = region_to_country.get(region, "Unknown")
            agg[country] = agg.get(country, 0) + int(count)
            overall[country] = overall.get(country, 0) + int(count)
        final = agg  # last assignment ends up as final slot

    # sort top-15
    top_overall = sorted(overall.items(), key=lambda kv: kv[1], reverse=True)[:15]
    top_final = sorted(final.items(), key=lambda kv: kv[1], reverse=True)[:15]
    return {
        "overall": overall,
        "final": final,
        "top_overall": top_overall,
        "top_final": top_final,
    }


def bar_on(ax: plt.Axes, items: List[Tuple[str, float]], title: str, xlabel: str):
    if not items:
        ax.set_axis_off()
        ax.set_title(title + " (no data)")
        return
    labels = [k for k, _ in items]
    vals = [v for _, v in items]
    ax.bar(range(len(vals)), vals)
    ax.set_xticks(range(len(vals)))
    ax.set_xticklabels(labels, rotation=60, ha="right", fontsize=8)
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel("Validators")


# ------------------------ Per-run worker ------------------------
def run_one(
    slots_path: Path,
    outdir: Path,
    *,
    granularity: int,
    rolling: int,
    every: int,
    fmt: str,
    dpi: int,
    size: str,
    panel: bool,
    data_dir: Path,
    rd: Path,
):
    slots = load_slots(slots_path)
    n = len(slots)

    metrics = compute_metrics_per_slot(slots, granularity=granularity)
    if rolling and rolling > 1:
        metrics = MetricSeries(
            clusters=maybe_rolling(metrics.clusters, rolling),
            total_dist=maybe_rolling(metrics.total_dist, rolling),
            avg_nnd=maybe_rolling(metrics.avg_nnd, rolling),
            nni=maybe_rolling(metrics.nni, rolling),
        )

    x_full = np.arange(1, n + 1)
    keep = np.arange(0, n, max(1, every))
    x = x_full[keep]
    c = metrics.clusters[keep]
    td = metrics.total_dist[keep]
    nnd = metrics.avg_nnd[keep]
    nni = metrics.nni[keep]

    try:
        w_str, h_str = size.lower().split("x")
        fig_w, fig_h = float(w_str), float(h_str)
    except Exception:
        fig_w, fig_h = 10.0, 4.0

    outdir.mkdir(parents=True, exist_ok=True)

    def _one(y, title, ylabel, stem):
        fig, ax = plt.subplots(figsize=(fig_w, fig_h))
        single_line(ax, x, y, title, ylabel)
        save_fig(fig, outdir / stem, fmt, dpi)
        plt.close(fig)

    # Spatial metrics
    _one(c, "# Clusters", "clusters", "clusters_over_time")
    _one(td, "Total Distance", "distance", "total_distance")
    _one(nnd, "Avg. NND", "distance", "avg_nnd")
    _one(nni, "NNI", "nni", "nni")

    write_metrics_csv(outdir / "metrics.csv", list(x_full), metrics)

    # -------- Extras (MEV/attest/failed/proposal + relays) --------
    run_dir = outdir.parent
    extras = compute_extras_for_slot_series(run_dir, slots)

    def _plot_series(
        series: List[float] | None,
        title: str,
        ylabel: str,
        stem: str,
        header=("slot", "value"),
    ):
        if series is None:
            return None
        y = np.asarray(series)[keep]
        fig, ax = plt.subplots(figsize=(fig_w, fig_h))
        single_line(ax, x, y, title, ylabel)
        save_fig(fig, outdir / stem, fmt, dpi)
        plt.close(fig)
        write_series_csv(outdir / f"{stem}.csv", list(x_full), series, header=header)
        return series

    s_mev = _plot_series(extras["mev"], "MEV Earned (sum per slot)", "MEV", "mev")
    s_att = _plot_series(extras["attest"], "Attestations (per slot)", "count", "attest")
    s_fail = _plot_series(
        extras["failed"], "Failed Block Proposals", "count", "failed_blocks"
    )
    s_prop = _plot_series(
        extras["proposal"], "Proposal Time (sum of >0)", "time", "proposal_time"
    )

    # Relay distances: combined single figure with all traces
    relay_series = extras["relay"] or {}
    relay_fig = None
    if relay_series:
        fig, ax = plt.subplots(figsize=(fig_w, fig_h))
        for rname, series in relay_series.items():
            y = np.asarray(series)[keep]
            ax.plot(x, y, lw=1.2, label=rname)
            # CSV per relay (full)
            safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in rname)
            write_series_csv(
                outdir / f"relay_distance_{safe}.csv",
                list(x_full),
                series,
                header=("slot", f"avg_dist_{safe}"),
            )
        ax.set_title("Avg Distance to Relays")
        ax.set_xlabel("Slot")
        ax.set_ylabel("distance")
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.15), ncol=3, fontsize=8)
        save_fig(fig, outdir / "relay_distance_all", fmt, dpi)
        plt.close(fig)
        relay_fig = "ok"

    # -------- Countries (overall + final slot) --------
    countries = compute_country_histograms(run_dir, data_dir)
    if countries:
        # standalone bars
        fig, ax = plt.subplots(figsize=(max(10.0, fig_w), fig_h))
        bar_on(ax, countries["top_overall"], "Top Countries (Overall)", "Country")
        save_fig(fig, outdir / "countries_overall", fmt, dpi)
        plt.close(fig)

        fig, ax = plt.subplots(figsize=(max(10.0, fig_w), fig_h))
        bar_on(ax, countries["top_final"], "Top Countries (Final Slot)", "Country")
        save_fig(fig, outdir / "countries_final", fmt, dpi)
        plt.close(fig)

    # -------- Big Panel (collect everything) --------
    if panel:
        # build list of subplot builders to keep code compact
        panels = []

        def add_ts(y, title, ylabel):
            panels.append(("ts", (x, y, title, ylabel)))

        def add_bar(items, title, xlabel):
            panels.append(("bar", (items, title, xlabel)))

        add_ts(c, "# Clusters", "clusters")
        add_ts(td, "Total Distance", "distance")
        add_ts(nnd, "Avg. NND", "distance")
        add_ts(nni, "NNI", "nni")

        if s_mev is not None:
            add_ts(np.asarray(s_mev)[keep], "MEV Earned", "MEV")
        if s_att is not None:
            add_ts(np.asarray(s_att)[keep], "Attestations", "count")
        if s_fail is not None:
            add_ts(np.asarray(s_fail)[keep], "Failed Blocks", "count")
        if s_prop is not None:
            add_ts(np.asarray(s_prop)[keep], "Proposal Time (sum>0)", "time")

        # relay combined (recompute y’s for panel)
        if relay_series:
            panels.append(("relay", (relay_series,)))  # special handler

        if countries:
            add_bar(countries["top_overall"], "Top Countries (Overall)", "Country")
            add_bar(countries["top_final"], "Top Countries (Final Slot)", "Country")

        # layout: 3 columns
        ncols = 3
        nrows = int(np.ceil(len(panels) / ncols))
        fig, axes = plt.subplots(nrows, ncols, figsize=(ncols * 5.0, nrows * 3.5))
        axes = np.atleast_2d(axes).reshape(nrows, ncols)

        pi = 0
        for r in range(nrows):
            for ccol in range(ncols):
                ax = axes[r, ccol]
                if pi >= len(panels):
                    ax.set_axis_off()
                    continue
                kind, payload = panels[pi]
                if kind == "ts":
                    x_, y_, title_, ylabel_ = payload
                    single_line(ax, x_, y_, title_, ylabel_)
                elif kind == "bar":
                    items, title_, xlabel_ = payload
                    bar_on(ax, items, title_, xlabel_)
                elif kind == "relay":
                    # multi-trace relay
                    series_dict = payload[0]
                    for rname, series in series_dict.items():
                        ax.plot(x, np.asarray(series)[keep], lw=1.0, label=rname)
                    ax.set_title("Avg Distance to Relays")
                    ax.set_xlabel("Slot")
                    ax.set_ylabel("distance")
                    ax.legend(fontsize=6)
                pi += 1

        fig.suptitle(f"All Metrics for {rd.name}", fontsize=14)
        fig.tight_layout(rect=[0, 0, 1, 0.98])
        save_fig(fig, outdir / "all_metrics_panel", fmt, dpi)
        plt.close(fig)


# ------------------------ CLI ------------------------
def main():
    ap = argparse.ArgumentParser(
        description="Plot spatial metrics for one or many simulation runs (+ extras, countries, panels)."
    )
    # single-run
    ap.add_argument("-d", "--data", help="Path to a slots JSON (single run).")
    ap.add_argument(
        "-o",
        "--outdir",
        help="Where to write outputs (single run). Defaults to alongside data in 'figures/'.",
    )
    # batch mode
    ap.add_argument(
        "-b",
        "--batch",
        help="Directory whose immediate subfolders are simulation runs.",
    )
    ap.add_argument(
        "--outsubdir",
        default="figures",
        help="Subfolder created under each run to store outputs.",
    )
    # shared knobs
    ap.add_argument(
        "-g",
        "--granularity",
        type=int,
        default=10,
        help="Recompute metrics every g-th slot",
    )
    ap.add_argument(
        "--rolling",
        type=int,
        default=1,
        help="Centered rolling smoothing window (odd recommended)",
    )
    ap.add_argument(
        "--every", type=int, default=1, help="Plot every k-th point (downsample)"
    )
    ap.add_argument(
        "--fmt",
        default="pdf",
        choices=["pdf"],
        help="Output figure format",
    )
    ap.add_argument("--dpi", type=int, default=300, help="Raster DPI (if png)")
    ap.add_argument("--size", default="10x4", help="Figure size in inches, e.g., 12x4")
    ap.add_argument(
        "--panel", action="store_true", help="Save the big combined panel figure"
    )
    ap.add_argument(
        "--data-dir",
        default="data",
        help="Directory containing gcp_regions.csv for country mapping",
    )
    args = ap.parse_args()

    data_dir = Path(args.data_dir)

    if args.batch:
        root = Path(args.batch)
        if not root.is_dir():
            raise SystemExit(f"--batch path not a directory: {root}")
        run_dirs = sorted([p for p in root.iterdir() if p.is_dir()])
        if not run_dirs:
            raise SystemExit(f"No subfolders under {root}")
        print(f"Found {len(run_dirs)} runs under {root}")
        for rd in run_dirs:
            try:
                slots_path = find_slots_file(rd)
                outdir = rd / args.outsubdir
                print(
                    f"\n→ {rd.name} | slots: {slots_path.relative_to(rd)} | out: {outdir.relative_to(rd)}"
                )
                run_one(
                    slots_path,
                    outdir,
                    granularity=max(1, args.granularity),
                    rolling=args.rolling,
                    every=max(1, args.every),
                    fmt=args.fmt,
                    dpi=args.dpi,
                    size=args.size,
                    panel=args.panel,
                    data_dir=data_dir,
                    rd=rd,
                )
            except Exception as e:
                print(f"✗ Skipping {rd}: {e}")
        return

    if not args.data:
        raise SystemExit(
            "Provide either --data (single run) or --batch DIR (multi-run)."
        )
    data_path = Path(args.data)
    outdir = (
        Path(args.outdir)
        if args.outdir
        else data_path.with_suffix("").parent / "figures"
    )
    run_one(
        data_path,
        outdir,
        granularity=max(1, args.granularity),
        rolling=args.rolling,
        every=max(1, args.every),
        fmt=args.fmt,
        dpi=args.dpi,
        size=args.size,
        panel=args.panel,
        data_dir=data_dir,
    )


if __name__ == "__main__":
    main()
