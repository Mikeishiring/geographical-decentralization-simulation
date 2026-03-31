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

  /* ── Additional notes (round 2) ────────────────────────────────────── */

  'mock-note-9': {
    sectionTitle: 'Simulation Design',
    sectionNumber: '§4.1',
    quotedPassage:
      'Validators are agents that repeatedly compare expected rewards across measured cloud regions, then migrate if the gain exceeds switching cost. That design keeps the paper close to a geographic equilibrium story rather than a one-off optimization snapshot.',
    replies: [
      {
        id: 'reply-9a',
        author: 'Tomás G.',
        body: 'The "repeatedly compare and migrate" loop is what makes this ABM rather than just an optimization. The path dependence from sequential migration matters — you can\'t just solve for the Nash equilibrium analytically.',
        createdAt: '2026-03-30T09:10:00Z',
        votes: 6,
      },
      {
        id: 'reply-9b',
        author: 'Livia M.',
        body: 'Right, and it means the order in which validators migrate affects the equilibrium. The paper doesn\'t explore this but it would be interesting to see if random vs. sequential ordering changes the Gini.',
        createdAt: '2026-03-30T11:45:00Z',
        votes: 4,
      },
    ],
  },
  'mock-note-10': {
    sectionTitle: 'Simulation Design',
    sectionNumber: '§4.1',
    quotedPassage:
      'MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete. Those assumptions make the engine more interpretable, but the paper is careful to treat them as modeling limits rather than claims about production Ethereum.',
    replies: [
      {
        id: 'reply-10a',
        author: 'Nadia S.',
        body: 'The deterministic MEV assumption is actually fine for what the paper is trying to show. If you added stochastic MEV, you\'d get the same geographic gradient in expectation — just with more noise. The direction of the pressure doesn\'t change.',
        createdAt: '2026-03-28T14:20:00Z',
        votes: 11,
      },
      {
        id: 'reply-10b',
        author: 'Marcus V.',
        body: 'Disagree. Stochastic MEV with fat tails would change the risk profile of migration. A validator might stay put in a suboptimal region if the variance is high enough to occasionally produce outsized rewards. The linear assumption hides this.',
        createdAt: '2026-03-28T15:50:00Z',
        votes: 8,
      },
      {
        id: 'reply-10c',
        author: 'Nadia S.',
        body: 'Fair point on variance-seeking behavior. But the paper is about the mean pressure, not about individual gambling strategies. I think both readings are valid for different questions.',
        createdAt: '2026-03-28T16:30:00Z',
        votes: 5,
      },
    ],
  },

  // ── FLAWED ARGUMENT 1 ──
  'mock-note-11': {
    sectionTitle: 'Simulation Design',
    sectionNumber: '§4.1',
    quotedPassage:
      'MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete. Those assumptions make the engine more interpretable, but the paper is careful to treat them as modeling limits rather than claims about production Ethereum.',
    replies: [
      {
        id: 'reply-11a',
        author: 'Kira T.',
        body: 'This overstates the problem. The linear assumption means the *direction* of geographic pressure is correct even if the magnitude is wrong. The paper isn\'t predicting exact Gini values — it\'s showing that latency creates concentration pressure. That structural claim survives non-linearity.',
        createdAt: '2026-03-27T09:15:00Z',
        votes: 19,
      },
      {
        id: 'reply-11b',
        author: 'Danny R.',
        body: 'Kira is right. The non-linear case would change the steepness of the gradient, not whether it exists. A validator 50ms closer to a relay still earns more than one 50ms further — that holds for any monotone MEV function.',
        createdAt: '2026-03-27T10:30:00Z',
        votes: 14,
      },
      {
        id: 'reply-11c',
        author: 'Marcus V.',
        body: 'Counter-point to the counter-points: a strongly concave MEV function would mean the marginal benefit of being even closer drops off fast, which could actually *reduce* the co-location premium. The linear assumption is load-bearing for the *degree* of centralization, even if the direction survives. The paper\'s quantitative results shouldn\'t be cited as if the structural claim is separate from the model.',
        createdAt: '2026-03-27T12:00:00Z',
        votes: 7,
      },
      {
        id: 'reply-11d',
        author: 'Sam K.',
        body: 'Worth noting that real MEV is actually *super*-linear in many cases (winner-take-all auctions), which would make the centralization pressure *stronger* than the paper shows, not weaker.',
        createdAt: '2026-03-27T14:20:00Z',
        votes: 12,
      },
    ],
  },

  // ── FLAWED ARGUMENT 2 ──
  'mock-note-12': {
    sectionTitle: 'SE4a: Attestation Threshold',
    sectionNumber: 'App. E.3',
    quotedPassage:
      'In MSP, a higher threshold forces a harder compromise between being close to attesters and being close to information sources. Those geographic objectives do not perfectly coincide, so stronger timing pressure can actually disperse the equilibrium rather than compress it.',
    replies: [
      {
        id: 'reply-12a',
        author: 'Jordan P.',
        body: 'This conflates the MEV supply chain with geographic placement. Flashbots Protect changes *who sees the transactions first*, not *where validators are physically located*. The paper models latency between cloud regions, not access to order flow protocols.',
        createdAt: '2026-03-29T16:30:00Z',
        votes: 21,
      },
      {
        id: 'reply-12b',
        author: 'Livia M.',
        body: 'Exactly. Even with perfect MEV democratization, the attestation latency game is still geographic. You still need your block to reach 2/3 of validators faster than anyone else\'s. Flashbots doesn\'t change the speed of light.',
        createdAt: '2026-03-29T17:15:00Z',
        votes: 16,
      },
      {
        id: 'reply-12c',
        author: 'R. Chen',
        body: 'I think there\'s a partial point here though. If Flashbots Protect eliminates the *MEV extraction* advantage of proximity, then the only remaining geographic pressure is the consensus/attestation side. The paper shows both matter — if you remove one leg, the equilibrium does shift. Not "irrelevant" but a real moderating factor.',
        createdAt: '2026-03-29T18:40:00Z',
        votes: 9,
      },
      {
        id: 'reply-12d',
        author: 'Jordan P.',
        body: 'Fair nuance from R. Chen, but the note\'s conclusion that it makes the paper\'s findings "largely irrelevant" doesn\'t follow even from that. The consensus pressure alone is enough to drive concentration in the model.',
        createdAt: '2026-03-29T19:20:00Z',
        votes: 11,
      },
    ],
  },

  'mock-note-13': {
    sectionTitle: 'SE3: Joint Heterogeneity',
    sectionNumber: '§4.5 + App. E',
    quotedPassage:
      'In the combined heterogeneous case, the temporary dip in concentration appears when SSP starts from today\'s concentrated validator geography and relay placement is poorly connected to that start.',
    replies: [
      {
        id: 'reply-13a',
        author: 'Tomás G.',
        body: 'This is the paper\'s most underappreciated finding. It shows that "misalignment between existing infrastructure and existing validators" can temporarily *reduce* concentration. That\'s a specific, testable prediction about what happens when relay geography changes.',
        createdAt: '2026-03-28T08:00:00Z',
        votes: 7,
      },
      {
        id: 'reply-13b',
        author: 'Alex W.',
        body: 'I tried to reproduce the dip in the sim lab. It\'s real but narrow — you need migration cost around 0.002 ETH and the relay has to be significantly misaligned. Outside that window the effect vanishes.',
        createdAt: '2026-03-28T10:30:00Z',
        votes: 10,
      },
    ],
  },
  'mock-note-14': {
    sectionTitle: 'SE4b: Shorter Slot Times',
    sectionNumber: 'App. E.4',
    quotedPassage:
      'The paper finds that moving to 6-second slots leaves the broad geographic equilibrium largely intact. The same regions remain attractive, and the same concentration tendencies persist.',
    replies: [
      {
        id: 'reply-14a',
        author: 'Danny R.',
        body: 'This matters for the EIP-7782 debate. The argument for shorter slots is throughput and UX, but the paper shows the geography doesn\'t change — so you can\'t use "faster blocks = more decentralized" as a selling point.',
        createdAt: '2026-03-27T11:00:00Z',
        votes: 8,
      },
      {
        id: 'reply-14b',
        author: 'Nadia S.',
        body: 'The reward variance increase is the real policy-relevant finding here. Same map, but solo stakers in non-optimal regions earn even less relative to optimal-region validators. It\'s a hidden centralization tax on the long tail.',
        createdAt: '2026-03-27T13:20:00Z',
        votes: 13,
      },
    ],
  },
  'mock-note-15': {
    sectionTitle: 'SE4b: Shorter Slot Times',
    sectionNumber: 'App. E.4',
    quotedPassage:
      'When the slot is shorter, a fixed latency advantage consumes a bigger fraction of the available timing budget. That raises the penalty for being outside the favored corridors even if the final map does not change dramatically.',
    replies: [
      {
        id: 'reply-15a',
        author: 'Marcus V.',
        body: 'Think of it as signal-to-noise: a 10ms advantage in a 12s slot is 0.08% of the window. In a 6s slot it\'s 0.17%. Same absolute edge, double the relative impact. This is why timing compression is regressive.',
        createdAt: '2026-03-26T15:00:00Z',
        votes: 15,
      },
    ],
  },
  'mock-note-16': {
    sectionTitle: 'Baseline Results',
    sectionNumber: '§4.2',
    quotedPassage:
      'SSP still centralizes, but the locus is shaped by relay geography and the proposer-relay-attester chain. That makes the final map look different even when the underlying force is still latency-driven concentration.',
    replies: [
      {
        id: 'reply-16a',
        author: 'R. Chen',
        body: 'The "different maps, same force" point is elegant. Two paradigms can produce different geographies while both being driven by the identical economic pressure. This is why comparing Gini numbers across paradigms without looking at the spatial distribution is misleading.',
        createdAt: '2026-03-29T12:00:00Z',
        votes: 6,
      },
      {
        id: 'reply-16b',
        author: 'Jordan P.',
        body: 'It also means you can\'t evaluate "which paradigm is more decentralized" with a single scalar metric. Two paradigms with the same Gini can have very different geographic risk profiles. One might be concentrated in two continents, the other in three.',
        createdAt: '2026-03-29T13:45:00Z',
        votes: 9,
      },
    ],
  },
  'mock-note-17': {
    sectionTitle: 'SE1: Source Placement',
    sectionNumber: '§4.4',
    quotedPassage:
      'SSP behaves differently because badly placed relays create a stronger co-location premium. When the relay path is the bottleneck, shaving proposer-relay latency becomes disproportionately valuable, so misalignment can make concentration worse instead of better.',
    replies: [
      {
        id: 'reply-17a',
        author: 'Tomás G.',
        body: 'This has direct implications for Flashbots\' relay infrastructure decisions. If they add a relay in Asia-Pacific, the model predicts it would *reduce* SSP centralization by removing the co-location premium around EU/US relays.',
        createdAt: '2026-03-26T09:30:00Z',
        votes: 11,
      },
      {
        id: 'reply-17b',
        author: 'Alex W.',
        body: 'I ran this scenario in the sim lab with a hypothetical relay in asia-southeast1. SSP Gini drops ~0.08 compared to the US-only relay setup. Not huge but measurable.',
        createdAt: '2026-03-26T11:00:00Z',
        votes: 8,
      },
      {
        id: 'reply-17c',
        author: 'Kira T.',
        body: 'The policy takeaway is clear: relay operators have more geographic influence than most EIPs. A Flashbots decision about where to host a relay endpoint has first-order effects on validator geography that most governance discussions ignore.',
        createdAt: '2026-03-26T14:00:00Z',
        votes: 14,
      },
    ],
  },
  'mock-note-18': {
    sectionTitle: 'Discussion',
    sectionNumber: '§5',
    quotedPassage:
      'That restraint matters. The contribution is to show that geographic concentration is endogenous to the timing structure of the system, not to claim the model has already solved how to counteract it.',
    replies: [
      {
        id: 'reply-18a',
        author: 'Marcus V.',
        body: 'The word "endogenous" is doing important work here. It means the centralization comes from inside the system\'s own rules, not from external factors like regulation or economics of scale. You can\'t fix an endogenous problem with exogenous interventions alone.',
        createdAt: '2026-03-25T10:00:00Z',
        votes: 10,
      },
      {
        id: 'reply-18b',
        author: 'Livia M.',
        body: 'This is why the paper is more important than most "decentralization" studies that just measure geographic distribution at one point in time. It shows the *mechanism*, not just the *snapshot*.',
        createdAt: '2026-03-25T11:30:00Z',
        votes: 7,
      },
    ],
  },
  'mock-note-19': {
    sectionTitle: 'Limitations',
    sectionNumber: '§5',
    quotedPassage:
      'The model omits home-staker latency profiles, strategic coalition behavior among large staking providers, and non-linear MEV functions. Each simplification trades realism for tractability, but together they define the confidence boundary of the quantitative results.',
    replies: [
      {
        id: 'reply-19a',
        author: 'R. Chen',
        body: 'The no-coalition assumption is probably the second biggest gap after cloud-only latency. In reality, large staking providers run correlated infrastructure across multiple validators. Their "migration" decision is a portfolio optimization, not 1,000 independent choices.',
        createdAt: '2026-03-25T14:00:00Z',
        votes: 12,
      },
      {
        id: 'reply-19b',
        author: 'Tomás G.',
        body: 'Adding coalitions would likely *increase* centralization in the model since large operators can negotiate better colocation deals and amortize migration costs. The paper\'s results are probably a lower bound on real-world geographic concentration.',
        createdAt: '2026-03-25T16:00:00Z',
        votes: 9,
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

  /* ── Round 2: deeper notes, debates, and flawed arguments ──────────── */

  {
    id: 'mock-note-9',
    query: 'Simulation Design',
    summary: 'Selected text: "repeatedly compare expected rewards across measured cloud regions"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 10,
    createdAt: daysAgo(1),
    paradigmTags: [],
    experimentTags: [],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'simulation-design',
      excerpt: 'Validators are agents that repeatedly compare expected rewards across measured cloud regions, then migrate if the gain exceeds switching cost.',
    },
    publication: {
      published: true,
      title: 'Path dependence is the hidden variable in this ABM',
      takeaway: 'The sequential compare-and-migrate loop means the model captures path dependence that a static optimization would miss. The order in which validators move affects the equilibrium because each migration changes the reward landscape for everyone else. This is why the paper converges to different equilibria depending on starting conditions.',
      author: 'Tomás G.',
      publishedAt: daysAgo(1),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-10',
    query: 'Simulation Design',
    summary: 'Selected text: "MEV is modeled as deterministic and linear in latency"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 15,
    createdAt: daysAgo(3),
    paradigmTags: [],
    experimentTags: [],
    verified: true,
    surface: 'reading',
    anchor: {
      sectionId: 'simulation-design',
      excerpt: 'MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete.',
    },
    publication: {
      published: true,
      title: 'The deterministic MEV assumption is more robust than it looks',
      takeaway: 'Adding stochastic MEV with realistic distributions would likely preserve the directional finding (latency → geographic concentration) while adding noise. The key structural claim — that latency creates a geographic gradient in expected rewards — holds for any monotonically decreasing MEV function of latency. The paper is right to flag it as a limitation, but critics should be specific about what it changes.',
      author: 'Nadia S.',
      publishedAt: daysAgo(3),
      featured: false,
      editorNote: '',
    },
  },

  // ── FLAWED ARGUMENT 1: Sounds devastating but misunderstands the structural claim ──
  {
    id: 'mock-note-11',
    query: 'Simulation Design',
    summary: 'Selected text: "MEV is modeled as deterministic and linear"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: -3,
    createdAt: daysAgo(4),
    paradigmTags: [],
    experimentTags: [],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'simulation-design',
      excerpt: 'MEV is modeled as deterministic and linear in latency, migration cost is fixed, and information is complete.',
    },
    publication: {
      published: true,
      title: 'Linear MEV invalidates the quantitative results entirely',
      takeaway: 'The linear MEV assumption is not a minor simplification — it\'s the load-bearing wall of the model. Real MEV is highly non-linear with winner-take-all dynamics in PBS auctions. A concave MEV function would dramatically reduce the co-location premium, and a convex one would amplify it. Without knowing the true shape, the paper\'s Gini trajectories are quantitatively meaningless. The "direction is right" defense doesn\'t hold when the magnitude could be off by orders of magnitude.',
      author: 'Marcus V.',
      publishedAt: daysAgo(4),
      featured: false,
      editorNote: '',
    },
  },

  // ── FLAWED ARGUMENT 2: Confuses MEV supply chain with geographic latency ──
  {
    id: 'mock-note-12',
    query: 'Attestation Threshold',
    summary: 'Selected text: "higher threshold forces a harder compromise"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: -8,
    createdAt: daysAgo(3),
    paradigmTags: ['MSP'],
    experimentTags: ['SE4a'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'se4a-attestation',
      excerpt: 'In MSP, a higher threshold forces a harder compromise between being close to attesters and being close to information sources.',
    },
    publication: {
      published: true,
      title: 'Flashbots Protect already solves the MSP centralization problem',
      takeaway: 'The paper\'s MSP model assumes information sources are geographically fixed, but Flashbots Protect and private transaction pools have already democratized MEV access regardless of validator location. Since any validator can receive private order flow through encrypted mempools, the "proximity to information sources" leg of the model is obsolete. This makes the gamma paradox largely irrelevant for real-world MSP — the geographic pressure the paper identifies has already been solved by the MEV supply chain evolution.',
      author: 'R. Chen',
      publishedAt: daysAgo(3),
      featured: false,
      editorNote: '',
    },
  },

  {
    id: 'mock-note-13',
    query: 'Joint Heterogeneity',
    summary: 'Selected text: "temporary dip in concentration"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 13,
    createdAt: daysAgo(3),
    paradigmTags: ['SSP'],
    experimentTags: ['SE3'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'se3-joint',
      excerpt: 'the temporary dip in concentration appears when SSP starts from today\'s concentrated validator geography and relay placement is poorly connected to that start.',
    },
    publication: {
      published: true,
      title: 'The transient dip is a testable prediction, not just a curiosity',
      takeaway: 'SE3\'s temporary decentralization is the only scenario where Gini decreases, and it happens under specific conditions: concentrated start + misaligned relays. This gives us a testable prediction — if relay infrastructure shifts significantly (e.g., a major new relay in Asia), we should see a brief period of reduced geographic concentration in SSP before re-convergence. The paper doesn\'t emphasize this, but it\'s the closest thing to an actionable finding.',
      author: 'Tomás G.',
      publishedAt: daysAgo(3),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-14',
    query: 'Shorter Slots',
    summary: 'Selected text: "6-second slots leaves the broad geographic equilibrium largely intact"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 16,
    createdAt: daysAgo(2),
    paradigmTags: [],
    experimentTags: ['SE4b'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'se4b-slots',
      excerpt: 'moving to 6-second slots leaves the broad geographic equilibrium largely intact.',
    },
    publication: {
      published: true,
      title: 'EIP-7782 won\'t change the map but will tax the periphery',
      takeaway: 'The slot-time experiment is directly relevant to the EIP-7782 debate. Shorter slots don\'t redistribute validator geography — the same regions win. But the reward variance increase means solo stakers outside the favored corridors earn proportionally even less. This is a hidden centralization tax that the EIP-7782 discussion has largely ignored.',
      author: 'Nadia S.',
      publishedAt: daysAgo(2),
      featured: true,
      editorNote: 'Connects the paper directly to an active EIP discussion.',
    },
  },
  {
    id: 'mock-note-15',
    query: 'Shorter Slots',
    summary: 'Selected text: "fixed latency advantage consumes a bigger fraction"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 8,
    createdAt: daysAgo(5),
    paradigmTags: [],
    experimentTags: ['SE4b'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'se4b-slots',
      excerpt: 'a fixed latency advantage consumes a bigger fraction of the available timing budget.',
    },
    publication: {
      published: true,
      title: 'Timing compression is regressive by construction',
      takeaway: 'A 10ms advantage in a 12s slot is 0.08% of the window. In a 6s slot it\'s 0.17% — same absolute edge, double the relative impact. This is mathematically guaranteed for any fixed latency difference, which means every slot time reduction is regressive for geographically disadvantaged validators. The paper\'s finding here is actually a theorem, not just a simulation result.',
      author: 'Marcus V.',
      publishedAt: daysAgo(5),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-16',
    query: 'Baseline Results',
    summary: 'Selected text: "SSP still centralizes, but the locus is shaped by relay geography"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 10,
    createdAt: daysAgo(2),
    paradigmTags: ['SSP'],
    experimentTags: ['baseline'],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'baseline-results',
      excerpt: 'SSP still centralizes, but the locus is shaped by relay geography and the proposer-relay-attester chain.',
    },
    publication: {
      published: true,
      title: 'Same Gini, different maps: why scalar metrics mislead',
      takeaway: 'Two paradigms can have identical Gini coefficients while concentrating validators in completely different regions. SSP pulls toward relay colocations, MSP toward source-attester overlaps. This means "which paradigm is more decentralized?" can\'t be answered by comparing a single number — you need the full spatial distribution. Most decentralization dashboards miss this.',
      author: 'R. Chen',
      publishedAt: daysAgo(2),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-17',
    query: 'Source Placement',
    summary: 'Selected text: "badly placed relays create a stronger co-location premium"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 17,
    createdAt: daysAgo(5),
    paradigmTags: ['SSP'],
    experimentTags: ['SE1'],
    verified: true,
    surface: 'reading',
    anchor: {
      sectionId: 'se1-source-placement',
      excerpt: 'badly placed relays create a stronger co-location premium.',
    },
    publication: {
      published: true,
      title: 'Relay operators have more geographic influence than most EIPs',
      takeaway: 'SE1 implies that a Flashbots decision about where to host relay endpoints has first-order effects on validator geography that most governance discussions ignore. Adding a relay in Asia-Pacific would reduce the SSP co-location premium around EU/US relays. Ran it in the sim lab with a hypothetical relay in asia-southeast1: SSP Gini drops ~0.08. Not huge but measurable and achievable without protocol changes.',
      author: 'Kira T.',
      publishedAt: daysAgo(5),
      featured: true,
      editorNote: 'Actionable policy implication backed by simulation.',
    },
  },
  {
    id: 'mock-note-18',
    query: 'Discussion',
    summary: 'Selected text: "geographic concentration is endogenous to the timing structure"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 13,
    createdAt: daysAgo(6),
    paradigmTags: [],
    experimentTags: [],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'discussion',
      excerpt: 'geographic concentration is endogenous to the timing structure of the system.',
    },
    publication: {
      published: true,
      title: '"Endogenous" means you can\'t fix this from outside the protocol',
      takeaway: 'The word "endogenous" is load-bearing. It means centralization emerges from the system\'s own rules, not from external factors like regulation or cloud provider pricing. You can\'t solve an endogenous problem with exogenous interventions alone — you need to change the timing structure itself. This is why the paper is more important than studies that just measure geographic distribution at one point in time.',
      author: 'Marcus V.',
      publishedAt: daysAgo(6),
      featured: false,
      editorNote: '',
    },
  },
  {
    id: 'mock-note-19',
    query: 'Limitations',
    summary: 'Selected text: "no strategic coalition behavior"',
    blocks: [],
    followUps: [],
    model: '',
    cached: false,
    source: 'generated',
    votes: 11,
    createdAt: daysAgo(4),
    paradigmTags: [],
    experimentTags: [],
    verified: false,
    surface: 'reading',
    anchor: {
      sectionId: 'limitations',
      excerpt: 'no strategic coalition behavior.',
    },
    publication: {
      published: true,
      title: 'Coalitions would make the centralization *worse*, not better',
      takeaway: 'The paper models validators as independent agents, but large staking providers (Lido, Coinbase, etc.) run correlated infrastructure across hundreds of validators. Their "migration" is a portfolio optimization, not 1,000 independent decisions. Since large operators can negotiate better colocation deals and amortize migration costs, adding coalitions would likely increase centralization. The paper\'s results are probably a lower bound on real-world geographic concentration.',
      author: 'Tomás G.',
      publishedAt: daysAgo(4),
      featured: false,
      editorNote: '',
    },
  },
]
