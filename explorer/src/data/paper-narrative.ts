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
    lede: 'Where you are on the map determines how long you can afford to wait — and waiting is where the money is. Once latency affects both value capture and consensus, geography becomes part of the protocol.',
    paragraphs: [
      'External and local block building expose different latency-critical paths, but both transform regional network position into economic advantage. In external block building, a proposer wants fast access to the best supplier while also keeping supplier-to-attester propagation tight enough to satisfy the attestation threshold. In local block building, the proposer wants to sit where value from many sources accumulates while still remaining close enough to attesters to finalize in time.',
      'That turns validator placement into a geographic game. The paper frames this as a tension between value capture and quorum reachability, and that framing matters because it explains why the same infrastructure change can help one paradigm and hurt the other. Crucially, v3 of the paper does not just simulate this — it proves it formally. Section §4 establishes that reducing propagation delays weakly increases expected payoffs under both paradigms, that local building advantages scale linearly with the number of sources, and that the two paradigms exhibit provably opposite sensitivities to source placement.',
    ],
    pullQuote: 'Geography creates a payoff gradient, and rational validators will follow it.',
    figureCaption: 'The core comparison is the latency path itself: external block building optimizes a best supplier path, while local block building optimizes over many direct information inputs.',
    keyClaim: 'both transform regional network position into economic advantage',
  },
  'simulation-design': {
    lede: 'With the theoretical properties established, the simulation asks: how do these forces play out quantitatively? The design is deliberately simplified, but simplified in a way that makes the causal story easy to inspect.',
    paragraphs: [
      'Validators are agents that repeatedly compare expected rewards across measured cloud regions, then migrate if the gain exceeds switching cost. That design keeps the paper close to a geographic equilibrium story rather than a one-off optimization snapshot.',
      'The costs of that clarity are explicit. MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete. Those assumptions make the engine more interpretable, but the paper is careful to treat them as modeling limits rather than claims about production Ethereum.',
    ],
    pullQuote: 'This is a paper about structural pressure, not about reproducing every empirical detail of block production.',
    figureCaption: 'The simulation design is intentionally legible: 40 measured regions, 1,000 validators, 20 independent runs per configuration, and paper-facing results commonly reported over 10,000 slots under bounded modeling assumptions.',
    keyClaim: 'MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete',
  },
  'baseline-results': {
    lede: 'Under the homogeneous starting baseline, both paradigms centralize. The interesting part is how differently they get there.',
    paragraphs: [
      'Local block building moves faster and ends at roughly three times the geographic concentration of external block building in the baseline runs. The paper attributes that to the additive nature of local block building: value can accumulate from many distributed sources, so the optimization landscape rewards locations that sit at the overlap between source proximity and attester reachability.',
      'External block building still centralizes, but the locus is shaped by supplier geography and the proposer-supplier-attester chain. That makes the final map look different even when the underlying force is still latency-driven concentration.',
    ],
    pullQuote: 'Baseline results matter here because they show centralization without needing exotic assumptions.',
    figureCaption: 'The baseline comparison sets the tone for the rest of the paper: local block building is more aggressive in the default geography, external block building is more path-dependent.',
    keyClaim: 'roughly three times the geographic concentration of external block building',
  },
  'se1-source-placement': {
    lede: 'Infrastructure placement is not a neutral background condition. It changes the shape of the optimization problem itself.',
    paragraphs: [
      'The striking result in EXP 1 is not just that source placement matters, but that aligned and misaligned placements invert the severity of centralization depending on the paradigm. Local block building exhibits a scaling effect: if a proposer is 10 ms closer to each of 40 sources, the aggregate value gain is 40 × 10 ms × the MEV growth rate. Advantages compound across all sources simultaneously, so aligned placement — where value capture and consensus pressure pull in the same direction — accelerates centralization.',
      'External block building exhibits a different dynamic, a double penalty: proposer-supplier latency affects payoffs twice, both in observing block value and in the round-trip to attesters. But because the proposer relies on a single best supplier rather than aggregating many sources, the scaling effect is absent. Misalignment makes the double penalty worse by widening the supplier bottleneck, so co-location incentives intensify rather than relax.',
    ],
    pullQuote: 'The same geography can be stabilizing in one paradigm and destabilizing in the other.',
    figureCaption: 'EXP 1 is the cleanest demonstration that the paper is not merely comparing two labels; it is comparing two different latency geometries. Supplier and relay locations act as geographic anchors that pin the payoff landscape differently under each paradigm.',
    keyClaim: 'aligned and misaligned placements invert the severity of centralization depending on the paradigm',
  },
  'se2-distribution': {
    lede: 'The paper then asks a harder question: what if the system is already geographically unequal before agents start moving?',
    paragraphs: [
      'Using a more realistic validator distribution shifts the interpretation of the results. Once the starting state is already concentrated in the US and Europe, both paradigms converge quickly because the system begins near the eventual attractor.',
      'That result is important for the website because it keeps the narrative honest. Paradigm choice matters, but in EXP 2 the starting geography can outweigh paradigm differences for the first-order outcome. The model is not claiming a single mechanism explains all observed concentration on its own.',
    ],
    pullQuote: 'If the system starts centralized, the paradigm mostly changes how the imbalance amplifies, not whether it exists.',
    figureCaption: 'EXP 2 reframes the story from "which paradigm centralizes more?" to "how much of the outcome was already baked into the starting distribution used in the experiment?"',
    keyClaim: 'the starting geography can outweigh paradigm differences for the first-order outcome',
  },
  'se3-joint': {
    lede: 'Joint heterogeneity is where the paper briefly finds something that looks like relief, then carefully refuses to overclaim it.',
    paragraphs: [
      'In the combined heterogeneous case, the temporary dip in concentration appears under external block building when suppliers are placed in poorly connected regions relative to the already-concentrated validator geography. That makes the trajectory visually unusual because it is one of the only times the model briefly moves away from concentration rather than further into it.',
      'But the paper treats that as a temporary artifact of competing geographic pulls, not a recipe for decentralization. That caution is a good editorial anchor for the whole reader experience: the goal is to diagnose pressures, not to manufacture optimistic takeaways.',
    ],
    pullQuote: 'A temporary dip in Gini is not the same thing as a decentralization mechanism.',
    figureCaption: 'EXP 3 is best read as a warning against overinterpreting transient trajectories as stable system improvements.',
    keyClaim: 'temporary artifact of competing geographic pulls, not a recipe for decentralization',
  },
  'se4a-attestation': {
    lede: 'EXP 4a provides one of the paper\'s clearest paradigm contrasts: in its homogeneous setup, the same protocol parameter moves the two paradigms in opposite directions.',
    paragraphs: [
      'Within the attestation-threshold experiment, raising the threshold makes external block building centralize more because the supplier path becomes more timing-sensitive. The proposer gains more by clustering tightly around the supplier geography that minimizes end-to-end delay.',
      'In that same experiment, a higher threshold forces local block building into a harder compromise between being close to attesters and being close to information sources. Those geographic objectives do not perfectly coincide, so stronger timing pressure can disperse the equilibrium rather than compress it.',
    ],
    pullQuote: 'A notable result here is that timing rules are not paradigm-neutral.',
    figureCaption: 'Attestation threshold is where the paper most clearly shows, within a homogeneous setup, that "faster consensus" and "more centralization" do not move identically across external and local block building.',
    keyClaim: 'in its homogeneous setup, the same protocol parameter moves the two paradigms in opposite directions',
  },
  'se4b-slots': {
    lede: 'Shorter slots do less to change where validators end up than to change how unevenly rewards are distributed on the way there.',
    paragraphs: [
      'The paper finds that moving to 6-second slots leaves the broad geographic equilibrium largely intact. The same regions remain attractive, and the same concentration tendencies persist.',
      'What changes is reward variance. When the slot is shorter, a fixed latency advantage consumes a bigger fraction of the available timing budget, raising the coefficient of variation by 5-10% across regions. That raises the penalty for being outside the favored corridors even if the final map does not change dramatically.',
    ],
    pullQuote: 'Shorter slots amplify inequality faster than they rewrite the geography.',
    figureCaption: 'The slot-time experiment is a reminder that not every protocol change moves the concentration map, but many still change who gets paid.',
    keyClaim: 'a fixed latency advantage consumes a bigger fraction of the available timing budget',
  },
  discussion: {
    lede: 'The discussion section is diagnostic rather than prescriptive, and that is the right tone to preserve in the UI.',
    paragraphs: [
      'The paper sketches mitigation directions: weakening proposer monopoly power through decentralized block building (BuilderNet, MCP), dampening latency sensitivity via MEV-burn, and encouraging geographic diversity among suppliers and signal sources. None of these are presented as settled policy recommendations. Notably, the framework can also be used to analyze ePBS dynamics, where removing relay chokepoints may change the geographic equilibrium — but the paper stops short of that prediction.',
      'That restraint matters. The contribution is to show that geographic concentration is endogenous to the timing structure of the system, not to claim the model has already solved how to counteract it. Empirical work from DataAlways supports the directional finding: PBS reduces validator clustering but transfers geographic risk to builder concentration. The model and the data point in the same direction.',
    ],
    pullQuote: 'If we want a different map, we need to reshape the terrain.',
    figureCaption: 'Mitigation ideas are included as design directions, not as recommendations validated by this model.',
    keyClaim: 'geographic concentration is endogenous to the timing structure of the system',
  },
  limitations: {
    lede: 'The limitations section is one of the most important parts of the paper because it defines where confidence should stop.',
    paragraphs: [
      'Every simplification in the model trades realism for tractability: a mean-field approximation that treats migrations as independent, fixed information-source parameters, instantaneous relocation, latency as the sole location factor, and calibration to GCP regions alone. Those assumptions make the simulations readable and comparable, but they also bound what can be claimed.',
      'For the website, this section should remain close to the end of the reading flow rather than hidden behind a footnote. It keeps the project aligned with the researchers\' intent: truth first, then interpretation.',
    ],
    pullQuote: 'A good research interface should make the caveats feel structural, not optional.',
    figureCaption: 'The limitations list is part of the paper\'s core meaning, not an appendix to ignore.',
    keyClaim: 'Every simplification in the model trades realism for tractability',
  },
}
