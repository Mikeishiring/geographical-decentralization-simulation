export interface PaperNarrative {
  readonly lede: string
  readonly paragraphs: readonly string[]
  readonly pullQuote: string
  readonly figureCaption: string
  /** Substring within paragraphs to highlight as the key claim callout */
  readonly keyClaim?: string
  readonly sourceRefs?: {
    readonly lede?: { readonly label: string; readonly kind: string; readonly page?: number }
    readonly paragraphs?: ReadonlyArray<{ readonly label: string; readonly kind: string; readonly page?: number } | undefined>
    readonly pullQuote?: { readonly label: string; readonly kind: string; readonly page?: number }
  }
}

export const PAPER_NARRATIVE: Record<string, PaperNarrative> = {
  'system-model': {
    lede: 'The core concept is timing slack — how long a proposer can afford to wait for a more valuable block before attesters move on. A validator\'s position on the network map determines its available slack, which in turn determines its expected payoff.',
    paragraphs: [
      'External and local block building expose different latency-critical paths, but both transform regional network position into economic advantage. The paper identifies two mechanisms. The **scaling effect**: under local block building, value advantage scales linearly with the number of signal sources — 10ms closer to each of 40 sources yields 40 x 10ms x the MEV growth rate in aggregate advantage. The **double penalty**: under external block building, proposer-supplier latency enters the payoff calculation twice — once in observing block value, once in the round-trip timing budget to attesters.',
      'Validator placement thus involves a trade-off between value capture and quorum reachability. This tension explains why the same infrastructure change can help one paradigm and hurt the other. The formal analysis in §4 confirms that reducing propagation delays weakly increases expected payoffs under both paradigms, that local building advantages scale linearly with the number of sources, and that the two paradigms show provably opposite sensitivities to source placement.',
    ],
    pullQuote: 'Network geography creates a payoff gradient that rational validators are expected to follow.',
    figureCaption: 'The core comparison is the latency path itself: external block building optimizes a best-supplier path (double penalty), while local block building optimizes over many direct information inputs (scaling effect).',
    keyClaim: 'both transform regional network position into economic advantage',
  },
  'simulation-design': {
    lede: 'With timing slack, the scaling effect, and the double penalty established formally, the simulation examines how these forces play out on a real map. The design is deliberately simplified to isolate causal mechanisms and make each result interpretable.',
    paragraphs: [
      'Validators are agents that repeatedly compare expected rewards across measured cloud regions, then migrate if the gain exceeds switching cost. That design keeps the paper close to a geographic equilibrium story rather than a one-off optimization snapshot.',
      'The trade-offs of that clarity are explicit. MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete. Those assumptions make the engine more interpretable, but the paper is careful to treat them as modeling limits rather than claims about production Ethereum.',
    ],
    pullQuote: 'The model targets structural pressure on geographic distribution, not empirical reproduction of block production.',
    figureCaption: 'The simulation design is intentionally legible: 40 measured regions, 1,000 validators, 20 independent runs per configuration, and paper-facing results commonly reported over 10,000 slots under bounded modeling assumptions.',
    keyClaim: 'MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete',
  },
  'baseline-results': {
    lede: 'Under the homogeneous starting baseline, both paradigms centralize — but through substantially different mechanisms and to different degrees.',
    paragraphs: [
      'The scaling effect dominates: the model shows local block building driving the Gini coefficient above 0.75 within a few thousand slots, versus ~0.26 for external. HHI reaches 0.62 versus 0.18. Local building also leaves only 1 region needed to break liveness, compared to 2 under external. The additive nature of local block building means the optimization landscape rewards the narrow geographic overlap between source proximity and attester reachability.',
      'External block building still centralizes, but the double penalty turns out to be bounded: since the proposer relies on a single best supplier rather than aggregating many sources, the scaling effect is absent. The resulting map is shaped by supplier geography and the proposer-supplier-attester chain, making it more path-dependent than deterministic.',
    ],
    pullQuote: 'Starting from a uniform validator distribution, local building drives the Gini coefficient above 0.75 within a few thousand slots.',
    figureCaption: 'The baseline comparison establishes the reference for subsequent experiments: local block building produces roughly 3x geographic concentration, while PBS reduces validator clustering relative to local building scenarios.',
    keyClaim: 'local building drives the Gini coefficient above 0.75 within a few thousand slots',
  },
  'se1-source-placement': {
    lede: 'Infrastructure placement is not a neutral background condition. The paradigms respond in opposite directions to the same geographic changes.',
    paragraphs: [
      'The key result in EXP 1 is that aligned and misaligned placements invert the severity of centralization depending on the paradigm. The scaling effect makes local block building centralize faster when sources concentrate in low-latency hubs: if a proposer is 10ms closer to each of 40 sources, the aggregate value gain is 40 x 10ms x the MEV growth rate. Advantages compound across all sources simultaneously, so aligned placement — where value capture and consensus pressure pull in the same direction — accelerates centralization.',
      'The double penalty makes external block building centralize faster when suppliers locate in high-latency regions: proposer-supplier latency affects payoffs twice, both in observing block value and in the round-trip timing budget to attesters. HHI jumps from 0.79 (well-connected suppliers) to 0.97 (poorly connected suppliers). Misalignment widens the supplier bottleneck, so co-location incentives intensify rather than relax.',
    ],
    pullQuote: 'The same geography can be stabilizing in one paradigm and destabilizing in the other.',
    figureCaption: 'EXP 1 demonstrates that the two paradigms represent distinct latency geometries with opposite sensitivities to infrastructure placement.',
    keyClaim: 'aligned and misaligned placements invert the severity of centralization depending on the paradigm',
  },
  'se2-distribution': {
    lede: 'The scaling effect and double penalty assume validators start from a uniform map. But what if the system is already geographically unequal before agents start moving?',
    paragraphs: [
      'When the simulation uses a more realistic validator distribution — concentrated in the US and Europe, based on Chainbound data — both paradigms converge quickly because the system starts near the eventual attractor.',
      'Paradigm choice still matters, but EXP 2 shows that starting geography can outweigh paradigm differences for the first-order outcome. No single mechanism explains all observed concentration on its own.',
    ],
    pullQuote: 'If the system starts centralized, the paradigm mostly changes how the imbalance amplifies, not whether it exists.',
    figureCaption: 'EXP 2 shifts the question from "which paradigm centralizes more?" to "how much of the outcome is determined by the starting distribution?"',
    keyClaim: 'the starting geography can outweigh paradigm differences for the first-order outcome',
  },
  'se3-joint': {
    lede: 'Joint heterogeneity produces a temporary reduction in concentration under certain configurations, but the effect does not persist.',
    paragraphs: [
      'In the combined heterogeneous case, a temporary dip in concentration appears under external block building when suppliers are placed in poorly connected regions relative to the already-concentrated validator geography. This is one of the few configurations where the model briefly moves away from concentration before resuming the centralizing trend.',
      'The paper interprets this dip as a transient artifact of competing geographic pulls rather than a decentralization mechanism. The analysis aims to diagnose structural pressures, not to identify mitigation strategies from transient effects.',
    ],
    pullQuote: 'A temporary dip in Gini is not the same thing as a decentralization mechanism.',
    figureCaption: 'EXP 3 illustrates the importance of distinguishing transient trajectories from stable equilibrium changes.',
    keyClaim: 'temporary artifact of competing geographic pulls, not a recipe for decentralization',
  },
  'se4a-attestation': {
    lede: 'In EXP 4a\'s homogeneous setup, the same protocol parameter moves the two paradigms in opposite directions.',
    paragraphs: [
      'Within the attestation-threshold experiment, raising the threshold makes external block building centralize more because the supplier path becomes more timing-sensitive. The proposer gains more by clustering tightly around the supplier geography that minimizes end-to-end delay.',
      'Conversely, a higher threshold forces local block building into a harder trade-off between attester proximity and information-source proximity. Because those geographic objectives do not perfectly coincide, stronger timing pressure can disperse the equilibrium rather than compress it.',
    ],
    pullQuote: 'The same timing rule centralizes one paradigm and disperses the other.',
    figureCaption: 'The attestation threshold experiment shows that, within a homogeneous setup, tighter timing requirements do not affect geographic concentration uniformly across paradigms.',
    keyClaim: 'in its homogeneous setup, the same protocol parameter moves the two paradigms in opposite directions',
  },
  'se4b-slots': {
    lede: 'Shorter slots do less to change where validators end up than to change how unevenly rewards are distributed on the way there.',
    paragraphs: [
      'The model shows that moving to 6-second slots leaves the broad geographic equilibrium largely intact. The same regions remain attractive, and the same concentration tendencies persist.',
      'What changes is reward variance. When the slot is shorter, a fixed latency advantage consumes a bigger fraction of the available timing budget, raising the coefficient of variation by 5-10% across regions. That raises the penalty for being outside the favored corridors even if the final map does not change dramatically.',
    ],
    pullQuote: 'Shorter slots amplify inequality faster than they rewrite the geography.',
    figureCaption: 'The slot-time experiment shows that protocol changes can affect reward distribution without substantially altering the geographic equilibrium.',
    keyClaim: 'a fixed latency advantage consumes a bigger fraction of the available timing budget',
  },
  discussion: {
    lede: 'The discussion section is diagnostic rather than prescriptive, identifying structural levers that could influence geographic outcomes.',
    paragraphs: [
      'The paper outlines several mitigation directions: weakening proposer monopoly power through decentralized block building (BuilderNet, MCP), dampening latency sensitivity via MEV-burn, and encouraging geographic diversity among suppliers and signal sources. Notably, the framework can also analyze ePBS dynamics — removing relay chokepoints could reshape the geographic equilibrium by eliminating the anchors that currently pin the optimization landscape under external block building.',
      'The central finding is that geographic concentration is endogenous to the timing structure of the protocol — not an accident of history. Empirical work from DataAlways supports this direction: PBS reduces validator clustering but transfers geographic risk to builder concentration. Protocol design shapes geography, and ostensibly neutral parameter changes can redistribute advantage toward low-latency regions.',
    ],
    pullQuote: 'Protocol design shapes geography, and parameter changes can redistribute advantage toward low-latency regions.',
    figureCaption: 'Mitigation ideas are included as design directions, not as recommendations validated by this model.',
    keyClaim: 'geographic concentration is endogenous to the timing structure of the system',
  },
  limitations: {
    lede: 'The paper is explicit about the boundaries of its model and the assumptions underlying each result.',
    paragraphs: [
      'Every simplification in the model trades realism for tractability: a mean-field approximation that treats migrations as independent, fixed information-source parameters, instantaneous relocation, latency as the sole location factor, and calibration to GCP regions alone. These assumptions make the simulations readable and comparable, but they also bound what can be claimed.',
      'The paper surfaces these caveats prominently. The findings hold within the model\'s scope, but that scope is deliberately narrow — results should be interpreted with these constraints in mind.',
    ],
    pullQuote: 'The findings hold within the model\'s scope, but that scope is deliberately narrow.',
    figureCaption: 'The limitations are integral to interpreting the results, not supplementary caveats.',
    keyClaim: 'Every simplification in the model trades realism for tractability',
  },
}
