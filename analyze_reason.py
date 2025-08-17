import argparse
import pandas as pd

from collections import Counter

def main():
    parser = argparse.ArgumentParser(description="Analyze migration reasons from simulation output.")
    parser.add_argument("action_reasons_file", type=str, help="Path to the action_reasons.csv file")
    args = parser.parse_args()

    df = pd.read_csv(args.action_reasons_file)
    action_reasons = df["Action_Reason"].values.tolist()
    reason_counter = Counter(action_reasons)
    total_actions = len(action_reasons)

    print("Migration Decision Analysis:")
    for reason, count in reason_counter.items():
        percentage = (count / total_actions) * 100
        print(f"{reason}: {count} times ({percentage:.2f}%)")

if __name__ == "__main__":
    main()
