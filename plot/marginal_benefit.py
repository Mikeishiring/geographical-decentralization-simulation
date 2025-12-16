import matplotlib.pyplot as plt
import os
import pandas as pd
import seaborn as sns


CUR_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(CUR_DIR, "..", "data")
FIGURE_DIR = os.path.join(CUR_DIR, "..", "figures")
OUTPUT_DIR = os.path.join(CUR_DIR, "..", "output")


def plot_marginal_benefit_cdf():
    MSP_baseline_dir = os.path.join(OUTPUT_DIR, "baseline", "MSP", "validators_1000_slots_10000_cost_0.0")
    SSP_baseline_dir = os.path.join(OUTPUT_DIR, "baseline", "SSP", "validators_1000_slots_10000_cost_0.0")

    df1 = pd.read_json(os.path.join(MSP_baseline_dir, "utility_increase.json"))
    values1 = df1[0][:1000]
    df2 = pd.read_json(os.path.join(SSP_baseline_dir, "utility_increase.json"))
    values2 = df2[0][:1000]

    data = []
    for v in values1:
        data.append({"value": v, "type": "MSP"})
    for v in values2:
        data.append({"value": v, "type": "SSP"})
    
    df = pd.DataFrame(data)

    plt.figure(figsize=(16, 6), dpi=300)
    sns.set_theme(style="whitegrid")
    ax = sns.ecdfplot(data=df, x="value", hue="type", hue_order=["MSP", "SSP"], linewidth=6.0)
    sns.move_legend(ax, "lower right", fontsize=24, title_fontsize=32, title=None)
    plt.xlabel("Marginal Benefit", fontsize=32)
    plt.ylabel("CDF", fontsize=32)
    plt.xticks(fontsize=28)
    plt.yticks(fontsize=28)
    output_path = os.path.join(FIGURE_DIR, "marginal_benefit.pdf")
    plt.savefig(output_path, bbox_inches="tight")


if __name__ == "__main__":
    plot_marginal_benefit_cdf()
