# Geographical Decentralization Simulation

## Installation

Please install Python and the dependencies by running the following command:
```bash
pip install -r requirements.txt
```

## Evaluations

### Baseline

Run the simulation with homogeneous validators and homogeneous information sources.

```bash
cd evaluation
fab run-baseline
```

### Heterogeneous Information Sources

Run the simulation with homogeneous validators but heterogeneous information sources. Specifically, we focus on two cases:
- `latency-aligned`: Information sources are placed in regions with low latency (Asia, Europe, and North America).
- `latency-misaligned`: Information sources are placed in regions with high latency (Africa, Oceania, South America).

```bash
cd evaluation
fab run-heterogeneous-information-sources
```

### Heterogeneous Validators
Run the simulation with homogeneous information sources but heterogeneous validators. Specifically, the validators are sampled from the [real-world distribution](https://dune.com/data/dune.rig_ef.validator_metadata).

```bash
cd evaluation
fab run-heterogeneous-validators
```

### Both Are Heterogeneous
Run the simulation with heterogeneous validators and heterogeneous information sources.

```bash
cd evaluation
fab run-hetero-both
```

### Other Experiments

We also test other settings to further understand how consensus changes would affect geographical decentralization.
<details><summary><b>evaluation details</b> <i>:: click to expand ::</i></summary>
<div>

```bash
# test eip-7782
cd evaluation
run-eip7782 
```

```bash
# test different \gamma (consensus threshold)
cd evaluation
run-different-gammas
```
</div>
</details>