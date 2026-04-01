import type { Block } from '../types/blocks'
import { GCP_REGIONS } from './gcp-regions'
import { VALIDATOR_COUNTS } from './validator-counts'

// 9 blocks covering all 9 block types — the "executive summary" of the paper.
// Zero API calls. Hand-crafted from Yang et al. (2025) arXiv:2509.21475.

export const DEFAULT_BLOCKS: readonly Block[] = [
  // Row 1: Key stats (3-up grid)
  {
    type: 'stat',
    value: '2',
    label: 'Paradigms Compared',
    sublabel: 'External vs Local block building',
  },
  {
    type: 'stat',
    value: '40',
    label: 'GCP Regions Simulated',
    sublabel: 'across 7 macro-regions worldwide',
  },
  {
    type: 'stat',
    value: '6',
    label: 'Scenario Families',
    sublabel: 'baseline plus five bounded variations',
  },

  // Row 2: Core finding (key-finding emphasis)
  {
    type: 'insight',
    emphasis: 'key-finding',
    title: 'Both paradigms centralize, but differently',
    text: 'Both external and local block building push toward geographic concentration through different latency-critical paths. External block building is shaped more directly by supplier placement, while local block building adds value from many sources and consensus pressure at the same time. Under baseline homogeneous conditions, **local block building centralizes faster and more severely** than external.',
  },

  // Row 3: Head-to-head comparison
  {
    type: 'comparison',
    title: 'External vs Local: Baseline Centralization',
        left: {
          label: 'External Block Building',
          items: [
            { key: 'Convergence speed', value: 'Slower baseline rise' },
            { key: 'Migration cost', value: 'More sensitive to friction' },
            { key: 'Reward variance', value: 'Lower than Local' },
            { key: 'Dominant pull', value: 'Supplier geography' },
          ],
        },
        right: {
          label: 'Local Block Building',
          items: [
            { key: 'Convergence speed', value: 'Faster baseline rise' },
            { key: 'Migration cost', value: 'Less sensitive than External' },
            { key: 'Reward variance', value: 'Higher than External' },
            { key: 'Dominant pull', value: 'Source plus attester overlap' },
          ],
        },
        verdict: 'Local block building centralizes faster in the neutral baseline family, while external block building remains more path-dependent to infrastructure placement and migration cost.',
      },

  // Row 4: Surprising finding
  {
    type: 'insight',
    emphasis: 'surprising',
    title: 'Attestation threshold has opposite effects',
    text: 'Higher γ (attestation threshold) → external block building centralizes **MORE** but local block building centralizes **LESS**. In external block building, tighter timing amplifies latency sensitivity — reducing proposer-supplier latency yields larger marginal MEV. In local block building, a higher threshold forces proposers to balance attester proximity (quorum) vs signal proximity (value), and these point in **different geographic directions**, dispersing rather than concentrating validators. This is the only protocol parameter with opposite effects across paradigms.',
  },

  // Row 5: Validator distribution across the 40 GCP regions used in the paper
  {
    type: 'map',
    title: 'Validator Estimates by GCP Region (Paper Simulation Grid)',
    regions: GCP_REGIONS.map(r => ({
      name: r.id,
      lat: r.lat,
      lon: r.lon,
      value: VALIDATOR_COUNTS[r.id] ?? 0,
      label: r.city.split(',')[0],
    })),
    unit: 'validators (est.)',
  },

  // Row 5b: Map data caveat
  {
    type: 'caveat',
    text: 'These are estimated validator counts mapped to the 40 GCP regions used in the paper\'s simulation grid, not exact node locations. Real validators run on diverse infrastructure; GCP regions serve as a geographic proxy for the latency measurements the model uses.',
  },

  // Row 6a: Caveat
  {
    type: 'caveat',
    text: 'These findings are derived from agent-based simulation using GCP-only latency data. Real validator behavior involves additional factors: stochastic MEV, heterogeneous migration costs, non-fungible information sources, and incomplete latency information. The deterministic linear MEV function is a simplifying assumption.',
  },

  // Row 6b: Sources
  {
    type: 'source',
    refs: [
      {
        label: 'arXiv:2509.21475',
        section: 'Full paper',
        url: 'https://arxiv.org/abs/2509.21475',
      },
      {
        label: 'GitHub: syang-ng/geographical-decentralization-simulation',
        section: 'Source code + data',
        url: 'https://github.com/syang-ng/geographical-decentralization-simulation',
      },
      {
        label: 'Yang, Oz, Wu, Zhang (2025)',
        section: 'Authors',
      },
    ],
  },
] as const

// The curated Tier 1 topic cards (zero API cost)
export type TopicTheme = 'ssp' | 'msp' | 'finding' | 'mitigation' | 'caveat' | 'methodology'

export interface TopicCard {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly theme: TopicTheme
  readonly prompts: readonly string[]
  readonly blocks: readonly Block[]
}

export const OVERVIEW_CARD: TopicCard = {
  id: 'overview',
  title: 'Start with the sharpest questions',
  description: "A curated entry point to the paper's stakes, paradoxes, and caveats.",
  theme: 'finding',
  prompts: [
    'Why is Ethereum geography not neutral in these models?',
    'Why does gamma push external and local block building in opposite directions?',
    'Does starting geography matter more than paradigm choice?',
    'What does this imply for protocol design and infrastructure policy?',
    'What changes under shorter slots: geography or fairness?',
    'Where should confidence stop in this model?',
  ],
  blocks: DEFAULT_BLOCKS,
}

export const TOPIC_CARDS: readonly TopicCard[] = [
  {
    id: 'ssp-vs-msp',
    title: 'Why does local block building centralize faster than external?',
    description: 'The baseline head-to-head, plus the mechanism that makes local block building harsher.',
    theme: 'ssp',
    prompts: [
      'Why does local block building centralize faster than external?',
      'How does external block building compare to local?',
      'What is the baseline External vs Local result?',
      'What mechanism makes local block building more aggressive?',
      'Compare external and local block building under the same baseline.',
    ],
    blocks: [
      {
        type: 'comparison',
        title: 'External vs Local: Baseline Centralization Metrics',
        left: {
          label: 'External Block Building',
          items: [
            { key: 'Mechanism', value: 'Co-locate with supplier' },
            { key: 'Path', value: 'Proposer→Supplier→Attesters (2 hops)' },
            { key: 'Centralizing force', value: 'Supplier latency dominates' },
            { key: 'Baseline tendency', value: 'Centralizes, but usually less than Local' },
          ],
        },
        right: {
          label: 'Local Block Building',
          items: [
            { key: 'Mechanism', value: 'Optimize signal+attester proximity' },
            { key: 'Path', value: 'Proposer→Attesters (1 hop)' },
            { key: 'Centralizing force', value: 'Distributed pull to many sources' },
            { key: 'Baseline tendency', value: 'Centralizes faster and more strongly' },
          ],
        },
        verdict: 'Both centralize, but local block building is faster and more severe under baseline homogeneous conditions.',
      },
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Key mechanical difference',
        text: 'External block building evaluates all (region, supplier) pairs and picks the single best. Local block building sums all signal offers per region — the value function is additive over sources, creating a fundamentally different optimization landscape.',
      },
    ],
  },
  {
    id: 'policy-implications',
    title: 'What does this imply for protocol design?',
    description: 'A first-pass policy and infrastructure lens without pretending the paper has already settled the recommendation.',
    theme: 'mitigation',
    prompts: [
      'What does this imply for protocol design and infrastructure policy?',
      'What are the paper-backed policy implications here?',
      'Which levers look infrastructural versus protocol-level?',
      'Why is this paper more diagnostic than prescriptive?',
    ],
    blocks: [
      {
        type: 'table',
        title: 'Design and Policy Lens',
        headers: ['Lever', 'Paper-backed reading', 'Why restraint matters'],
        rows: [
          ['Shorter slots', 'Raises payoff inequality more clearly than it changes the geographic map', 'Not evidence that slot reduction solves or reverses centralization'],
          ['Attestation threshold', 'Can tighten external block building concentration while loosening local block building concentration', 'The same protocol lever does not generalize across paradigms'],
          ['Supplier / source placement', 'Infrastructure geography changes concentration pressure directly', 'This is partly an ecosystem and operator-coordination problem, not just a core-protocol one'],
          ['MEV-burn / reward dampening', 'Reduces latency-driven payoff differences, weakening migration incentives', 'Primarily motivated by fairness; geographic effect is indirect and untested by this model'],
        ],
      },
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Diagnosis first, recommendation second',
        text: 'The strongest policy claim is diagnostic: Ethereum geography is shaped by timing rules plus infrastructure placement, so "neutral" protocol changes can still redistribute advantage toward low-latency regions. The paper is strongest when it explains where the pressure comes from, not when it speculates about one definitive fix.',
      },
      {
        type: 'caveat',
        text: 'Treat the mitigation table as a menu of research directions, not as validated prescriptions. The model measures concentration pressure; it does not prove which intervention is safest or most effective in production Ethereum.',
      },
    ],
  },
  {
    id: 'geographic-convergence',
    title: 'Why do the same regions keep winning?',
    description: 'Which low-latency hubs dominate, and when the starting state matters more than the paradigm.',
    theme: 'finding',
    prompts: [
      'Why do the same regions keep winning?',
      'Which regions become focal hubs and why?',
      'How much is geography inherited from the starting state?',
      'Where do validators concentrate under each experiment?',
    ],
    blocks: [
      {
        type: 'table',
        title: 'Convergence Loci by Paradigm and Experiment',
        headers: ['Experiment', 'External Convergence', 'Local Convergence'],
        rows: [
          ['Baseline (migration-free)', 'North America becomes a focal hub', 'North America becomes a focal hub faster'],
          ['Baseline (with migration cost)', 'More persistence away from the tightest hubs', 'Still concentrates strongly toward North America'],
          ['SE1: Aligned sources', 'Usually softer than misaligned External', 'Reinforces centralization pressure'],
          ['SE1: Misaligned sources', 'Poorly connected supplier sharpens co-location pull', 'Source vs attester trade-off becomes more visible'],
          ['SE2 / SE3: Real ETH start', 'Existing US+EU hubs dominate; remote suppliers can cause a brief dip first', 'Existing US+EU hubs dominate; source placement matters less'],
        ],
        highlight: [4],
      },
      {
        type: 'insight',
        text: 'The convergence locus depends on where **information sources** are placed, but **real Ethereum validator geography** already concentrates heavily enough that both paradigms inherit much of the answer from the starting state.',
      },
    ],
  },
  {
    id: 'source-placement',
    title: 'Why can moving sources help one paradigm and hurt the other?',
    description: 'SE1 shows the same infrastructure change pushing external and local block building in opposite directions.',
    theme: 'msp',
    prompts: [
      'Why can moving sources help one paradigm and hurt the other?',
      'Why are aligned sources worse for local block building but misaligned sources worse for external?',
      'What does source placement change in the model?',
      'How do source locations change centralization?',
    ],
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Opposite paradigm sensitivities to source placement',
        text: 'Local block building: latency-**aligned** sources centralize MORE (low-latency regions benefit both value capture and propagation). External block building: latency-**misaligned** sources centralize MORE (poorly connected suppliers create a large proposer-supplier gap, making co-location extremely valuable). The same infrastructure change has **opposite effects** depending on the paradigm.',
      },
      {
        type: 'caveat',
        text: 'Exception: local block building + misaligned sources produces LOWER CV_g (reward variance) than baseline — the trade-off between signal proximity and attester proximity creates more balanced rewards even as geographic concentration increases.',
      },
    ],
  },
  {
    id: 'initial-distribution',
    title: 'Does starting geography matter more than paradigm?',
    description: "SE2 asks how much of the result is already baked into today's validator map.",
    theme: 'finding',
    prompts: [
      'Does starting geography matter more than paradigm choice?',
      'What changes when validators start where Ethereum already is?',
      'How much of the outcome is inherited from the real ETH distribution?',
      'How does heterogeneous validator distribution change the result?',
    ],
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Starting geography dominates the first-order outcome',
        text: 'When starting from the real Ethereum distribution, metrics are already elevated and both paradigms converge rapidly. **The starting distribution matters more than the paradigm label** when validators begin concentrated.',
      },
      {
        type: 'insight',
        text: 'Once attester geography is already concentrated, local block building becomes less responsive to source placement. External block building can still deviate transiently when supplier placement is remote from the starting hubs, but that is not a stable decentralization effect.',
      },
    ],
  },
  {
    id: 'attestation-threshold',
    title: 'Why does gamma flip direction across paradigms?',
    description: 'The sharpest paradox in the paper: one protocol lever, opposite geographic effects.',
    theme: 'msp',
    prompts: [
      'Why does gamma flip direction across paradigms?',
      'Why does a higher attestation threshold centralize external block building more but local block building less?',
      "What is the paper's sharpest paradox?",
      'How does higher gamma affect external and local block building?',
    ],
    blocks: [
      {
        type: 'table',
        title: 'Directional Effect of Attestation Threshold',
        headers: ['Gamma move', 'External Block Building', 'Local Block Building'],
        rows: [
          ['Lower γ', 'Looser timing reduces supplier-latency pressure', 'Weaker incentive to balance sources against attesters'],
          ['Higher γ', 'Tighter timing raises centralization pressure', 'Tighter timing can disperse equilibrium by sharpening competing pulls'],
        ],
      },
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'Opposite protocol lever',
        text: 'In external block building, tighter timing (higher γ) amplifies latency sensitivity — reducing proposer-supplier latency yields **larger marginal MEV gains**. In local block building, higher γ forces proposers to balance attester proximity (quorum) vs signal proximity (value). These point in **different geographic directions**, so tightening threshold disperses rather than concentrates. This is the paper\'s most surprising finding.',
      },
    ],
  },
  {
    id: 'shorter-slots',
    title: 'Do shorter slots worsen fairness more than geography?',
    description: 'SE4b separates what changes on the map from what changes in reward inequality.',
    theme: 'finding',
    prompts: [
      'Do shorter slots worsen fairness more than geography?',
      'What changes under 6-second slots?',
      'Does EIP-7782 move the map or mostly the payoff spread?',
      'How do shorter slot times affect centralization?',
    ],
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Trajectories unchanged, reward variance higher',
        text: 'Centralization trajectories (Gini, HHI, LC) remain largely **unchanged** under 6s slots. But CV_g (reward variance) is **higher** for both paradigms — the same latency advantage becomes a larger fraction of the shortened timing window, amplifying reward disparities.',
      },
      {
        type: 'caveat',
        text: 'Implication: further slot time reductions (beyond EIP-7782) may strengthen migration incentives without changing the geographic equilibrium, creating a more unequal but similarly centralized network.',
      },
    ],
  },
  {
    id: 'metrics-explained',
    title: 'How should I read the paper metrics?',
    description: 'A practical guide to Gini_g, HHI_g, CV_g, and LC_g.',
    theme: 'methodology',
    prompts: [
      'How should I read the paper metrics?',
      'Which metric best captures resilience to regional concentration?',
      'What do Gini_g, HHI_g, CV_g, and LC_g mean?',
      'What metrics does the paper use?',
    ],
    blocks: [
      {
        type: 'table',
        title: 'Paper Metrics — Geographic Concentration Measures',
        headers: ['Metric', 'Range', 'Interpretation', 'Ideal (decentralized)'],
        rows: [
          ['Gini_g', '0 → 1', 'Stake inequality across regions', '→ 0 (even distribution)'],
          ['HHI_g', '1/|R| → 1', 'Herfindahl-Hirschman Index', '→ 1/40 = 0.025'],
          ['CV_g', '0 → ∞', 'Coefficient of variation of payoffs', '→ 0 (equal rewards)'],
          ['LC_g', '1 → |R|', 'Min regions to break liveness (Nakamoto coeff.)', '→ 40 (max resilience)'],
        ],
        highlight: [3],
      },
      {
        type: 'caveat',
        text: 'These are NOT the same as measure.py\'s metrics (NNI, Moran\'s I, Geary\'s C). The paper uses custom geographic concentration metrics; the Dash visualization uses spatial statistics metrics.',
      },
    ],
  },
  {
    id: 'limitations',
    title: 'Where should confidence stop?',
    description: "The paper's modeling limits and the research questions they leave open.",
    theme: 'caveat',
    prompts: [
      'Where should confidence stop in this model?',
      'What caveats matter most before generalizing these results?',
      'What assumptions does the paper make?',
      'What are the next research directions?',
    ],
    blocks: [
      {
        type: 'table',
        title: 'Paper Limitations',
        headers: ['Limitation', 'Impact', 'Possible Extension'],
        rows: [
          ['GCP-only latency data', 'Other providers may differ', 'Multi-cloud latency dataset'],
          ['Deterministic linear MEV', 'Real MEV is stochastic', 'Stochastic MEV model'],
          ['Fungible info sources', 'Real suppliers differ in value', 'Heterogeneous source values'],
          ['Full-information assumption', 'Proposers may not know all latencies', 'Partial information model'],
          ['Constant migration cost', 'Real costs vary over time', 'Time-varying cost functions'],
        ],
      },
      {
        type: 'source',
        refs: [
          { label: 'Section 7 — Limitations', section: 'Full discussion of assumptions' },
          { label: 'arXiv:2509.21475', url: 'https://arxiv.org/abs/2509.21475' },
        ],
      },
    ],
  },
] as const
