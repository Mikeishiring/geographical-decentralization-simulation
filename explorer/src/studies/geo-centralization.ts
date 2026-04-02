import { OVERVIEW_CARD, TOPIC_CARDS } from '../data/default-blocks'
import { PAPER_CHART_DATA } from '../data/paper-chart-data'
import { PAPER_NARRATIVE } from '../data/paper-narrative'
import { PAPER_METADATA, PAPER_SECTIONS } from '../data/paper-sections'
import type { StudyPackage } from './types'

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

const ARTIFACTS: StudyPackage['artifacts'] = [
  {
    id: 'paper-pdf',
    label: 'arXiv PDF',
    kind: 'paper-pdf',
    summary: 'Canonical PDF version of the geo-decentralization paper.',
    url: 'https://arxiv.org/pdf/2509.21475',
  },
  {
    id: 'paper-html',
    label: 'arXiv HTML',
    kind: 'paper-html',
    summary: 'HTML rendering used for section and appendix anchors.',
    url: 'https://arxiv.org/html/2509.21475v2',
  },
  {
    id: 'simulation-repo',
    label: 'Simulation repository',
    kind: 'code',
    summary: 'Public repository containing the Python simulation and published data artifacts.',
    url: 'https://github.com/syang-ng/geographical-decentralization-simulation',
  },
  {
    id: 'public-dashboard',
    label: 'Published dashboard',
    kind: 'runtime-output',
    summary: 'Public replay of the paper scenarios and published charts.',
    url: 'https://geo-decentralization.github.io/',
  },
  {
    id: 'baseline-figure',
    label: 'Figure 3 baseline replay',
    kind: 'figure',
    summary: 'Baseline centralization metrics for external versus local block building.',
    path: 'explorer/public/paper-figures/fig3-baseline.png',
  },
  {
    id: 'baseline-dataset',
    label: 'Baseline raw slot series',
    kind: 'dataset',
    summary: 'Checked-in baseline simulation outputs for both paradigms.',
    path: 'dashboard/simulations/baseline',
  },
  {
    id: 'source-placement-dataset',
    label: 'SE1 source placement datasets',
    kind: 'dataset',
    summary: 'Latency-aligned and latency-misaligned source placement scenario runs.',
    path: 'dashboard/simulations/heterogeneous_info',
  },
  {
    id: 'validator-start-dataset',
    label: 'SE2 validator distribution datasets',
    kind: 'dataset',
    summary: 'Heterogeneous validator-start runs used in the paper comparison.',
    path: 'dashboard/simulations/heterogeneous_validators',
  },
  {
    id: 'joint-heterogeneity-dataset',
    label: 'SE3 joint heterogeneity datasets',
    kind: 'dataset',
    summary: 'Scenario family combining heterogeneous validators and source placements.',
    path: 'dashboard/simulations/heterogeneous_both',
  },
  {
    id: 'attestation-dataset',
    label: 'SE4a attestation-threshold datasets',
    kind: 'dataset',
    summary: 'Published gamma sweep runs for external and local block building.',
    path: 'dashboard/simulations/different_gammas',
  },
  {
    id: 'slot-time-dataset',
    label: 'SE4b slot-time datasets',
    kind: 'dataset',
    summary: 'Baseline and EIP-7782 slot-time comparison outputs.',
    path: 'dashboard/simulations/eip7782',
  },
  {
    id: 'appendix-e',
    label: 'Appendix E',
    kind: 'appendix',
    summary: 'Migration cost appendix used repeatedly in the editorial layer.',
    url: 'https://arxiv.org/html/2509.21475v2#A5',
  },
]

const CLAIMS: StudyPackage['claims'] = {
  claims: [
    {
      id: 'geo-endogenous-geography',
      text: "Validator geography is endogenous to Ethereum's timing and information structure in the paper's model.",
      sourceIds: ['paper-pdf', 'paper-html'],
      anchors: [
        { kind: 'section', label: '§3', page: 4, sectionId: 'system-model' },
        { kind: 'figure', label: 'Figure 2', page: 5 },
      ],
      evidenceType: 'close-paraphrase',
      presentationMode: 'fact',
      confidence: 0.96,
    },
    {
      id: 'both-centralize-differently',
      text: 'Both paradigms create concentration pressure, but they do so through different latency-critical paths.',
      sourceIds: ['paper-pdf', 'paper-html'],
      anchors: [
        { kind: 'section', label: '§3.2', page: 5, sectionId: 'system-model' },
        { kind: 'table', label: 'Latency-critical paths', page: 5 },
      ],
      evidenceType: 'close-paraphrase',
      presentationMode: 'fact',
      confidence: 0.95,
    },
    {
      id: 'baseline-local-faster',
      text: 'Under the baseline homogeneous setup, local block building centralizes faster and more severely than external block building.',
      sourceIds: ['baseline-figure', 'baseline-dataset', 'paper-pdf'],
      anchors: [
        { kind: 'section', label: '§4.2', page: 7, sectionId: 'baseline-results' },
        { kind: 'figure', label: 'Figure 3', page: 7, artifactId: 'baseline-figure' },
        { kind: 'dataset', label: 'Baseline slot series', artifactId: 'baseline-dataset' },
      ],
      evidenceType: 'derived-from-dataset',
      presentationMode: 'fact',
      confidence: 0.97,
    },
    {
      id: 'source-placement-paradigm-sensitive',
      text: 'Source placement changes the centralization gradient differently by paradigm, with aligned sources strengthening local concentration and misaligned sources strengthening external concentration.',
      sourceIds: ['source-placement-dataset', 'paper-pdf'],
      anchors: [
        { kind: 'section', label: '§4.3', page: 8, sectionId: 'se1-source-placement' },
        { kind: 'figure', label: 'Figure 4', page: 8, artifactId: 'source-placement-dataset' },
      ],
      evidenceType: 'derived-from-dataset',
      presentationMode: 'fact',
      confidence: 0.93,
    },
    {
      id: 'heterogeneous-start-compresses-gap',
      text: 'When validators start from an already concentrated geography, the external versus local outcome gap compresses.',
      sourceIds: ['validator-start-dataset', 'paper-pdf'],
      anchors: [
        { kind: 'section', label: '§4.4', page: 8, sectionId: 'se2-distribution' },
        { kind: 'figure', label: 'Figure 5', page: 8, artifactId: 'validator-start-dataset' },
      ],
      evidenceType: 'derived-from-dataset',
      presentationMode: 'fact',
      confidence: 0.91,
    },
    {
      id: 'gamma-sign-flip',
      text: 'In SE4a, increasing the attestation threshold raises external centralization pressure while reducing local centralization pressure.',
      sourceIds: ['attestation-dataset', 'paper-pdf'],
      anchors: [
        { kind: 'section', label: '§4.6.1', page: 10, sectionId: 'se4a-attestation' },
        { kind: 'figure', label: 'Figure 7', page: 10, artifactId: 'attestation-dataset' },
      ],
      evidenceType: 'derived-from-dataset',
      presentationMode: 'fact',
      confidence: 0.96,
    },
    {
      id: 'shorter-slots-shift-fairness-more-than-geo',
      text: 'Shorter slots mostly preserve the concentration trajectory while increasing reward variance and fairness pressure.',
      sourceIds: ['slot-time-dataset', 'paper-pdf'],
      anchors: [
        { kind: 'section', label: '§4.6.2', page: 10, sectionId: 'se4b-slots' },
        { kind: 'figure', label: 'Figure 8', page: 10, artifactId: 'slot-time-dataset' },
      ],
      evidenceType: 'derived-from-dataset',
      presentationMode: 'fact',
      confidence: 0.9,
    },
    {
      id: 'model-boundary',
      text: 'The deterministic linear MEV function and GCP-only latency measurements are modeling simplifications, not claims about production Ethereum.',
      sourceIds: ['paper-pdf', 'appendix-e'],
      anchors: [
        { kind: 'section', label: '§4.1', page: 6, sectionId: 'simulation-design' },
        { kind: 'appendix', label: 'Appendix E', page: 13, artifactId: 'appendix-e' },
      ],
      evidenceType: 'close-paraphrase',
      presentationMode: 'caveat',
      confidence: 0.95,
      truthBoundary: 'Treat production-Ethereum extrapolations as interpretation unless they remain inside the paper’s bounded simulation assumptions.',
    },
  ],
  featuredClaimIds: [
    'geo-endogenous-geography',
    'baseline-local-faster',
    'gamma-sign-flip',
    'model-boundary',
  ],
}

const GENERATION_DECISION: StudyPackage['generationDecision'] = {
  includedSurfaces: ['paper', 'deep-dive', 'results', 'simulation-lab', 'agent'],
  omittedSurfaces: {
    paper: undefined,
    'deep-dive': undefined,
    results: undefined,
    dashboard: 'duplicate-of-stronger-surface',
    'simulation-lab': undefined,
    agent: undefined,
    community: 'not-supported-by-sources',
  },
  capabilities: [
    'static-reading',
    'figure-replay',
    'exact-runtime',
    'preset-comparisons',
    'agent-grounded-qa',
  ],
  rationale: [
    'This paper is simulation-first, so the site keeps the reading layer, curated results, and runnable preset comparisons.',
    'A generic dashboard surface would duplicate the stronger figure-replay and scenario-comparison results layer.',
    'Community annotations are omitted because the current package does not contain community-state artifacts or moderation rules.',
  ],
}

const SURFACES: StudyPackage['surfaces'] = [
  {
    id: 'paper',
    title: 'Paper',
    purpose: 'Render the canonical editorial reading flow over the paper.',
    enabled: true,
    componentIds: ['paper-hero', 'paper-view-mode-bar', 'section-reader'],
    requiredClaimIds: ['geo-endogenous-geography', 'both-centralize-differently', 'model-boundary'],
    requiredArtifactIds: ['paper-pdf', 'paper-html'],
  },
  {
    id: 'deep-dive',
    title: 'Deep Dive',
    purpose: 'Expose curated topic cards and arguments that group the strongest claims and caveats.',
    enabled: true,
    componentIds: ['topic-card-grid', 'arguments-view', 'editorial-view'],
    requiredClaimIds: ['baseline-local-faster', 'gamma-sign-flip', 'model-boundary'],
    requiredArtifactIds: ['paper-pdf', 'baseline-dataset', 'attestation-dataset'],
  },
  {
    id: 'results',
    title: 'Results',
    purpose: 'Compare the published scenario families with figure replays and supporting datasets.',
    enabled: true,
    componentIds: ['paper-chart-block', 'paper-section-view', 'results-rail'],
    requiredClaimIds: [
      'baseline-local-faster',
      'source-placement-paradigm-sensitive',
      'heterogeneous-start-compresses-gap',
      'gamma-sign-flip',
      'shorter-slots-shift-fairness-more-than-geo',
    ],
    requiredArtifactIds: [
      'baseline-dataset',
      'source-placement-dataset',
      'validator-start-dataset',
      'attestation-dataset',
      'slot-time-dataset',
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    purpose: 'Separate dataset dashboard surface.',
    enabled: false,
    componentIds: ['metric-board', 'dataset-chart'],
    requiredClaimIds: ['baseline-local-faster'],
    requiredArtifactIds: ['baseline-dataset'],
    omissionReason: 'duplicate-of-stronger-surface',
  },
  {
    id: 'simulation-lab',
    title: 'Simulation Lab',
    purpose: 'Allow bounded replay of the paper presets through the backed simulation runtime.',
    enabled: true,
    componentIds: ['simulation-controls', 'preset-strip', 'simulation-results'],
    requiredClaimIds: ['baseline-local-faster', 'gamma-sign-flip', 'model-boundary'],
    requiredArtifactIds: ['simulation-repo', 'public-dashboard', 'baseline-dataset'],
  },
  {
    id: 'agent',
    title: 'Agent',
    purpose: 'Answer grounded questions using claims, citations, and runtime capabilities from the study package.',
    enabled: true,
    componentIds: ['study-context', 'claim-registry', 'citation-stack'],
    requiredClaimIds: [
      'geo-endogenous-geography',
      'baseline-local-faster',
      'gamma-sign-flip',
      'model-boundary',
    ],
    requiredArtifactIds: ['paper-pdf', 'paper-html', 'baseline-dataset'],
  },
  {
    id: 'community',
    title: 'Community',
    purpose: 'Reader-contributed notes and annotations.',
    enabled: false,
    componentIds: ['community-feed'],
    requiredClaimIds: [],
    requiredArtifactIds: [],
    omissionReason: 'not-supported-by-sources',
  },
]

const DASHBOARD_METRICS: StudyPackage['dashboardMetrics'] = [
  {
    id: 'concentration-share',
    label: 'Top-region share',
    unit: 'share of validators',
    sourceArtifactIds: ['baseline-dataset', 'source-placement-dataset', 'validator-start-dataset'],
  },
  {
    id: 'reward-variance',
    label: 'Reward variance',
    unit: 'relative dispersion',
    sourceArtifactIds: ['baseline-dataset', 'slot-time-dataset'],
  },
  {
    id: 'migration-sensitivity',
    label: 'Migration sensitivity',
    unit: 'qualitative pressure',
    sourceArtifactIds: ['baseline-dataset', 'appendix-e'],
  },
  {
    id: 'quorum-pressure',
    label: 'Attestation pressure',
    unit: 'threshold response',
    sourceArtifactIds: ['attestation-dataset'],
  },
  {
    id: 'path-dependence',
    label: 'Path dependence',
    unit: 'trajectory comparison',
    sourceArtifactIds: ['joint-heterogeneity-dataset', 'validator-start-dataset'],
  },
  {
    id: 'geography-skew',
    label: 'Geographic skew',
    unit: 'regional concentration',
    sourceArtifactIds: ['baseline-dataset', 'source-placement-dataset'],
  },
]

const DASHBOARDS: StudyPackage['dashboards'] = [
  {
    id: 'baseline-centralization',
    title: 'Baseline Centralization',
    pattern: 'timeseries-panel',
    questionAnswered: 'How quickly do external and local block building concentrate under the paper baseline?',
    summary: 'Figure-replay view over the baseline slot series with shared concentration and fairness metrics.',
    askMetricKey: 'gini',
    metricIds: ['concentration-share', 'reward-variance', 'migration-sensitivity'],
    sourceArtifactIds: ['baseline-figure', 'baseline-dataset'],
    claimIds: ['baseline-local-faster', 'both-centralize-differently'],
    isFigureReplay: true,
  },
  {
    id: 'source-placement-effects',
    title: 'Source Placement Effects',
    pattern: 'parameter-sweep',
    questionAnswered: 'How does source placement alter centralization pressure by paradigm?',
    summary: 'Compares aligned and misaligned source placements as a bounded scenario sweep.',
    askMetricKey: 'gini',
    metricIds: ['concentration-share', 'geography-skew'],
    sourceArtifactIds: ['source-placement-dataset'],
    claimIds: ['source-placement-paradigm-sensitive'],
    isFigureReplay: true,
  },
  {
    id: 'validator-start-effects',
    title: 'Validator Start Effects',
    pattern: 'pre-post-comparison',
    questionAnswered: 'What changes when validators start from an already concentrated geography?',
    summary: 'Juxtaposes homogeneous and heterogeneous starting distributions to show the compressed paradigm gap.',
    askMetricKey: 'gini',
    metricIds: ['concentration-share', 'path-dependence'],
    sourceArtifactIds: ['validator-start-dataset'],
    claimIds: ['heterogeneous-start-compresses-gap'],
    isFigureReplay: true,
  },
  {
    id: 'joint-heterogeneity',
    title: 'Joint Heterogeneity',
    pattern: 'benchmark-matrix',
    questionAnswered: 'Which joint heterogeneity cases produce temporary decentralization dips, and do they persist?',
    summary: 'Matrix view over the aligned versus misaligned joint runs with emphasis on the temporary external dip.',
    askMetricKey: 'gini',
    metricIds: ['path-dependence', 'concentration-share'],
    sourceArtifactIds: ['joint-heterogeneity-dataset'],
    claimIds: ['source-placement-paradigm-sensitive', 'heterogeneous-start-compresses-gap'],
    isFigureReplay: true,
  },
  {
    id: 'attestation-threshold',
    title: 'Attestation Threshold Sweep',
    pattern: 'parameter-sweep',
    questionAnswered: 'How does gamma alter concentration pressure across paradigms?',
    summary: 'Parameter sweep centered on the SE4a sign-flip between external and local block building.',
    askMetricKey: 'gini',
    metricIds: ['quorum-pressure', 'concentration-share'],
    sourceArtifactIds: ['attestation-dataset'],
    claimIds: ['gamma-sign-flip'],
    isFigureReplay: true,
  },
  {
    id: 'slot-time-comparison',
    title: 'Slot Time Comparison',
    pattern: 'pre-post-comparison',
    questionAnswered: 'What changes under shorter slots: geographic concentration or fairness pressure?',
    summary: 'Compares 12-second and 6-second slots using the published baseline and EIP-7782 outputs.',
    askMetricKey: 'proposal_times',
    metricIds: ['reward-variance', 'concentration-share'],
    sourceArtifactIds: ['baseline-dataset', 'slot-time-dataset'],
    claimIds: ['shorter-slots-shift-fairness-more-than-geo'],
    isFigureReplay: true,
  },
  {
    id: 'geographic-grid',
    title: 'Geographic Grid',
    pattern: 'geography-map',
    questionAnswered: 'Which regions anchor the paper’s simulation geography and concentration proxy?',
    summary: 'Maps the paper’s 40-region grid and the estimated validator distribution proxy used in the editorial layer.',
    askMetricKey: 'hhi',
    metricIds: ['geography-skew'],
    sourceArtifactIds: ['baseline-dataset', 'paper-html'],
    claimIds: ['geo-endogenous-geography', 'model-boundary'],
    isFigureReplay: false,
  },
]

const ASSISTANT: StudyPackage['assistant'] = {
  askHeading: 'Ask a question about the paper',
  askDescription: 'Get grounded answers from the paper, its pre-computed Results datasets, and the exact simulation surfaces. Use Ask for interpretation and orientation; use Run experiment for a bounded what-if loop.',
  askPlaceholder: 'Ask about a mechanism, comparison, metric, or implication...',
  capabilities: [
    {
      id: 'explain-paper',
      title: 'Explain the paper',
      description: 'Summarize mechanisms, caveats, and protocol implications directly from the study package.',
      state: 'live',
      prompts: ['What is the core mechanism that makes geography matter in this paper?'],
    },
    {
      id: 'replay-results',
      title: 'Replay published Results',
      description: 'Pull pre-computed figures, comparisons, and atlas-style summaries into the page underneath the answer.',
      state: 'live',
      prompts: ['Compare the baseline result with the higher gamma result and explain what changes.'],
    },
    {
      id: 'run-exact-loop',
      title: 'Run bounded experiments',
      description: 'Draft and execute an exact simulation loop when a published scenario is not enough.',
      state: 'exact',
      prompts: ['What happens if we double gamma under local block building?'],
    },
    {
      id: 'structured-query',
      title: 'Structured data queries',
      description: 'Query the published Results catalog with constrained ranking, table, and SQL-style asks without leaving the page.',
      state: 'live',
      prompts: ['Show me a table of published runs sorted by final Gini.'],
    },
  ],
  promptTips: [
    {
      id: 'name-a-metric',
      label: 'Name the metric you care about',
      description: 'Mention Gini, HHI, latency, liveness, or attestations so the assistant can choose the right Results family immediately.',
      example: 'How does Gini change under higher gamma?',
    },
    {
      id: 'name-two-scenarios',
      label: 'Ask for a specific comparison',
      description: 'Contrast two scenarios or paradigms explicitly to trigger the comparison path instead of a generic summary.',
      example: 'Compare baseline local vs external block building on fairness pressure.',
    },
    {
      id: 'ask-for-a-table',
      label: 'Ask for a table or ranking',
      description: 'Use list, rank, sorted, or table language when you want a compact data view instead of a prose answer.',
      example: 'Show me the top published runs by final Gini and include the paradigm.',
    },
    {
      id: 'ask-mechanism',
      label: 'Ask why, not just what',
      description: 'After the first answer, ask for the mechanism or paper caveat that explains the observed result.',
      example: 'Why does higher gamma centralize external block building more strongly?',
    },
    {
      id: 'jump-to-experiment',
      label: 'Escalate to an experiment',
      description: 'If the published Results are close but not exact, ask for a bounded run with the variable you want changed.',
      example: 'What should I run if I want to test shorter slots with misaligned sources?',
    },
  ],
  suggestedPrompts: [
    {
      label: 'Mechanism',
      prompt: 'Why does a higher gamma centralize external block building more but disperse local?',
      mode: 'both',
    },
    {
      label: 'Comparison',
      prompt: 'Does starting geography matter more than paradigm choice?',
      mode: 'ask',
    },
    {
      label: 'Geography',
      prompt: 'Why do the same low-latency regions keep winning?',
      mode: 'ask',
    },
    {
      label: 'Design',
      prompt: 'What does this imply for protocol design and supplier policy?',
      mode: 'ask',
    },
    {
      label: 'Timing',
      prompt: 'What changes under shorter slots: geography or fairness?',
      mode: 'ask',
    },
    {
      label: 'Experiment',
      prompt: 'What happens to centralization if we double gamma under local block building?',
      mode: 'experiment',
    },
    {
      label: 'Experiment',
      prompt: 'How does slot time affect geographic fairness under external block building?',
      mode: 'experiment',
    },
    {
      label: 'Realism',
      prompt: 'Does the simplified MEV model bias the results toward external block building?',
      mode: 'ask',
    },
  ],
  resultsStyleGuidance: 'When pre-computed results are available, prefer compact Results-surface formats over generic chat prose: lead with the strongest comparison or metric strip, then use the smallest number of chart, table, map, or comparison blocks needed to make the point. Reuse published atlas framing and terminology before inventing bespoke layouts.',
  systemPromptSupplement: `## Study-Specific Concepts
### External Block Building (PBS / ePBS)
Proposers outsource block construction to specialized suppliers (builders via relays
in current MEV-Boost, or directly under ePBS). The latency-critical path is
proposer-to-supplier for value capture and supplier-to-attesters for consensus.
Validators benefit from co-locating near suppliers.
Note: the simulation engine uses the internal label "SSP" for this paradigm.

### Local Block Building
Proposers construct their own blocks using information from multiple distributed
signal sources. The latency-critical path is sources-to-proposer for value capture
and proposer-to-attesters for consensus. Validators benefit from proximity to both
information sources and attesters.
Note: the simulation engine uses the internal label "MSP" for this paradigm.

## Baseline Results (§4.2)
Both paradigms drive geographic centralization starting from the homogeneous baseline distribution.

- External block building rises more slowly from the neutral baseline and is more sensitive to migration cost.
- Local block building rises faster from the same baseline and tends to show higher reward variance.
- North America is a recurring focal hub in both paradigms.
- With migration costs, external block building retains more persistence away from the tightest hubs than local.

## Reference Tags For Paper Experiments
Use SE1, SE2, SE3, and SE4 as reader-orientation references. Do not present them as stronger than the underlying paper text, exact outputs, or metadata supplied in the current context.

## SE1 Reference: Information-Source Placement (§4.3)
- External + latency-aligned: usually softer than the misaligned external case
- External + latency-misaligned: stronger co-location pressure around a poorly connected supplier
- Local + latency-aligned: stronger centralization than the homogeneous local case
- Local + latency-misaligned: lower reward variance can appear because source and attester pulls diverge

Reference reading: the same infrastructure change can have opposite effects depending on paradigm.

## SE2 Reference: Heterogeneous Initial Distribution (§4.4)
- Uses real Ethereum validator distribution (Chainbound data)
- Both paradigms converge rapidly
- External block building amplifies reward disparities more strongly
- Starting distribution matters a lot when validators are already concentrated

## SE3 Reference: Joint Heterogeneity (§4.5)
- Combines heterogeneous validators with heterogeneous information sources
- External block building with remote or poorly connected suppliers under the heterogeneous validator start can produce transient decentralization early
- This is not a steady state

## SE4a Reference: Attestation Threshold Gamma (§4.6.1)
- External: higher gamma increases centralization
- Local: higher gamma can reduce centralization
- This is one of the paper's most surprising findings

## SE4b Reference: Shorter Slot Times / EIP-7782 (§4.6.2)
- Centralization trajectories are largely unchanged
- Reward variance increases
- Shorter slots amplify relative latency advantage without changing the eventual geographic equilibrium much

## Metrics Definitions
- Gini_g: geographic Gini coefficient
- HHI_g: geographic Herfindahl-Hirschman Index
- CV_g: coefficient of variation of geographic payoffs
- LC_g: liveness coefficient, the minimum number of regions whose failure can break liveness

## Geography
40 GCP regions across 7 macro-regions.
Latency data comes from GCP inter-region measurements in data/gcp_latency.csv.

## Paper Limitations
1. GCP-only latency data
2. Deterministic linear MEV function
3. Fungible information sources
4. Full-information assumption
5. Constant migration cost
6. No multi-paradigm coexistence modeling
7. No strategic behavior such as coalition formation`,
}

export const GEO_CENTRALIZATION_STUDY: StudyPackage = {
  id: 'geo-centralization',
  classification: 'simulation',
  metadata: PAPER_METADATA,
  artifacts: ARTIFACTS,
  claims: CLAIMS,
  generationDecision: GENERATION_DECISION,
  surfaces: SURFACES,
  dashboards: DASHBOARDS,
  dashboardMetrics: DASHBOARD_METRICS,
  sections: PAPER_SECTIONS,
  narratives: PAPER_NARRATIVE,
  overviewCard: OVERVIEW_CARD,
  topicCards: TOPIC_CARDS,
  paperCharts: {
    'baseline-results': {
      data: PAPER_CHART_DATA['baseline-results'],
      dashboardId: 'baseline-centralization',
      askAliases: ['baseline', 'default setup', 'main comparison', '12s slots', 'original setup'],
      description: 'Paper Figure 3 replay over 10,000 slots. One composite figure, four metrics, shared slot axis.',
      takeaway: 'Local block building pulls concentration upward faster and farther than external block building in the baseline setup.',
      metadata: ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', 'gamma = 2/3'],
      figureHref: '/paper-figures/fig3-baseline.png',
      figureLabel: 'Open original paper figure',
      datasetSummary: 'Derived directly from the full raw slot series in the checked-in baseline simulation outputs.',
      repoPaths: [
        'dashboard/simulations/baseline/SSP/cost_0.002/data.json',
        'dashboard/simulations/baseline/MSP/cost_0.002/data.json',
      ],
      publishedScenarioLinks: [
        {
          label: 'Open External replay',
          evaluation: 'Baseline',
          paradigm: 'External',
          result: 'cost_0.002',
        },
        {
          label: 'Open Local replay',
          evaluation: 'Baseline',
          paradigm: 'Local',
          result: 'cost_0.002',
        },
      ],
    },
    'se1-source-placement': {
      data: PAPER_CHART_DATA['se1-source-placement'],
      dashboardId: 'source-placement-effects',
      askAliases: ['source placement', 'information source', 'aligned sources', 'misaligned sources'],
      description: 'Paper Figure 4 replay for latency-aligned versus latency-misaligned information-source placement under both paradigms.',
      takeaway: 'Source placement flips the centralization gradient by paradigm: aligned sources strengthen local concentration, while misaligned suppliers strengthen external concentration.',
      metadata: ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', 'aligned vs misaligned sources'],
      figureHref: '/paper-figures/fig4-se1-sources.png',
      figureLabel: 'Open original paper figure',
      datasetSummary: 'Derived from the published SE1 source-placement datasets, sampled from the checked-in slot series for interactive comparison.',
      repoPaths: [
        'dashboard/simulations/heterogeneous_info/{SSP,MSP}/cost_0.002_latency_{latency-aligned,latency-misaligned}/data.json',
      ],
      publishedScenarioLinks: [
        {
          label: 'Open External aligned replay',
          evaluation: 'SE1-Information-Source-Placement-Effect',
          paradigm: 'External',
          result: 'latency-aligned',
        },
        {
          label: 'Open External misaligned replay',
          evaluation: 'SE1-Information-Source-Placement-Effect',
          paradigm: 'External',
          result: 'latency-misaligned',
        },
        {
          label: 'Open Local aligned replay',
          evaluation: 'SE1-Information-Source-Placement-Effect',
          paradigm: 'Local',
          result: 'latency-aligned',
        },
        {
          label: 'Open Local misaligned replay',
          evaluation: 'SE1-Information-Source-Placement-Effect',
          paradigm: 'Local',
          result: 'latency-misaligned',
        },
      ],
    },
    'se2-distribution': {
      data: PAPER_CHART_DATA['se2-distribution'],
      dashboardId: 'validator-start-effects',
      askAliases: ['heterogeneous validators', 'validator distribution', 'starting geography', 'initial distribution'],
      description: 'Paper Figure 5 replay for the heterogeneous validator-start experiment using the published 0.002 ETH migration-cost runs.',
      takeaway: 'Once validators start from an already concentrated geography, the two paradigms converge toward similarly compressed outcomes.',
      metadata: ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', 'heterogeneous validator start'],
      figureHref: '/paper-figures/fig5-se2-validators.png',
      figureLabel: 'Open original paper figure',
      datasetSummary: 'Derived from the published SE2 heterogeneous-validator datasets, sampled from the checked-in slot series for interactive comparison.',
      repoPaths: [
        'dashboard/simulations/heterogeneous_validators/{SSP,MSP}/cost_0.002_validators_heterogeneous/data.json',
      ],
      publishedScenarioLinks: [
        {
          label: 'Open External replay',
          evaluation: 'SE2-Validator-Distribution-Effect',
          paradigm: 'External',
          result: 'cost_0.002',
        },
        {
          label: 'Open Local replay',
          evaluation: 'SE2-Validator-Distribution-Effect',
          paradigm: 'Local',
          result: 'cost_0.002',
        },
      ],
    },
    'se3-joint': {
      data: PAPER_CHART_DATA['se3-joint'],
      dashboardId: 'joint-heterogeneity',
      askAliases: ['joint heterogeneity', 'combined heterogeneity', 'heterogeneous both', 'validators and sources'],
      description: 'Paper Figure 6 replay for the joint-heterogeneity experiment across aligned and misaligned source placements.',
      takeaway: 'The only temporary decentralization dip appears in the external misaligned case, and it reverses as the run continues.',
      metadata: ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', 'heterogeneous validators + source placement'],
      figureHref: '/paper-figures/fig6-se3-joint.png',
      figureLabel: 'Open original paper figure',
      datasetSummary: 'Derived from the published SE3 joint-heterogeneity datasets, sampled from the checked-in slot series for interactive comparison.',
      repoPaths: [
        'dashboard/simulations/heterogeneous_both/{SSP,MSP}/cost_0.002_latency_{latency-aligned,latency-misaligned}/data.json',
      ],
      publishedScenarioLinks: [
        {
          label: 'Open External aligned replay',
          evaluation: 'SE3-Joint-Heterogeneity',
          paradigm: 'External',
          result: 'latency-aligned',
        },
        {
          label: 'Open External misaligned replay',
          evaluation: 'SE3-Joint-Heterogeneity',
          paradigm: 'External',
          result: 'latency-misaligned',
        },
        {
          label: 'Open Local aligned replay',
          evaluation: 'SE3-Joint-Heterogeneity',
          paradigm: 'Local',
          result: 'latency-aligned',
        },
        {
          label: 'Open Local misaligned replay',
          evaluation: 'SE3-Joint-Heterogeneity',
          paradigm: 'Local',
          result: 'latency-misaligned',
        },
      ],
    },
    'se4a-attestation': {
      data: PAPER_CHART_DATA['se4a-attestation'],
      dashboardId: 'attestation-threshold',
      askAliases: ['higher gamma', 'gamma', 'attestation threshold', 'higher attestation threshold', 'quorum threshold'],
      description: 'Paper Figure 7 replay across four attestation-threshold settings. One composite figure, four metrics, shared slot axis.',
      takeaway: 'Raising gamma increases external centralization pressure while reducing local centralization pressure.',
      metadata: ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', 'gamma in {1/3, 1/2, 2/3, 4/5}'],
      figureHref: '/paper-figures/fig7-se4a-gamma.png',
      figureLabel: 'Open original paper figure',
      datasetSummary: 'Derived directly from the full raw slot series in the checked-in attestation-threshold simulation outputs.',
      repoPaths: [
        'dashboard/simulations/different_gammas/{SSP,MSP}/cost_0.002_gamma_{0.3333,0.5,0.6667,0.8}/data.json',
      ],
      publishedScenarioLinks: [
        {
          label: 'Open External γ=2/3 replay',
          evaluation: 'SE4-Attestation-Threshold',
          paradigm: 'External',
          result: 'gamma_0.6667',
        },
        {
          label: 'Open Local γ=2/3 replay',
          evaluation: 'SE4-Attestation-Threshold',
          paradigm: 'Local',
          result: 'gamma_0.6667',
        },
      ],
    },
    'se4b-slots': {
      data: PAPER_CHART_DATA['se4b-slots'],
      dashboardId: 'slot-time-comparison',
      askAliases: ['shorter slots', 'slot time', '6s slots', '12s vs 6s', 'eip-7782'],
      description: 'Paper Figure 8 replay comparing 12-second and 6-second slots for both paradigms.',
      takeaway: 'Shorter slots mostly preserve the concentration trajectory while increasing the reward-variance gap.',
      metadata: ['1,000 validators', '10,000 slots', 'cost = 0.002 ETH', '12s vs 6s slots'],
      figureHref: '/paper-figures/fig8-se4b-slots.png',
      figureLabel: 'Open original paper figure',
      datasetSummary: 'Derived from the published baseline and EIP-7782 datasets, sampled from the checked-in slot series for interactive comparison.',
      repoPaths: [
        'dashboard/simulations/baseline/{SSP,MSP}/cost_0.002/data.json',
        'dashboard/simulations/eip7782/{SSP,MSP}/cost_0.002_delta_6000_cutoff_3000/data.json',
      ],
      publishedScenarioLinks: [
        {
          label: 'Open External 12s replay',
          evaluation: 'Baseline',
          paradigm: 'External',
          result: 'cost_0.002',
        },
        {
          label: 'Open External 6s replay',
          evaluation: 'SE4-EIP7782',
          paradigm: 'External',
          result: 'delta_6000_cutoff_3000',
        },
        {
          label: 'Open Local 12s replay',
          evaluation: 'Baseline',
          paradigm: 'Local',
          result: 'cost_0.002',
        },
        {
          label: 'Open Local 6s replay',
          evaluation: 'SE4-EIP7782',
          paradigm: 'Local',
          result: 'delta_6000_cutoff_3000',
        },
      ],
    },
  },
  navigation: {
    bestFirstStopIds: ['system-model', 'baseline-results', 'se4a-attestation', 'limitations'],
    pdfUrl: 'https://arxiv.org/pdf/2509.21475',
    htmlUrl: 'https://arxiv.org/html/2509.21475v2',
    sectionPageMap: {
      '§3': 4,
      '§3.1': 5,
      '§3.2': 5,
      '§3.1–3.2': 5,
      '§4': 6,
      '§4.1': 6,
      '§4.2': 7,
      '§4.3': 8,
      '§4.4': 8,
      '§4.5': 9,
      '§4.6.1': 10,
      '§4.6.2': 10,
      '§4.5 + App. E': 9,
      '§5': 11,
      '§5.1': 11,
      '§5.2': 11,
      '§5.3': 11,
      '§5.1-§5.2': 11,
      'App. E': 13,
      'App. E.3': 14,
      'App. E.4': 15,
    },
    sectionHtmlIdMap: {
      'system-model': 'S3',
      'simulation-design': 'S4.SS1',
      'baseline-results': 'S4.SS2',
      'se1-source-placement': 'S4.SS3',
      'se2-distribution': 'S4.SS4',
      'se3-joint': 'S4.SS5',
      'se4a-attestation': 'S4.SS6.SSS1',
      'se4b-slots': 'S4.SS6.SSS2',
      discussion: 'S5',
      limitations: 'S5.SS3',
    },
    appendices: [
      {
        id: 'appendix-a',
        label: 'Appendix A',
        summary: 'List of Google Cloud Platform regions.',
        url: 'https://arxiv.org/html/2509.21475v2#A1',
      },
      {
        id: 'appendix-b',
        label: 'Appendix B',
        summary: 'List of symbols used throughout the model.',
        url: 'https://arxiv.org/html/2509.21475v2#A2',
      },
      {
        id: 'appendix-c',
        label: 'Appendix C',
        summary: 'Marginal benefit distribution.',
        url: 'https://arxiv.org/html/2509.21475v2#A3',
      },
      {
        id: 'appendix-d',
        label: 'Appendix D',
        summary: 'Experiments with different scales.',
        url: 'https://arxiv.org/html/2509.21475v2#A4',
      },
      {
        id: 'appendix-e',
        label: 'Appendix E',
        summary: 'Migration costs.',
        url: 'https://arxiv.org/html/2509.21475v2#A5',
      },
      {
        id: 'appendix-f',
        label: 'Appendix F',
        summary: 'Baseline validator convergence locus.',
        url: 'https://arxiv.org/html/2509.21475v2#A6',
      },
      {
        id: 'appendix-g',
        label: 'Appendix G',
        summary: 'Joint heterogeneity validator convergence locus.',
        url: 'https://arxiv.org/html/2509.21475v2#A7',
      },
    ],
  },
  assistant: ASSISTANT,
  runtime: {
    adapter: 'exact',
    defaultSimulationConfig: {
      paradigm: 'SSP',
      validators: 1000,
      slots: 1000,
      distribution: 'homogeneous',
      sourcePlacement: 'homogeneous',
      migrationCost: 0.0001,
      attestationThreshold: roundTo(2 / 3, 6),
      slotTime: 12,
      seed: 25873,
    },
    paperReferenceOverrides: {
      validators: 1000,
      slots: 10000,
      distribution: 'homogeneous',
      sourcePlacement: 'homogeneous',
      migrationCost: 0.002,
      attestationThreshold: roundTo(2 / 3, 6),
      slotTime: 12,
    },
    simulationPresets: {
      'baseline-ssp': {
        paradigm: 'SSP',
        validators: 1000,
        slots: 10000,
        distribution: 'homogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.002,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
      },
      'baseline-msp': {
        paradigm: 'MSP',
        validators: 1000,
        slots: 10000,
        distribution: 'homogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.002,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
      },
      'latency-aligned': {
        validators: 1000,
        slots: 10000,
        distribution: 'homogeneous',
        sourcePlacement: 'latency-aligned',
        migrationCost: 0.002,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
      },
      'latency-misaligned': {
        validators: 1000,
        slots: 10000,
        distribution: 'homogeneous',
        sourcePlacement: 'latency-misaligned',
        migrationCost: 0.002,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
      },
      'heterogeneous-start': {
        validators: 1000,
        slots: 10000,
        distribution: 'heterogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.002,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
      },
      'eip-7782': {
        validators: 1000,
        slots: 10000,
        distribution: 'homogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.002,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 6,
      },
    },
    canonicalPrewarmConfigs: [
      {
        paradigm: 'SSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'MSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'SSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'latency-aligned',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'MSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'latency-aligned',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'SSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'latency-misaligned',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'MSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'latency-misaligned',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'SSP',
        validators: 1000,
        slots: 1000,
        distribution: 'heterogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'MSP',
        validators: 1000,
        slots: 1000,
        distribution: 'heterogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 12,
        seed: 25873,
      },
      {
        paradigm: 'SSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 6,
        seed: 25873,
      },
      {
        paradigm: 'MSP',
        validators: 1000,
        slots: 1000,
        distribution: 'homogeneous',
        sourcePlacement: 'homogeneous',
        migrationCost: 0.0001,
        attestationThreshold: roundTo(2 / 3, 6),
        slotTime: 6,
        seed: 25873,
      },
    ],
    sourceBlockRefs: [
      {
        label: 'arXiv:2509.21475',
        section: 'Geo-decentralization study',
        url: 'https://arxiv.org/abs/2509.21475',
      },
      {
        label: 'arXiv HTML',
        section: 'Source document',
        url: 'https://arxiv.org/html/2509.21475v2',
      },
      {
        label: 'Public dashboard',
        section: 'Published replays',
        url: 'https://geo-decentralization.github.io/',
      },
      {
        label: 'Simulation repository',
        section: 'Code and datasets',
        url: 'https://github.com/syang-ng/geographical-decentralization-simulation',
      },
    ],
    publishedResults: {
      catalogPath: 'dashboard/assets/research-catalog.js',
      baseDir: 'dashboard',
    },
  },
}
