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
    lede: 'It comes down to timing slack — how long you can wait for a better block before attesters move on. Where you sit on the network map determines your slack, and slack determines your payoff.',
    paragraphs: [
      'External and local block building exploit different latency paths, but both turn your position on the map into money. Two mechanisms do the heavy lifting. The **scaling effect**: under local building, your value advantage grows linearly with the number of signal sources — 10ms closer to each of 40 sources means 40 x 10ms x the MEV growth rate in aggregate advantage. The **double penalty**: under external building, the proposer-supplier latency hits the payoff twice — once when observing block value, once in the round-trip timing budget to attesters.',
      'So validator placement is a trade-off between capturing value and reaching the quorum. That tension is why the same infrastructure change can help one paradigm and hurt the other. The formal analysis in §4 backs this up: reducing propagation delays weakly increases expected payoffs under both paradigms, local building advantages scale linearly with source count, and the two paradigms show provably opposite sensitivities to source placement.',
    ],
    pullQuote: 'Your position on the map is a payoff gradient that rational validators will follow.',
    figureCaption: 'The core comparison: external building optimizes a best-supplier path (double penalty), local building optimizes over many direct information inputs (scaling effect).',
    keyClaim: 'both turn your position on the map into money',
  },
  'analytical-results': {
    lede: 'Before running a single simulation, the paper proves formally that geographic proximity creates economic advantage — and the two paradigms respond to it in structurally opposite ways.',
    paragraphs: [
      'Theorem 5 is the anchor: reducing propagation delays to payoff-relevant parties weakly increases both the optimal release time and the expected payoff. This holds under both paradigms with no parametric assumptions. In other words, latency advantage is not a simulation artifact — it is baked into the structure of the block-building game.',
      'Propositions 6 and 7 expose the scaling gap. Under local building, the payoff difference between two regions scales linearly with source count — many small latency edges add up to a big one. Under external building, the gain tops out at a single best supplier, so adding more suppliers does not widen the gap. Propositions 8 and 9 round out the picture: source placement and slot duration push the two paradigms in provably opposite or asymmetric directions.',
    ],
    pullQuote: 'Geographic advantage is structural, not incidental — and provably so.',
    figureCaption: '§4 bridges the model and the simulation by establishing directional claims that hold without calibration data.',
    keyClaim: 'latency advantage is not a simulation artifact — it is baked into the structure of the block-building game',
  },
  'simulation-design': {
    lede: 'With timing slack, the scaling effect, and the double penalty established formally, the simulation puts these forces on a real map. The design is deliberately simple — each result should be traceable to a specific mechanism.',
    paragraphs: [
      'Validators are agents that compare expected rewards across real cloud regions, then migrate if the gain beats a switching cost. This keeps the model close to a geographic equilibrium story rather than a one-shot optimization snapshot.',
      'The trade-offs of that simplicity are upfront. MEV is deterministic and linear in latency, migration cost is fixed, and information is complete. These assumptions make the engine interpretable and the experiments comparable — but they also set hard boundaries on what the results can claim about production Ethereum.',
    ],
    pullQuote: 'The model targets structural pressure on geography, not an empirical reproduction of block production.',
    figureCaption: 'The simulation design is intentionally legible: 40 measured regions, 1,000 validators, 20 independent runs per configuration, results commonly reported over 10,000 slots.',
    keyClaim: 'MEV is deterministic and linear in latency, migration cost is fixed, and information is complete',
  },
  'baseline-results': {
    lede: 'Starting from a uniform spread, both paradigms centralize — but through very different mechanisms and to very different degrees.',
    paragraphs: [
      'The scaling effect dominates: local building drives the Gini coefficient above 0.75 within a few thousand slots, versus ~0.26 for external. HHI reaches 0.62 versus 0.18. Local building also leaves only 1 region needed to break liveness, compared to 2 under external. Because local building is additive — advantages compound across all sources — the optimization landscape funnels validators into the narrow geographic overlap between source proximity and attester reachability.',
      'External building still centralizes, but the double penalty is bounded: since the proposer relies on a single best supplier rather than aggregating many sources, there is no scaling effect. The resulting map depends more on supplier geography and the proposer-supplier-attester chain, making it more path-dependent than deterministic.',
    ],
    pullQuote: 'From a uniform start, local building reaches 3x the geographic concentration of external.',
    figureCaption: 'The baseline establishes the reference: local building produces roughly 3x the concentration, while PBS reduces validator clustering relative to local scenarios.',
    keyClaim: 'local building drives the Gini coefficient above 0.75 within a few thousand slots',
  },
  'se1-source-placement': {
    lede: 'Where you put infrastructure is not a neutral choice. The two paradigms respond in opposite directions to the same geographic changes.',
    paragraphs: [
      'The headline from EXP 1: aligned and misaligned placements flip which paradigm centralizes harder. The scaling effect makes local building concentrate faster when sources cluster in low-latency hubs — if a proposer is 10ms closer to each of 40 sources, the aggregate value gain is 40 x 10ms x the MEV growth rate. Advantages compound across all sources at once, so aligned placement (where value capture and consensus pressure pull the same direction) accelerates centralization.',
      'The double penalty makes external building concentrate faster when suppliers sit in high-latency regions: proposer-supplier latency hits payoffs twice, both in observing block value and in the round-trip timing budget to attesters. HHI jumps from 0.79 (well-connected suppliers) to 0.97 (poorly connected ones). Misalignment widens the supplier bottleneck, so co-location incentives intensify rather than relax.',
    ],
    pullQuote: 'The same geography can stabilize one paradigm and destabilize the other.',
    figureCaption: 'EXP 1 shows the two paradigms represent distinct latency geometries with opposite sensitivities to infrastructure placement.',
    keyClaim: 'aligned and misaligned placements flip which paradigm centralizes harder',
  },
  'se2-distribution': {
    lede: 'The scaling effect and double penalty assume validators start from a uniform map. But what happens when the system is already geographically unequal?',
    paragraphs: [
      'When the simulation uses a realistic validator distribution — concentrated in the US and Europe, based on Chainbound data — both paradigms converge quickly because the system starts near its eventual attractor.',
      'Paradigm choice still matters, but EXP 2 shows that starting geography can outweigh paradigm differences for the first-order outcome. No single mechanism explains all observed concentration on its own.',
    ],
    pullQuote: 'If the system starts centralized, the paradigm mostly determines how the imbalance amplifies, not whether it exists.',
    figureCaption: 'EXP 2 shifts the question from "which paradigm centralizes more?" to "how much is determined by the starting distribution?"',
    keyClaim: 'starting geography can outweigh paradigm differences for the first-order outcome',
  },
  'se3-joint': {
    lede: 'Joint heterogeneity produces a temporary dip in concentration — but it does not last.',
    paragraphs: [
      'In the combined heterogeneous case, a brief reduction in concentration appears under external building when suppliers sit in poorly connected regions relative to the already-concentrated validator map. This is one of the few configurations where the model briefly moves away from concentration before resuming the centralizing trend.',
      'The paper reads this dip as a transient artifact of competing geographic pulls rather than a decentralization mechanism. Diagnosing structural pressures is the goal — not overclaiming transient effects.',
    ],
    pullQuote: 'A temporary dip in Gini is not the same thing as decentralization.',
    figureCaption: 'EXP 3 highlights why distinguishing transient trajectories from stable equilibrium changes matters.',
    keyClaim: 'transient artifact of competing geographic pulls, not a recipe for decentralization',
  },
  'se4a-attestation': {
    lede: 'In the homogeneous setup, the same protocol parameter pushes the two paradigms in opposite directions.',
    paragraphs: [
      'Raising the attestation threshold makes external building centralize more because the supplier path becomes more timing-sensitive. The proposer gains more by clustering tightly around whatever supplier geography minimizes end-to-end delay.',
      'For local building, a higher threshold forces a harder trade-off between attester proximity and information-source proximity. Because those geographic objectives do not perfectly overlap, stronger timing pressure can actually disperse the equilibrium rather than compress it.',
    ],
    pullQuote: 'The same timing rule centralizes one paradigm and disperses the other.',
    figureCaption: 'EXP 4a shows that tighter timing requirements do not affect geographic concentration uniformly across paradigms.',
    keyClaim: 'the same protocol parameter pushes the two paradigms in opposite directions',
  },
  'se4b-slots': {
    lede: 'Shorter slots barely change where validators end up — but they make the reward distribution more unequal along the way.',
    paragraphs: [
      'Moving to 6-second slots leaves the broad geographic equilibrium mostly intact. The same regions stay attractive, the same concentration tendencies persist.',
      'What does change is reward variance. When the slot is shorter, a fixed latency advantage eats a bigger share of the available timing budget, raising the coefficient of variation by 5-10% across regions. That increases the penalty for sitting outside the favored corridors even if the final map does not shift dramatically.',
    ],
    pullQuote: 'Shorter slots amplify inequality faster than they rewrite the geography.',
    figureCaption: 'EXP 4b shows that protocol timing changes can affect reward distribution without substantially altering the geographic equilibrium.',
    keyClaim: 'a fixed latency advantage eats a bigger share of the available timing budget',
  },
  discussion: {
    lede: 'The discussion is diagnostic, not prescriptive — it identifies structural levers that could influence geographic outcomes without endorsing specific fixes.',
    paragraphs: [
      'Several mitigation directions are on the table: weakening proposer monopoly power through decentralized block building (BuilderNet, MCP), dampening latency sensitivity via MEV-burn, and encouraging geographic diversity among suppliers and signal sources. The framework can also analyze ePBS dynamics — removing relay chokepoints could reshape the geographic equilibrium by eliminating the anchors that currently pin the optimization landscape under external building.',
      'The big takeaway is that geographic concentration is endogenous to the timing structure of the protocol — not an accident of history. Empirical work from DataAlways supports this: PBS reduces validator clustering but transfers geographic risk to builder concentration. Protocol design shapes geography, and seemingly neutral parameter changes can redistribute advantage toward low-latency regions.',
    ],
    pullQuote: 'Protocol design shapes geography — parameter changes redistribute advantage toward low-latency regions.',
    figureCaption: 'Mitigation ideas are included as design directions, not as validated recommendations from this model.',
    keyClaim: 'geographic concentration is endogenous to the timing structure of the system',
  },
  limitations: {
    lede: 'The paper is upfront about where its model stops — every simplification and what it trades away.',
    paragraphs: [
      'Each assumption buys tractability at the cost of realism: a mean-field approximation that treats migrations as independent, fixed information-source parameters, instantaneous relocation, latency as the sole location factor, and calibration to GCP regions alone. These choices make the simulations legible and comparable, but they also cap what the results can say.',
      'The paper keeps these caveats visible throughout. The findings hold within the model\'s scope, but that scope is deliberately narrow — interpret with these constraints in mind.',
    ],
    pullQuote: 'The findings hold within the model\'s scope — but that scope is deliberately narrow.',
    figureCaption: 'The limitations are integral to interpreting the results, not supplementary fine print.',
    keyClaim: 'Each assumption buys tractability at the cost of realism',
  },
}
