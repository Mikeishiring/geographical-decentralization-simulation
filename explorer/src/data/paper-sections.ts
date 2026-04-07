import type { Block } from '../types/blocks'

export type SectionCategory = 'methodology' | 'finding' | 'caveat' | 'discussion'

export interface PaperSection {
  readonly id: string
  readonly number: string
  readonly title: string
  readonly description: string
  readonly category: SectionCategory
  readonly blocks: readonly Block[]
}

export interface Author {
  readonly name: string
  readonly role?: string
  readonly url?: string
  readonly focus?: string
}

export const PAPER_METADATA = {
  title: "Geographical Centralization Resilience in Ethereum's Block-Building Paradigms",
  subtitle: 'An editorial reading layer over Yang, Oz, Wu, and Zhang (2025).',
  citation: 'Yang, Oz, Wu, Zhang (2025) · ACM SIGMETRICS 2026 · arXiv:2509.21475',
  authors: [
    { name: 'Sen Yang', role: 'Yale University', focus: 'Blockchain economics, geographic decentralization', url: 'https://scholar.google.com/citations?user=7mGQ22cAAAAJ' },
    { name: 'Burak Öz', role: 'Flashbots', focus: 'Mechanism design, distributed systems', url: 'https://scholar.google.com/citations?user=_YL_ZSIAAAAJ' },
    { name: 'Fei Wu', role: 'King\'s College London', focus: 'Co-author' },
    { name: 'Fan Zhang', role: 'Yale University', focus: 'MEV, cryptographic protocols, trusted execution', url: 'https://scholar.google.com/citations?user=YTokrfkAAAAJ' },
  ] as readonly Author[],
  abstract: "The paper studies how Ethereum's local and external block-building paradigms interact with validator and information-source distributions to shape geographical positioning incentives. Across the bounded simulations, both paradigms induce location-dependent payoffs and migration incentives, while information asymmetries and consensus parameters modulate the strength of concentration pressure.",
  keyClaims: [
    "Validator geography is modeled as an endogenous response to Ethereum's timing and information structure.",
    'Both local and external block building induce location-dependent payoffs and migration incentives through different latency-critical paths.',
    'Information-source placement and consensus parameters modulate how strongly those incentives amplify centralization pressure.',
  ],
  references: [
    { label: 'arXiv paper', url: 'https://arxiv.org/abs/2509.21475' },
    { label: 'arXiv HTML', url: 'https://arxiv.org/html/2509.21475v3' },
    { label: 'arXiv PDF', url: 'https://arxiv.org/pdf/2509.21475' },
    { label: 'Public dashboard', url: 'https://geo-decentralization.github.io/' },
    { label: 'Simulation repository', url: 'https://github.com/syang-ng/geographical-decentralization-simulation' },
  ],
} as const

export const PAPER_SECTIONS: readonly PaperSection[] = [
  {
    id: 'system-model',
    number: '§3',
    title: 'System Model',
    description: 'Why your position on the map is an economic advantage — and why the two paradigms exploit it differently.',
    category: 'methodology',
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Two-layer geographic game',
        text: 'Validators choose GCP regions to minimize latency on two critical paths: (1) value capture — proximity to MEV information sources (suppliers in external block building, signal sources in local block building), and (2) consensus — proximity to other validators for fast attestation propagation. The tension between these two forces shapes geographic equilibrium.',
        cite: { paperSection: '§3', figure: 'Figure 2' },
      },
      {
        type: 'table',
        title: 'Latency-Critical Paths by Paradigm',
        headers: ['Path', 'External', 'Local'],
        rows: [
          ['Value capture', 'Proposer -> Supplier', 'Sources -> Proposer'],
          ['Consensus', 'Supplier -> Attesters', 'Proposer -> Attesters'],
          ['Hops', '2 (via supplier)', '1 (direct)'],
          ['Optimization target', 'Single best supplier', 'Sum over all sources'],
        ],
        highlight: [3],
        cite: { paperSection: '§3.2' },
      },
    ],
  },
  {
    id: 'simulation-design',
    number: '§5.2',
    title: 'Simulation Design',
    description: 'How the paper tests timing slack, the scaling effect, and the double penalty on 40 real cloud regions.',
    category: 'methodology',
    blocks: [
      {
        type: 'stat',
        value: '40',
        label: 'GCP Regions',
        sublabel: 'Real inter-region latency measurements',
        cite: { paperSection: '§5.2', table: 'Table 1' },
      },
      {
        type: 'stat',
        value: '10,000',
        label: 'Reported Slots',
        sublabel: 'Across 20 independent runs per configuration',
        cite: { paperSection: '§5.2' },
      },
      {
        type: 'stat',
        value: '1,000',
        label: 'Validators',
        sublabel: 'Reference population in the paper runs',
        cite: { paperSection: '§5.2' },
      },
      {
        type: 'insight',
        text: 'Each slot, validators compare expected rewards across all 40 regions and migrate if the net benefit exceeds migration cost. The paper-facing runs are typically shown at 10,000 slots with 1,000 validators across 20 independent runs per configuration, with published dataset families centered on a 0.002 ETH migration cost. The MEV function is deterministic and linear in latency, which the paper treats as a modeling limitation rather than a claim about production Ethereum.',
        cite: { paperSection: '§5.2', table: 'Table 2' },
      },
    ],
  },
  {
    id: 'baseline-results',
    number: '§5.3',
    title: 'Baseline Results',
    description: 'Both paradigms centralize from a uniform start — but local building reaches 3x the concentration of external.',
    category: 'finding',
    blocks: [
      {
        type: 'paperChart',
        title: 'Baseline Centralization Metrics: External vs Local',
        dataKey: 'baseline-results',
        cite: { paperSection: '§5.3', experiment: 'baseline', figure: 'Figure 3' },
      },
      {
        type: 'insight',
        text: 'Both paradigms centralize from the homogeneous start, but local block building does so faster and more severely. Migration incentives are amplified under local block building because proposers are jointly sensitive to signal-source proximity and attester proximity, whereas under external block building the marginal benefit is driven primarily by supplier latency alone.',
        cite: { paperSection: '§5.3', figure: 'Figure 3' },
      },
    ],
  },
  {
    id: 'se1-source-placement',
    number: '§5.4',
    title: 'EXP 1: Information-Source Placement',
    description: 'Moving infrastructure to the same place helps one paradigm and hurts the other.',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'Opposite paradigm sensitivities',
        text: 'Under local block building, **latency-aligned** sources centralize more rapidly — low-latency regions benefit both value capture and propagation simultaneously. Under external block building, **latency-misaligned** sources exhibit stronger centralization — poorly connected suppliers create a large co-location premium, making migration toward the supplier disproportionately valuable.',
        cite: { paperSection: '§5.4', experiment: 'EXP 1', figure: 'Figure 4' },
      },
    ],
  },
  {
    id: 'se2-distribution',
    number: '§5.5',
    title: 'EXP 2: Heterogeneous Validator Distribution',
    description: 'When validators start where Ethereum already is, the starting map can matter more than the paradigm.',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Concentrated starts compress paradigm differences',
        text: "When validators start from today's concentrated Ethereum geography (Chainbound data), both paradigms converge rapidly to co-location. In this setup, the starting distribution can outweigh paradigm differences for the first-order convergence outcome. Unlike the homogeneous baseline, the two paradigms exhibit **no substantial difference** in convergence speed or degree when incumbent hubs already exist.",
        cite: { paperSection: '§5.5', experiment: 'EXP 2', figure: 'Figure 5' },
      },
    ],
  },
  {
    id: 'se3-joint',
    number: '§5.6',
    title: 'EXP 3: Joint Heterogeneity',
    description: 'A brief dip in concentration that looks like decentralization — but the paper refuses to overclaim it.',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'Transient decentralization under external block building',
        text: "Under external block building with misaligned suppliers, validators initially migrate **away** from incumbent hubs toward supplier regions, briefly improving geographic decentralization. Over time, co-location incentives dominate and concentration returns. This is the only scenario in the paper where Gini temporarily decreases.",
        cite: { paperSection: '§5.6', experiment: 'EXP 3', figure: 'Figure 6' },
      },
      {
        type: 'caveat',
        text: 'This transient effect is fragile and parameter-dependent. It should not be interpreted as a decentralization mechanism.',
      },
    ],
  },
  {
    id: 'se4a-attestation',
    number: '§5.7.1',
    title: 'EXP 4a: Attestation Threshold (gamma)',
    description: 'Tighter timing centralizes external building more — but can actually disperse local building.',
    category: 'finding',
    blocks: [
      {
        type: 'paperChart',
        title: 'Attestation Threshold Effect Across Paradigms',
        dataKey: 'se4a-attestation',
        cite: { paperSection: '§5.7.1', experiment: 'EXP 4a', figure: 'Figure 7' },
      },
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'EXP 4a pulls the paradigms in opposite directions',
        text: 'Within EXP 4a\'s homogeneous validator-and-source setup, higher gamma amplifies external centralization (tighter timing makes supplier proximity more valuable) but dampens local centralization (forces a trade-off between attester proximity and signal proximity that points in different geographic directions). This is a notable paradigm-sensitive protocol result in the paper, not a claim that the same sign-flip holds across every setup.',
        cite: { paperSection: '§5.7.1', experiment: 'EXP 4a' },
      },
    ],
  },
  {
    id: 'se4b-slots',
    number: '§5.7.2',
    title: 'EXP 4b: Shorter Slot Times (EIP-7782)',
    description: 'Halving slot time barely moves the map — but raises reward inequality by 5-10%.',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Same trajectories, higher reward variance',
        text: 'Halving slot time to 6s leaves centralization trajectories (Gini, HHI, LC) **largely unchanged** — proposers face the same co-location trade-offs. But CV_g (reward variance) increases by 5-10%: a fixed latency advantage becomes a larger fraction of the shortened timing window, amplifying cross-regional reward disparities without changing the geographic equilibrium.',
        cite: { paperSection: '§5.7.2', experiment: 'EXP 4b', figure: 'Figure 8' },
      },
    ],
  },
  {
    id: 'discussion',
    number: '§6.1-§6.2',
    title: 'Discussion: Implications & Mitigations',
    description: 'Protocol design shapes geography. What the paper suggests — and why it stops short of prescriptions.',
    category: 'discussion',
    blocks: [
      {
        type: 'table',
        title: 'Potential Mitigation Directions',
        headers: ['Strategy', 'Mechanism', 'Trade-off'],
        rows: [
          ['Decentralized block building', 'Weaken single-proposer monopoly via BuilderNet or Multiple Concurrent Proposers (MCP)', 'May introduce new strategic positioning incentives for exclusive order flow'],
          ['MEV-burn', 'Dampen payoff differences from timing games, reducing latency-driven migration incentives', 'Primarily motivated by economic fairness; geographic effect is indirect'],
          ['Supplier/source geographic diversity', 'Encourage geographic spread of builders, relays, and signal sources via governance or protocol incentives', 'Requires coordination across independent infrastructure operators'],
          ['Enshrined PBS (ePBS)', 'Remove relay chokepoints that act as geographic anchors, potentially redistributing the optimization landscape', 'May shift concentration from relays to builders; framework can analyze but paper does not predict the outcome'],
        ],
        cite: { paperSection: '§6.2' },
      },
      {
        type: 'caveat',
        text: 'The authors frame these as potential directions informed by their analysis, not as definitive remedies. The paper\'s contribution is diagnostic (measuring the problem) rather than prescriptive (solving it).',
      },
    ],
  },
  {
    id: 'limitations',
    number: '§6.3',
    title: 'Limitations',
    description: 'Where confidence should stop — every modeling simplification and what it trades away.',
    category: 'caveat',
    blocks: [
      {
        type: 'table',
        title: 'Paper Limitations',
        headers: ['Assumption', 'Impact', 'Extension'],
        rows: [
          ['Mean-field approximation', 'Treats validator migrations as independent, potentially underestimating clustering feedback loops', 'Correlated migration model with feedback dynamics'],
          ['Fixed information-source parameters', 'Abstracts from dynamic MEV progression and changing source landscapes', 'Time-varying source model reflecting MEV market evolution'],
          ['Simplified migration model', 'Instantaneous relocation ignores real adjustment delays and heterogeneous switching costs', 'Gradual migration with heterogeneous cost functions'],
          ['Latency-only location factors', 'Does not capture regulatory, electricity cost, or infrastructure availability drivers', 'Multi-factor location model with non-latency variables'],
          ['GCP-region calibration', 'May not fully represent all real-world network topologies and provider diversity', 'Multi-provider latency dataset validation'],
        ],
        cite: { paperSection: '§6.3' },
      },
    ],
  },
] as const
