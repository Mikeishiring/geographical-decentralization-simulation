import type { Exploration } from '../lib/api'

/**
 * Mock community notes for populating the UI when no real notes exist.
 * Each note references a real section ID and quotes real narrative text.
 */

export interface MockReply {
  readonly id: string
  readonly author: string
  readonly body: string
  readonly createdAt: string
  readonly votes: number
}

export interface MockNoteExtras {
  readonly replies: readonly MockReply[]
  /** Original paragraph text from the section being annotated */
  readonly quotedPassage?: string
  /** Section title for display context */
  readonly sectionTitle?: string
  /** Section number (e.g. §3) */
  readonly sectionNumber?: string
}

/** Extra context keyed by note ID */
export const MOCK_NOTE_EXTRAS: Record<string, MockNoteExtras> = {
  'mock-note-1': {
    sectionTitle: 'System Model',
    sectionNumber: '§3',
    quotedPassage:
      'SSP and MSP expose different latency-critical paths, but both transform regional network position into economic advantage. In SSP, a proposer wants fast access to the best relay while also keeping relay-to-attester propagation tight enough to satisfy the attestation threshold.',
    replies: [
      {
        id: 'reply-1a',
        author: 'Danny R.',
        body: 'This maps well to what we see on mainnet — the top builders are almost all US-East or EU-West colocated with relays.',
        createdAt: '2026-03-30T10:15:00Z',
        votes: 3,
      },
      {
        id: 'reply-1b',
        author: 'Livia M.',
        body: 'Worth noting the paper assumes full information though. Real validators don\'t have perfect latency knowledge across all 40 regions.',
        createdAt: '2026-03-30T11:42:00Z',
        votes: 5,
      },
    ],
  },
  'mock-note-2': {
    sectionTitle: 'System Model',
    sectionNumber: '§3',
    quotedPassage:
      'That turns validator placement into a geographic game. The paper frames this as a tension between value capture and quorum reachability, and that framing matters because it explains why the same infrastructure change can help one paradigm and hurt the other.',
    replies: [
      {
        id: 'reply-2a',
        author: 'Kira T.',
        body: 'The "geographic game" framing is the paper\'s best contribution IMO. It reframes centralization from a moral failing to a structural incentive problem.',
        createdAt: '2026-03-29T14:20:00Z',
        votes: 8,
      },
    ],
  },
  'mock-note-3': {
    sectionTitle: 'Baseline Results',
    sectionNumber: '§4.2',
    quotedPassage:
      'MSP moves faster and ends more concentrated in the baseline runs. The paper attributes that to the additive nature of local block building: value can accumulate from many distributed sources, so the optimization landscape rewards locations that sit at the overlap between source proximity and attester reachability.',
    replies: [
      {
        id: 'reply-3a',
        author: 'Alex W.',
        body: 'I ran this with the simulation lab — 5,000 slots is enough to see the divergence. MSP Gini hits 0.7+ while SSP is still around 0.55.',
        createdAt: '2026-03-28T09:30:00Z',
        votes: 4,
      },
      {
        id: 'reply-3b',
        author: 'Sam K.',
        body: 'Does anyone know if the additive MEV model holds for real PBS? Feels like there might be non-linearities from exclusive order flow.',
        createdAt: '2026-03-28T16:05:00Z',
        votes: 2,
      },
      {
        id: 'reply-3c',
        author: 'Livia M.',
        body: 'The limitations section addresses this — they acknowledge MEV is linear in the model. Real-world is definitely more complex.',
        createdAt: '2026-03-28T17:22:00Z',
        votes: 6,
      },
    ],
  },
  'mock-note-4': {
    sectionTitle: 'SE4a: Attestation Threshold',
    sectionNumber: 'App. E.3',
    quotedPassage:
      'Raising the attestation threshold makes SSP centralize more because the relay path becomes more timing-sensitive. The proposer gains more by clustering tightly around the relay geography that minimizes end-to-end delay.',
    replies: [],
  },
  'mock-note-5': {
    sectionTitle: 'SE1: Source Placement',
    sectionNumber: '§4.4',
    quotedPassage:
      'The striking result in SE1 is not just that source placement matters, but that aligned and misaligned placements invert the severity of centralization depending on the paradigm.',
    replies: [
      {
        id: 'reply-5a',
        author: 'Jordan P.',
        body: 'This is the strongest argument for why relay decentralization matters independently of paradigm choice.',
        createdAt: '2026-03-27T13:10:00Z',
        votes: 7,
      },
    ],
  },
  'mock-note-6': {
    sectionTitle: 'Limitations',
    sectionNumber: '§5',
    quotedPassage:
      'Every simplification in the model trades realism for tractability: cloud-only latency, deterministic MEV, full information, fixed migration cost, and no strategic coalition behavior.',
    replies: [
      {
        id: 'reply-6a',
        author: 'Nadia S.',
        body: 'The cloud-only assumption is the biggest gap. Home stakers face completely different latency profiles and cost structures.',
        createdAt: '2026-03-26T08:45:00Z',
        votes: 9,
      },
      {
        id: 'reply-6b',
        author: 'Danny R.',
        body: 'Agreed. But modeling home stakers would require residential ISP data which doesn\'t exist at this granularity. The cloud simplification is defensible.',
        createdAt: '2026-03-26T10:30:00Z',
        votes: 4,
      },
    ],
  },
  'mock-note-7': {
    sectionTitle: 'Discussion',
    sectionNumber: '§5',
    quotedPassage:
      'The paper sketches mitigation directions such as rewarding underrepresented regions, decentralizing relays and sources, or compensating for latency at the protocol layer.',
    replies: [
      {
        id: 'reply-7a',
        author: 'Kira T.',
        body: 'The "rewarding underrepresented regions" idea sounds like geographic affirmative action for validators. Curious how that would interact with MEV smoothing proposals.',
        createdAt: '2026-03-25T15:00:00Z',
        votes: 3,
      },
    ],
  },
  'mock-note-8': {
    sectionTitle: 'SE2: Starting Distribution',
    sectionNumber: '§4.5',
    quotedPassage:
      'Using a more realistic validator distribution shifts the interpretation of the results. Once the starting state is already concentrated in the US and Europe, both paradigms converge quickly because the system begins near the eventual attractor.',
    replies: [
      {
        id: 'reply-8a',
        author: 'Alex W.',
        body: 'This is the "initial conditions matter" finding. I tested it in the sim lab — starting from the real Ethereum distribution, Gini barely moves in the first 2,000 slots.',
        createdAt: '2026-03-29T20:15:00Z',
        votes: 5,
      },
    ],
  },
}

const now = new Date('2026-03-31T12:00:00Z')

function daysAgo(days: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export const MOCK_COMMUNITY_NOTES: readonly Exploration[] = [
  {
    id: 'mock-note-1',
    query: 'System Model',
    summary: 'Selected text: "SSP and MSP expose different latency-critical paths"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 12,
    createdAt: daysAgo(1),
    paradigmTags: ['SSP', 'MSP'],
    experimentTags: [],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'system-model',
      excerpt: 'SSP and MSP expose different latency-critical paths, but both transform regional network position into economic advantage.',
    },
    publication: {
      published: true,
      title: 'Latency paths differ but the economic pressure is identical',
      takeaway: 'Both paradigms convert geographic position into MEV advantage. The relay hop in SSP vs. direct aggregation in MSP changes the shape of the optimization, but validators in both systems are playing the same location game.',
      author: 'Danny R.',
      publishedAt: daysAgo(1),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-2',
    query: 'System Model',
    summary: 'Selected text: "validator placement into a geographic game"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 18,
    createdAt: daysAgo(2),
    paradigmTags: [],
    experimentTags: [],
    verified: true,
    surface: 'reading',
    anchor: {
      sectionId: 'system-model',
      excerpt: 'That turns validator placement into a geographic game.',
    },
    publication: {
      published: true,
      title: 'Centralization is structural, not a moral failure',
      takeaway: 'The "geographic game" framing is the paper\'s key insight. It reframes centralization as an emergent property of timing incentives rather than something validators choose to do wrong. This matters for policy because you can\'t fix structural pressure with moral appeals.',
      author: 'Kira T.',
      publishedAt: daysAgo(2),
      featured: true,
      editorNote: 'Captures the paper\'s core reframing clearly.',
    },
  },
  {
    id: 'mock-note-3',
    query: 'Baseline Results',
    summary: 'Selected text: "MSP moves faster and ends more concentrated"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 7,
    createdAt: daysAgo(3),
    paradigmTags: ['MSP'],
    experimentTags: ['baseline'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'baseline-results',
      excerpt: 'MSP moves faster and ends more concentrated in the baseline runs.',
    },
    publication: {
      published: true,
      title: 'MSP centralizes faster under homogeneous starts',
      takeaway: 'The additive MEV model in MSP creates a stronger pull toward overlap regions. I verified this in the simulation lab — at 5,000 slots, MSP Gini is already 0.7+ while SSP hovers around 0.55. The speed difference is the story, not just the endpoint.',
      author: 'Alex W.',
      publishedAt: daysAgo(3),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-4',
    query: 'Attestation Threshold',
    summary: 'Selected text: "Raising the attestation threshold makes SSP centralize more"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 22,
    createdAt: daysAgo(1),
    paradigmTags: ['SSP', 'MSP'],
    experimentTags: ['SE4a'],
    verified: true,
    surface: 'reading',
    anchor: {
      sectionId: 'se4a-attestation',
      excerpt: 'Raising the attestation threshold makes SSP centralize more because the relay path becomes more timing-sensitive.',
    },
    publication: {
      published: true,
      title: 'The gamma paradox: same knob, opposite outcomes',
      takeaway: 'This is the paper\'s most surprising finding. A single protocol parameter — attestation threshold — pushes SSP toward more concentration but disperses MSP. It proves that timing rules are paradigm-dependent, which means any protocol change needs to be evaluated per-paradigm, not in the abstract.',
      author: 'Sam K.',
      publishedAt: daysAgo(1),
      featured: true,
      editorNote: 'The key counterintuitive result.',
    },
  },
  {
    id: 'mock-note-5',
    query: 'Source Placement',
    summary: 'Selected text: "aligned and misaligned placements invert the severity"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 9,
    createdAt: daysAgo(4),
    paradigmTags: ['SSP', 'MSP'],
    experimentTags: ['SE1'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'se1-source-placement',
      excerpt: 'aligned and misaligned placements invert the severity of centralization depending on the paradigm.',
    },
    publication: {
      published: true,
      title: 'Relay placement is not a neutral infrastructure choice',
      takeaway: 'SE1 shows that where you place relays and information sources changes the centralization outcome, and the effect is paradigm-dependent. This is the strongest argument for treating relay decentralization as a first-class protocol concern.',
      author: 'Jordan P.',
      publishedAt: daysAgo(4),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-6',
    query: 'Limitations',
    summary: 'Selected text: "Every simplification in the model trades realism for tractability"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 14,
    createdAt: daysAgo(5),
    paradigmTags: [],
    experimentTags: [],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'limitations',
      excerpt: 'Every simplification in the model trades realism for tractability: cloud-only latency, deterministic MEV, full information, fixed migration cost.',
    },
    publication: {
      published: true,
      title: 'The cloud-only assumption is the biggest gap',
      takeaway: 'Home stakers face completely different latency profiles and cost structures than cloud validators. The paper acknowledges this, but it means the centralization pressures on solo stakers might be even stronger than the model suggests. Residential ISP data at this granularity simply doesn\'t exist yet.',
      author: 'Nadia S.',
      publishedAt: daysAgo(5),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-7',
    query: 'Discussion',
    summary: 'Selected text: "rewarding underrepresented regions"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 5,
    createdAt: daysAgo(6),
    paradigmTags: [],
    experimentTags: [],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'discussion',
      excerpt: 'rewarding underrepresented regions, decentralizing relays and sources, or compensating for latency at the protocol layer.',
    },
    publication: {
      published: true,
      title: 'Mitigation ideas need their own simulation study',
      takeaway: 'The paper wisely presents these as directions, not recommendations. Geographic incentives at the protocol layer would interact with MEV smoothing, PBS designs, and validator economics in ways this model doesn\'t capture. A follow-up study specifically on mitigations would be valuable.',
      author: 'Kira T.',
      publishedAt: daysAgo(6),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-8',
    query: 'Starting Distribution',
    summary: 'Selected text: "starting state is already concentrated in the US and Europe"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 11,
    createdAt: daysAgo(2),
    paradigmTags: ['SSP', 'MSP'],
    experimentTags: ['SE2'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'se2-distribution',
      excerpt: 'Once the starting state is already concentrated in the US and Europe, both paradigms converge quickly.',
    },
    publication: {
      published: true,
      title: 'Initial conditions dominate paradigm choice',
      takeaway: 'SE2 is the humility check. If validators already cluster in US-East and EU-West (which they do on mainnet), the paradigm mostly determines how the existing imbalance amplifies, not whether it exists. This means real-world decentralization efforts need to address geography directly, not just tinker with block-building rules.',
      author: 'Alex W.',
      publishedAt: daysAgo(2),
      featured: false,
      editorNote: '',
    },
  },
]
