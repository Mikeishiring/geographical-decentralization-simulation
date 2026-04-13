export interface SqlExample {
  readonly label: string
  readonly description: string
  readonly query: string
  readonly category: 'results' | 'traces' | 'infrastructure'
  readonly requiresExact?: boolean
}

export const SQL_EXAMPLES: readonly SqlExample[] = [
  {
    label: 'Final Gini leaderboard',
    description: 'Rank frozen runs by final concentration, market share, and profit variance.',
    category: 'results',
    query: `SELECT
  r.evaluation,
  r.paradigm_label,
  r.result_key,
  ROUND(s.gini, 4) AS final_gini,
  ROUND(s.hhi, 4) AS final_hhi,
  ROUND(s.profit_variance, 4) AS final_profit_variance
FROM run_metric_snapshots s
JOIN runs r USING (run_id)
WHERE s.snapshot = 'final'
  AND r.run_kind = 'published'
ORDER BY s.gini DESC
  LIMIT 15`,
  },
  {
    label: 'Fastest published runs',
    description: 'Find the lowest-latency published scenarios and inspect their source-distance tradeoff.',
    category: 'results',
    query: `SELECT
  r.evaluation,
  r.paradigm_label,
  r.result_key,
  ROUND(s.proposal_times, 1) AS proposal_ms,
  ROUND(s.info_avg_distance, 4) AS source_distance
FROM run_metric_snapshots s
JOIN runs r USING (run_id)
WHERE s.snapshot = 'final'
  AND r.run_kind = 'published'
ORDER BY s.proposal_times ASC
  LIMIT 12`,
  },
  {
    label: 'Gamma sweep deltas',
    description: 'Compare a full parameter sweep on the final snapshot across Gini, attestations, and proposal time.',
    category: 'results',
    query: `SELECT
  r.paradigm_label,
  r.result_key,
  ROUND(s.gini, 4) AS final_gini,
  ROUND(s.attestations, 0) AS final_attestations,
  ROUND(s.proposal_times, 1) AS final_proposal_ms
FROM run_metric_snapshots s
JOIN runs r USING (run_id)
WHERE s.snapshot = 'final'
  AND r.evaluation = 'SE4-Attestation-Threshold'
  ORDER BY r.paradigm_label, r.gamma`,
  },
  {
    label: 'Final topology outliers',
    description: 'Surface published runs with the strongest spatial concentration in nearest-neighbor structure.',
    category: 'results',
    query: `SELECT
  r.evaluation,
  r.paradigm_label,
  r.result_key,
  ROUND(s.total_distance, 2) AS total_distance,
  ROUND(s.avg_nnd, 4) AS avg_nnd,
  ROUND(s.nni, 4) AS nni
FROM run_metric_snapshots s
JOIN runs r USING (run_id)
WHERE s.snapshot = 'final'
  AND r.run_kind = 'published'
ORDER BY s.nni ASC, s.total_distance DESC
LIMIT 15`,
  },
  {
    label: 'Loaded run metric digest',
    description: 'Summarize every currently attached run from the slot-level metric table.',
    category: 'traces',
    query: `SELECT
  r.label,
  COUNT(*) AS slots_loaded,
  ROUND(AVG(m.gini), 4) AS avg_gini,
  ROUND(MAX(m.total_distance), 3) AS max_total_distance,
  ROUND(AVG(m.info_avg_distance), 4) AS avg_source_distance
FROM run_slot_metrics m
JOIN runs r USING (run_id)
GROUP BY r.label
  ORDER BY avg_gini DESC`,
  },
  {
    label: 'Final top regions',
    description: 'Inspect the dominant regions at the final slot for every attached run.',
    category: 'traces',
    query: `WITH final_slots AS (
  SELECT run_id, MAX(slot_index) AS final_slot
  FROM run_region_counts
  GROUP BY run_id
)
SELECT
  r.label,
  c.region_id,
  c.validator_count,
  ROUND(c.validator_share, 2) AS validator_share_pct
FROM run_region_counts c
JOIN final_slots f
  ON c.run_id = f.run_id
 AND c.slot_index = f.final_slot
JOIN runs r USING (run_id)
ORDER BY r.label, c.validator_count DESC
  LIMIT 20`,
  },
  {
    label: 'Exact migration audit',
    description: 'Break down exact-run migration events by slot, cause, and region transition.',
    category: 'traces',
    requiresExact: true,
    query: `SELECT
  slot_number,
  action_reason,
  previous_region,
  new_region,
  COUNT(*) AS events
FROM run_migration_events
GROUP BY slot_number, action_reason, previous_region, new_region
  ORDER BY slot_number DESC, events DESC
LIMIT 20`,
  },
  {
    label: 'Exact proposal tails',
    description: 'Profile the slow tail of proposal times inside the active exact overlay.',
    category: 'traces',
    requiresExact: true,
    query: `SELECT
  slot_number,
  ROUND(AVG(proposal_time_ms), 1) AS avg_proposal_ms,
  ROUND(MAX(proposal_time_ms), 1) AS max_proposal_ms,
  COUNT(*) AS validators_sampled
FROM run_proposal_times
GROUP BY slot_number
ORDER BY max_proposal_ms DESC
LIMIT 20`,
  },
  {
    label: 'Source distance by source',
    description: 'Track which suppliers or signals sit furthest from the validator footprint.',
    category: 'traces',
    query: `SELECT
  r.label,
  d.source_name,
  ROUND(AVG(d.avg_distance), 4) AS avg_distance,
  ROUND(MIN(d.avg_distance), 4) AS min_distance,
  ROUND(MAX(d.avg_distance), 4) AS max_distance
FROM run_source_distances d
JOIN runs r USING (run_id)
GROUP BY r.label, d.source_name
  ORDER BY avg_distance DESC
LIMIT 20`,
  },
  {
    label: 'Validators by country',
    description: 'Use the raw validator registry to inspect geographic concentration by country.',
    category: 'infrastructure',
    query: `SELECT
  country,
  COUNT(*) AS peers,
  SUM(validator_count) AS validators
FROM validators
GROUP BY country
ORDER BY validators DESC
  LIMIT 15`,
  },
  {
    label: 'Latency asymmetry',
    description: 'Compare directional latency imbalances in the GCP region matrix.',
    category: 'infrastructure',
    query: `SELECT
  a.sending_region AS region_a,
  a.receiving_region AS region_b,
  ROUND(a.milliseconds, 1) AS a_to_b_ms,
  ROUND(b.milliseconds, 1) AS b_to_a_ms,
  ROUND(ABS(a.milliseconds - b.milliseconds), 1) AS asymmetry_ms
FROM gcp_latency a
JOIN gcp_latency b
  ON a.sending_region = b.receiving_region
 AND a.receiving_region = b.sending_region
WHERE a.sending_region < a.receiving_region
ORDER BY asymmetry_ms DESC
  LIMIT 12`,
  },
  {
    label: 'Warehouse schema',
    description: 'List every exposed table and column in the shared warehouse schema.',
    category: 'infrastructure',
    query: `SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'main'
ORDER BY table_name, ordinal_position`,
  },
]
