from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from multiprocessing import Pool, cpu_count
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from tqdm import tqdm

from measure import (
    average_nearest_neighbor_distance,
    cluster_matrix,
    nearest_neighbor_index_spherical,
    total_distance,
)

_CONTINENT_RULES = [
    (r"^us-|^northamerica-", "North America"),
    (r"^southamerica-", "South America"),
    (r"^europe-", "Europe"),
    (r"^asia-", "Asia"),
    (r"^australia-", "Oceania"),
    (r"^me-", "Middle East"),
    (r"^africa-", "Africa"),
]


def to_continent(region: str) -> str:
    normalized = str(region or "").strip().lower()
    for pattern, name in _CONTINENT_RULES:
        if re.match(pattern, normalized):
            return name
    return "Other"


class SphericalSpace:
    """Sample points on the unit sphere and measure great-circle distance."""

    def distance(self, p1, p2) -> float:
        dot_product = p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]
        dot_product = max(-1.0, min(1.0, dot_product))
        return math.acos(dot_product)

    def get_area(self) -> float:
        return 4 * np.pi


def init_distance_matrix(positions, space: SphericalSpace) -> np.ndarray:
    n = len(positions)
    dist_matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            distance = space.distance(positions[i], positions[j])
            dist_matrix[i][j] = distance
            dist_matrix[j][i] = distance
    return dist_matrix


def load_json_data(path: str | Path) -> Any:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def gini(values) -> float:
    series = np.array(values, dtype=float)
    if series.size == 0:
        return 0.0
    if np.amin(series) < 0:
        raise ValueError("Values cannot be negative")
    total = float(np.sum(series))
    if total == 0:
        return 0.0
    sorted_values = np.sort(series)
    cumulative = np.cumsum(sorted_values)
    n = len(sorted_values)
    return float((n + 1 - 2 * np.sum(cumulative) / cumulative[-1]) / n)


def hhi(values) -> float:
    series = np.array(values, dtype=float)
    total = float(np.sum(series))
    if total <= 0:
        return 0.0
    shares = series / total
    return float(np.sum(shares ** 2))


def liveness_coefficient(values) -> int:
    sorted_values = np.sort(np.array(values, dtype=float))[::-1]
    total_value = float(np.sum(sorted_values))
    if total_value <= 0:
        return 0
    for index, value in enumerate(sorted_values):
        if float(np.sum(sorted_values[: index + 1])) >= total_value / 3:
            return int(index + 1)
    return int(len(sorted_values))


def compute_paper_metrics(
    region_counts_per_slot: dict[str, list[list[Any]]],
    region_to_country: dict[str, str],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    validator_agent_countries = {}
    validator_agent_continents = {}

    for slot, region_list in region_counts_per_slot.items():
        country_counter = defaultdict(int)
        continent_counter = defaultdict(int)
        for region, count in region_list:
            country = region_to_country.get(region, "Unknown")
            continent = to_continent(region)
            country_counter[country] += int(count)
            continent_counter[continent] += int(count)

        validator_agent_countries[slot] = Counter(country_counter).most_common()
        validator_agent_continents[slot] = Counter(continent_counter).most_common()

    metrics_dfs = []

    initial_num_of_regions = len(region_to_country)
    initial_num_of_countries = len(set(region_to_country.values()))
    initial_num_of_continents = len(_CONTINENT_RULES)

    for counts, initial_num in zip(
        [region_counts_per_slot, validator_agent_countries, validator_agent_continents],
        [initial_num_of_regions, initial_num_of_countries, initial_num_of_continents],
    ):
        metrics = []
        for slot, slot_counts in counts.items():
            count_values = np.array([count for _, count in slot_counts], dtype=int)
            count_values = np.append(count_values, [0] * max(0, initial_num - len(count_values)))
            metrics.append((
                int(slot),
                gini(count_values),
                hhi(count_values),
                liveness_coefficient(count_values),
            ))

        metrics_dfs.append(pd.DataFrame(
            sorted(metrics, key=lambda item: item[0]),
            columns=["slot", "gini", "hhi", "liveness"],
        ))

    return tuple(metrics_dfs)  # type: ignore[return-value]


def parse_profit(df: pd.DataFrame) -> pd.DataFrame:
    value = []
    working = df.copy()
    working["continent"] = working["gcp_region"].apply(to_continent)
    for slot, slot_df in working.groupby("slot"):
        totals = []
        for _, continent_df in slot_df.groupby("continent"):
            totals.append(float(continent_df["mev_offer"].max()))

        series = pd.Series(totals, dtype=float)
        mean = float(series.mean()) if not series.empty else 0.0
        std = float(series.std()) if not series.empty else 0.0
        value.append({
            "slot": int(slot),
            "variance": float(series.var()) if not series.empty else 0.0,
            "std": std,
            "mean": mean,
            "cv": std / mean if mean != 0 else 0.0,
            "gini": gini(series.values) if not series.empty else 0.0,
        })
    return pd.DataFrame(value)


def preprocess_slot_counter(
    validator_agent_regions: dict[str, list[list[Any]]],
    region_to_country: dict[str, str],
    region_to_xyz: dict[str, tuple[float, float, float]],
) -> tuple[list[list[tuple[float, float, float]]], dict[str, list[tuple[str, int]]]]:
    validator_agent_countries = {}
    all_slot_data: list[list[tuple[float, float, float]]] = []

    for slot, region_list in sorted(validator_agent_regions.items(), key=lambda item: int(item[0])):
        country_counter = defaultdict(int)
        slot_data: list[tuple[float, float, float]] = []

        for region, count in region_list:
            country = region_to_country.get(region, "Unknown")
            country_counter[country] += int(count)
            xyz = region_to_xyz.get(region, (0.0, 0.0, 0.0))
            slot_data.extend([xyz] * int(count))

        validator_agent_countries[slot] = Counter(country_counter).most_common()
        all_slot_data.append(slot_data)

    return all_slot_data, validator_agent_countries


def precompute_metrics_per_slot(args):
    slot_index, points, space = args

    if len(points) <= 1:
        return slot_index, 0.0, 0.0, 0.0, 0.0

    distance_matrix = init_distance_matrix(points, space)
    clusters = cluster_matrix(distance_matrix)
    total_dist = total_distance(distance_matrix)
    avg_nnd = average_nearest_neighbor_distance(distance_matrix)
    nni = nearest_neighbor_index_spherical(distance_matrix, space)[0]
    return slot_index, clusters, total_dist, avg_nnd, nni


def _pool_process_count() -> int:
    available = cpu_count() or 1
    return max(1, min(available // 2 or 1, 10))


def _iterate_pool_results(iterable, total: int, description: str, verbose: bool):
    if not verbose:
        return iterable
    return tqdm(iterable, total=total, desc=description)


def precompute_metrics(
    all_slot_data,
    mev_series,
    attest_series,
    proposal_time_series,
    *,
    verbose: bool = False,
) -> dict[str, list[float]]:
    granularity = 10
    space = SphericalSpace()

    clusters_hist = []
    total_dist_hist = []
    avg_nnd_hist = []
    nni_hist = []
    mev_hist = []
    attest_hist = []
    proposal_time_hist = []

    last_clusters = last_total_dist = last_avg_nnd = last_nni = 0.0
    sample_indices = [index for index, points in enumerate(all_slot_data) if index % granularity == 0 and len(points) > 1]
    tasks = [(index, all_slot_data[index], space) for index in sample_indices]

    if tasks:
        with Pool(processes=_pool_process_count()) as pool:
            results = list(_iterate_pool_results(
                pool.imap_unordered(precompute_metrics_per_slot, tasks),
                total=len(tasks),
                description="Computing metrics",
                verbose=verbose,
            ))
        results.sort(key=lambda item: item[0])
        by_slot = {index: (clusters, total_dist, avg_nnd, nni) for index, clusters, total_dist, avg_nnd, nni in results}
    else:
        by_slot = {}

    for index, _points in enumerate(all_slot_data):
        if index in by_slot:
            last_clusters, last_total_dist, last_avg_nnd, last_nni = by_slot[index]

        last_mev = float(sum(mev_series[index])) if mev_series and index < len(mev_series) else 0.0
        last_attest = float(sum(attest_series[index])) if attest_series and index < len(attest_series) else 0.0
        last_proposal_time = (
            float(sum(value for value in proposal_time_series[index] if value > 0))
            if proposal_time_series and index < len(proposal_time_series) and proposal_time_series[index]
            else 0.0
        )

        clusters_hist.append(last_clusters)
        total_dist_hist.append(last_total_dist)
        avg_nnd_hist.append(last_avg_nnd)
        nni_hist.append(last_nni)
        mev_hist.append(last_mev)
        attest_hist.append(last_attest)
        proposal_time_hist.append(last_proposal_time)

    return {
        "clusters": clusters_hist,
        "total_distance": total_dist_hist,
        "avg_nnd": avg_nnd_hist,
        "nni": nni_hist,
        "mev": mev_hist,
        "attestations": attest_hist,
        "proposal_times": proposal_time_hist,
    }


def precompute_info_distances_per_slot(args):
    slot_index, points, info_positions, space = args

    if not points or not info_positions:
        return slot_index, [0.0] * len(info_positions)

    info_distances = [
        sum(space.distance(point, info_position) for point in points) / len(points)
        for info_position in info_positions
    ]
    return slot_index, info_distances


def precompute_info_distances(
    all_slot_data,
    info_data,
    *,
    verbose: bool = False,
):
    space = SphericalSpace()
    tasks = [
        (index, all_slot_data[index], info_data[index] if index < len(info_data) else [], space)
        for index in range(len(all_slot_data))
    ]

    if not tasks:
        return []

    with Pool(processes=_pool_process_count()) as pool:
        results = list(_iterate_pool_results(
            pool.imap_unordered(precompute_info_distances_per_slot, tasks),
            total=len(tasks),
            description="Computing info distances",
            verbose=verbose,
        ))

    results.sort(key=lambda item: item[0])
    return [info_distances for _, info_distances in results]


def make_json_serializable(obj):
    if isinstance(obj, (np.integer, np.int64)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float64)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, dict):
        return {key: make_json_serializable(value) for key, value in obj.items()}
    if isinstance(obj, list):
        return [make_json_serializable(value) for value in obj]
    if isinstance(obj, tuple):
        return [make_json_serializable(value) for value in obj]
    return obj


def infer_validator_count(validator_agent_regions: dict[str, list[list[Any]]]) -> int:
    if not validator_agent_regions:
        return 0
    first_slot = min(validator_agent_regions.keys(), key=lambda value: int(value))
    return int(sum(int(count) for _, count in validator_agent_regions[first_slot]))


def normalize_sources(source_entries, model: str, label_style: str = "published"):
    suffix = "supplier" if model == "SSP" else "signal"
    normalized = []

    for entry in source_entries:
        if isinstance(entry, dict):
            region = entry.get("gcp_region") or entry.get("region") or entry.get("location")
            name = entry.get("unique_id") or entry.get("name") or region
        elif isinstance(entry, (list, tuple)) and len(entry) >= 2:
            name, region = entry[0], entry[1]
        else:
            name = entry
            region = entry

        region_str = str(region)
        normalized_name = f"{region_str}-{suffix}" if label_style == "published" else str(name)
        normalized.append((normalized_name, region_str))

    return normalized


def build_preprocessed_payload(
    validator_agent_regions,
    n_slots: int,
    metrics: dict[str, Any],
    sources,
    validator_count: int | None = None,
    cost: float | None = None,
    delta: int | None = None,
    cutoff: int | None = None,
    gamma: float | None = None,
    description: str | None = None,
):
    payload = {}
    resolved_validator_count = infer_validator_count(validator_agent_regions) if validator_count is None else validator_count
    payload["v"] = int(resolved_validator_count)

    if delta is not None:
        payload["delta"] = int(delta)
    if cutoff is not None:
        payload["cutoff"] = int(cutoff)
    if cost is not None:
        payload["cost"] = float(cost)
    if gamma is not None:
        payload["gamma"] = float(gamma)
    if description:
        payload["description"] = description

    payload["n_slots"] = int(n_slots)
    payload["metrics"] = metrics
    payload["sources"] = sources
    payload["slots"] = {int(slot): counter for slot, counter in validator_agent_regions.items()}
    return payload


def build_preprocessed_payload_from_output_dir(
    data_dir: str | Path,
    output_dir: str | Path,
    *,
    model: str = "SSP",
    validator_count: int | None = None,
    cost: float | None = None,
    delta: int | None = None,
    cutoff: int | None = None,
    gamma: float | None = None,
    description: str | None = None,
    source_label_style: str = "published",
    output_file: str | Path | None = None,
    verbose: bool = False,
):
    data_dir = Path(data_dir)
    output_dir = Path(output_dir)

    mev_series = load_json_data(output_dir / "mev_by_slot.json")
    attest_series = load_json_data(output_dir / "attest_by_slot.json")
    failed_block_proposals = load_json_data(output_dir / "failed_block_proposals.json")
    proposal_time_series = load_json_data(output_dir / "proposal_time_by_slot.json")
    validator_agent_regions = load_json_data(output_dir / "region_counter_per_slot.json")
    profits_df = pd.read_csv(output_dir / "region_profits.csv")
    relay_names = load_json_data(output_dir / "relay_names.json") if (output_dir / "relay_names.json").is_file() else []
    signal_names = load_json_data(output_dir / "signal_names.json") if (output_dir / "signal_names.json").is_file() else []

    region_df = pd.read_csv(data_dir / "gcp_regions.csv")
    region_to_country = {}
    region_to_xyz = {}

    for region, city in zip(region_df["Region"], region_df["location"]):
        city_str = str(city)
        region_to_country[str(region)] = city_str.split(",")[-1].strip() if "," in city_str else city_str.strip()

    for region, x, y, z in zip(region_df["Region"], region_df["x"], region_df["y"], region_df["z"]):
        region_to_xyz[str(region)] = (float(x), float(y), float(z))

    all_slot_data, _validator_agent_countries = preprocess_slot_counter(
        validator_agent_regions,
        region_to_country,
        region_to_xyz,
    )
    n_slots = len(all_slot_data)

    precomputed_metrics = precompute_metrics(
        all_slot_data,
        mev_series,
        attest_series,
        proposal_time_series,
        verbose=verbose,
    )

    _region_metrics, _country_metrics, continent_metrics = compute_paper_metrics(
        validator_agent_regions,
        region_to_country,
    )
    precomputed_metrics["gini"] = continent_metrics["gini"].values.tolist()
    precomputed_metrics["hhi"] = continent_metrics["hhi"].values.tolist()
    precomputed_metrics["liveness"] = continent_metrics["liveness"].values.tolist()

    profits_metrics = parse_profit(profits_df)
    precomputed_metrics["profit_variance"] = profits_metrics["cv"].values.tolist()
    precomputed_metrics["failed_block_proposals"] = failed_block_proposals

    raw_sources = relay_names if model == "SSP" else signal_names
    sources = normalize_sources(raw_sources, model, label_style=source_label_style)
    info_data = [region_to_xyz.get(entry[1], (0.0, 0.0, 0.0)) for entry in raw_sources if isinstance(entry, (list, tuple)) and len(entry) >= 2]
    precomputed_metrics["info_avg_distance"] = precompute_info_distances(
        all_slot_data,
        [info_data] * len(all_slot_data),
        verbose=verbose,
    )

    payload = build_preprocessed_payload(
        validator_agent_regions=validator_agent_regions,
        n_slots=n_slots,
        metrics=precomputed_metrics,
        sources=sources,
        validator_count=validator_count,
        cost=cost,
        delta=delta,
        cutoff=cutoff,
        gamma=gamma,
        description=description,
    )

    serializable_payload = make_json_serializable(payload)
    if output_file is not None:
        output_path = Path(output_file)
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(serializable_payload, handle)

    return serializable_payload
