import matplotlib.pyplot as plt
import os
import pandas as pd
import seaborn as sns
import re


CUR_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(CUR_DIR, "..", "data")
FIGURE_DIR = os.path.join(CUR_DIR, "..", "figures")


_CONTINENT_RULES = [
    (r"^us-|^northamerica-", "North America"),
    (r"^southamerica-",      "South America"),
    (r"^europe-",            "Europe"),
    (r"^asia-",              "Asia"),
    (r"^australia-",         "Oceania"),
    (r"^me-",                "Middle East"),
    (r"^africa-",            "Africa"),
]


def to_continent(region: str) -> str:
    for pat, name in _CONTINENT_RULES:
        if re.match(pat, region):
            return name
    return "Other"


def convert_to_marco_regions(
    regions,
    latency
):
    reg_ids = set(regions["Region"])
    latency = latency[
        latency["sending_region"].isin(reg_ids) &
        latency["receiving_region"].isin(reg_ids)
    ].copy()

    regions["Continent"] = regions["Region"].map(to_continent)
    cont_map = dict(zip(regions["Region"], regions["Continent"]))
    latency["from_c"] = latency["sending_region"].map(cont_map)
    latency["to_c"]   = latency["receiving_region"].map(cont_map)

    # Undirected mean per continent pair
    latency["pair"] = latency.apply(
        lambda r: tuple(sorted([r["from_c"], r["to_c"]])), axis=1
    )
    c_lat = latency.groupby("pair")["milliseconds"].median().reset_index()

    # Build symmetric matrix
    mat = {}

    for _, row in c_lat.iterrows():
        a, b = row["pair"]; ms = row["milliseconds"]
        mat[(a, b)] = ms
        mat[(b, a)] = ms

    regions = (
        regions.groupby("Continent")[["Nearest City Longitude", "Nearest City Latitude"]]
        .mean()
        .rename(columns={"Nearest City Longitude": "lon", "Nearest City Latitude": "lat"})
    )

    regions["Nearest City Longitude"] = regions["lon"]
    regions["Nearest City Latitude"] = regions["lat"]
    regions["gcp_region"] = regions.index
    regions["Region"] = regions.index
    regions["Region Name"] = regions.index

    return regions, mat


def plot_latency_heatmap():
    regions = pd.read_csv(os.path.join(DATA_DIR, "gcp_regions.csv"))
    latency = pd.read_csv(os.path.join(DATA_DIR, "gcp_latency.csv"))

    region_data, latency_dicts = convert_to_marco_regions(regions, latency)

    regions_index = region_data.index
    total_latency = {}

    max_latency = max(latency_dicts.values())
    for region in regions_index:
        total_latency[region] = {}
        for other_region in regions_index:
            if region == other_region:
                total_latency[region][other_region] = 0
            else:
                total_latency[region][other_region] = latency_dicts.get((region, other_region), max_latency)

    df = pd.DataFrame(total_latency)

    plt.figure(figsize=(8, 6), dpi=300)
    ax = sns.heatmap(df, annot=True, fmt=".2f", cmap="viridis",linewidth=.5,annot_kws={"size": 14})
    cbar = ax.collections[0].colorbar
    cbar.set_label("Median Latency (ms)", fontsize=12)
    ax.tick_params(axis="x", labelsize=14)
    ax.tick_params(axis="y", labelsize=14)
    output_path = os.path.join(FIGURE_DIR, "latency_heatmap.pdf")
    plt.savefig(output_path, dpi=300, bbox_inches="tight")


if __name__ == "__main__":
    plot_latency_heatmap()
