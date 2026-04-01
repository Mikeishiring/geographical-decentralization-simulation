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
  citation: 'Yang, Oz, Wu, Zhang (2025) · arXiv:2509.21475',
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
    { label: 'Simulation repository', url: 'https://github.com/syang-ng/geographical-decentralization-simulation' },
  ],
} as const

export const PAPER_SECTIONS: readonly PaperSection[] = [
  {
    id: 'system-model',
    number: '§3',
    title: 'System Model',
    description: 'Geography, consensus, MEV extraction, and information sources.',
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
    number: '§4.1',
    title: 'Simulation Design',
    description: 'Agent-based model setup, migration dynamics, and metric definitions.',
    category: 'methodology',
    blocks: [
      {
        type: 'stat',
        value: '40',
        label: 'GCP Regions',
        sublabel: 'Real inter-region latency measurements',
        cite: { paperSection: '§4.1', table: 'Table 1' },
      },
      {
        type: 'stat',
        value: '10,000',
        label: 'Reported Slots',
        sublabel: 'Paper-facing public datasets',
        cite: { paperSection: '§4.1' },
      },
      {
        type: 'stat',
        value: '1,000',
        label: 'Validators',
        sublabel: 'Reference population in the paper runs',
        cite: { paperSection: '§4.1' },
      },
      {
        type: 'insight',
        text: 'Each slot, validators compare expected rewards across all 40 regions and migrate if the net benefit exceeds migration cost. The paper-facing runs are typically shown at 10,000 slots with 1,000 validators and published dataset families centered on a 0.002 ETH migration cost. The MEV function is deterministic and linear in latency, which the paper treats as a modeling limitation rather than a claim about production Ethereum.',
        cite: { paperSection: '§4.1', table: 'Table 2' },
      },
    ],
  },
  {
    id: 'baseline-results',
    number: '§4.2',
    title: 'Baseline Results',
    description: 'Convergence analysis with the homogeneous initial distribution.',
    category: 'finding',
    blocks: [
      {
        type: 'paperChart',
        title: 'Baseline Centralization Metrics: External vs Local',
        dataKey: 'baseline-results',
        cite: { paperSection: '§4.2', experiment: 'baseline', figure: 'Figure 3' },
      },
      {
        type: 'insight',
        text: 'Both paradigms centralize from the homogeneous start, but local block building does so faster and more severely. Migration incentives are amplified under local block building because proposers are jointly sensitive to signal-source proximity and attester proximity, whereas under external block building the marginal benefit is driven primarily by supplier latency alone.',
        cite: { paperSection: '§4.2', figure: 'Figure 3' },
      },
    ],
  },
  {
    id: 'se1-source-placement',
    number: '§4.3',
    title: 'SE1: Information-Source Placement',
    description: 'Latency-aligned vs misaligned sources and their paradigm-specific effects.',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'Opposite paradigm sensitivities',
        text: 'Under local block building, **latency-aligned** sources centralize more rapidly — low-latency regions benefit both value capture and propagation simultaneously. Under external block building, **latency-misaligned** sources exhibit stronger centralization — poorly connected suppliers create a large co-location premium, making migration toward the supplier disproportionately valuable.',
        cite: { paperSection: '§4.3', experiment: 'SE1', figure: 'Figure 4' },
      },
    ],
  },
  {
    id: 'se2-distribution',
    number: '§4.4',
    title: 'SE2: Heterogeneous Validator Distribution',
    description: 'Starting from real Ethereum validator distribution (Chainbound data).',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Concentrated starts compress paradigm differences',
        text: "When validators start from today's concentrated Ethereum geography (Chainbound data), both paradigms converge rapidly to co-location. In this setup, the starting distribution can outweigh paradigm differences for the first-order convergence outcome. Unlike the homogeneous baseline, the two paradigms exhibit **no substantial difference** in convergence speed or degree when incumbent hubs already exist.",
        cite: { paperSection: '§4.4', experiment: 'SE2', figure: 'Figure 5' },
      },
    ],
  },
  {
    id: 'se3-joint',
    number: '§4.5',
    title: 'SE3: Joint Heterogeneity',
    description: 'Combined source placement + distribution effects, including transient decentralization.',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'Transient decentralization under external block building',
        text: "Under external block building with misaligned suppliers, validators initially migrate **away** from incumbent hubs toward supplier regions, briefly improving geographic decentralization. Over time, co-location incentives dominate and concentration returns. This is the only scenario in the paper where Gini temporarily decreases.",
        cite: { paperSection: '§4.5', experiment: 'SE3', figure: 'Figure 6' },
      },
      {
        type: 'caveat',
        text: 'This transient effect is fragile and parameter-dependent. It should not be interpreted as a decentralization mechanism.',
      },
    ],
  },
  {
    id: 'se4a-attestation',
    number: '§4.6.1',
    title: 'SE4a: Attestation Threshold (gamma)',
    description: 'A paradigm-sensitive contrast in the homogeneous consensus-parameter study.',
    category: 'finding',
    blocks: [
      {
        type: 'paperChart',
        title: 'Attestation Threshold Effect Across Paradigms',
        dataKey: 'se4a-attestation',
        cite: { paperSection: '§4.6.1', experiment: 'SE4a', figure: 'Figure 7' },
      },
      {
        type: 'insight',
        emphasis: 'surprising',
        title: 'SE4a pulls the paradigms in opposite directions',
        text: 'Within SE4a\'s homogeneous validator-and-source setup, higher gamma amplifies external centralization (tighter timing makes supplier proximity more valuable) but dampens local centralization (forces a trade-off between attester proximity and signal proximity that points in different geographic directions). This is a notable paradigm-sensitive protocol result in the paper, not a claim that the same sign-flip holds across every setup.',
        cite: { paperSection: '§4.6.1', experiment: 'SE4a' },
      },
    ],
  },
  {
    id: 'se4b-slots',
    number: '§4.6.2',
    title: 'SE4b: Shorter Slot Times (EIP-7782)',
    description: 'Impact of 6-second slots vs the current 12-second slots.',
    category: 'finding',
    blocks: [
      {
        type: 'insight',
        emphasis: 'key-finding',
        title: 'Same trajectories, higher reward variance',
        text: 'Halving slot time to 6s leaves centralization trajectories (Gini, HHI, LC) **largely unchanged** — proposers face the same co-location trade-offs. But CV_g (reward variance) is higher: a fixed latency advantage becomes a larger fraction of the shortened timing window, amplifying cross-regional reward disparities without changing the geographic equilibrium.',
        cite: { paperSection: '§4.6.2', experiment: 'SE4b', figure: 'Figure 8' },
      },
    ],
  },
  {
    id: 'discussion',
    number: '§5.1-§5.2',
    title: 'Discussion: Implications & Mitigations',
    description: 'Implications plus mitigation directions from the discussion section.',
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
        ],
        cite: { paperSection: '§5.2' },
      },
      {
        type: 'caveat',
        text: 'The authors frame these as potential directions informed by their analysis, not as definitive remedies. The paper\'s contribution is diagnostic (measuring the problem) rather than prescriptive (solving it).',
      },
    ],
  },
  {
    id: 'limitations',
    number: '§5.3',
    title: 'Limitations',
    description: 'Acknowledged assumptions and their potential impact.',
    category: 'caveat',
    blocks: [
      {
        type: 'table',
        title: 'Paper Limitations',
        headers: ['Assumption', 'Impact', 'Extension'],
        rows: [
          ['GCP latency data', 'Other providers may shift the quantitative results', 'Validate against additional provider datasets'],
          ['Deterministic value function', 'Omits stochastic MEV, transaction arrivals, and builder bidding dynamics', 'Stochastic or bidder-specific value model'],
          ['Additive, fungible information sources', 'Ignores source overlap and supplier heterogeneity', 'Model overlapping and heterogeneous sources'],
          ['Full-information benchmark', 'Validators may only observe coarse latency and value estimates', 'Partial-information or noisy-belief model'],
          ['Instant, constant-cost migration', 'Abstracts away heterogeneous costs and adjustment delays', 'Time-varying and heterogeneous migration model'],
        ],
        cite: { paperSection: '§5.3' },
      },
    ],
  },
] as const
