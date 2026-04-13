import argparse
from pathlib import Path

from analytics_payloads import build_preprocessed_payload_from_output_dir


def preprocess_simulation_data(
    data_dir,
    output_dir,
    model="SSP",
    validator_count=None,
    cost=None,
    delta=None,
    cutoff=None,
    gamma=None,
    description=None,
    source_label_style="published",
):
    output_dir_path = Path(output_dir)
    return build_preprocessed_payload_from_output_dir(
        data_dir=data_dir,
        output_dir=output_dir_path,
        model=model,
        validator_count=validator_count,
        cost=cost,
        delta=delta,
        cutoff=cutoff,
        gamma=gamma,
        description=description,
        source_label_style=source_label_style,
        output_file=output_dir_path / "preprocessed_data.json",
        verbose=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Preprocess simulation data for optimized loading.")
    parser.add_argument(
        "--data-dir",
        "-d",
        type=str,
        default="data",
        help="Path to the data folder containing region data.",
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        type=str,
        default="default-simulation",
        help="Output directory where simulation results are stored.",
    )
    parser.add_argument(
        "--model",
        "-m",
        type=str,
        default="SSP",
        choices=["SSP", "MSP"],
        help="Simulation model type (SSP or MSP).",
    )
    parser.add_argument(
        "--validator-count",
        type=int,
        default=None,
        help="Explicit validator count for the published-style output metadata (defaults to the first slot total).",
    )
    parser.add_argument(
        "--cost",
        type=float,
        default=None,
        help="Migration cost to include in the preprocessed dataset metadata.",
    )
    parser.add_argument(
        "--delta",
        type=int,
        default=None,
        help="Slot time in milliseconds to include in the preprocessed dataset metadata.",
    )
    parser.add_argument(
        "--cutoff",
        type=int,
        default=None,
        help="Attestation cutoff time in milliseconds to include in the preprocessed dataset metadata.",
    )
    parser.add_argument(
        "--gamma",
        type=float,
        default=None,
        help="Attestation threshold to include in the preprocessed dataset metadata.",
    )
    parser.add_argument(
        "--description",
        type=str,
        default="",
        help="Optional experiment summary to include in the preprocessed dataset metadata.",
    )
    parser.add_argument(
        "--source-label-style",
        type=str,
        default="published",
        choices=["published", "raw"],
        help="How to label the sources array in the output JSON.",
    )

    args = parser.parse_args()
    preprocess_simulation_data(
        args.data_dir,
        args.output_dir,
        args.model,
        validator_count=args.validator_count,
        cost=args.cost,
        delta=args.delta,
        cutoff=args.cutoff,
        gamma=args.gamma,
        description=args.description,
        source_label_style=args.source_label_style,
    )
