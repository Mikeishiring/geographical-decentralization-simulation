export interface SqlExample {
  readonly label: string
  readonly query: string
  readonly category: 'validators' | 'latency' | 'advanced'
}

export const SQL_EXAMPLES: readonly SqlExample[] = [
  // Validator queries
  {
    label: 'Validators by country',
    category: 'validators',
    query: `SELECT country, COUNT(*) as peers, SUM(validator_count) as validators
FROM validators
GROUP BY country
ORDER BY validators DESC
LIMIT 15`,
  },
  {
    label: 'Client distribution',
    category: 'validators',
    query: `SELECT SPLIT_PART(client_version, '/', 1) as client,
       COUNT(*) as peers,
       SUM(validator_count) as validators,
       ROUND(SUM(validator_count) * 100.0 / (SELECT SUM(validator_count) FROM validators), 1) as pct
FROM validators
GROUP BY client
ORDER BY validators DESC`,
  },
  {
    label: 'Hosting concentration',
    category: 'validators',
    query: `SELECT asn_type,
       COUNT(*) as peers,
       SUM(validator_count) as validators,
       ROUND(SUM(validator_count) * 100.0 / (SELECT SUM(validator_count) FROM validators), 1) as pct
FROM validators
GROUP BY asn_type
ORDER BY validators DESC`,
  },
  {
    label: 'Top ASN providers',
    category: 'validators',
    query: `SELECT asn_organization, asn_type,
       COUNT(*) as peers,
       SUM(validator_count) as validators
FROM validators
GROUP BY asn_organization, asn_type
ORDER BY validators DESC
LIMIT 15`,
  },
  {
    label: 'City density',
    category: 'validators',
    query: `SELECT city, country,
       COUNT(*) as peers,
       SUM(validator_count) as validators,
       ROUND(AVG(latitude), 2) as lat,
       ROUND(AVG(longitude), 2) as lon
FROM validators
WHERE city IS NOT NULL
GROUP BY city, country
ORDER BY validators DESC
LIMIT 20`,
  },
  // Latency queries
  {
    label: 'Highest latency pairs',
    category: 'latency',
    query: `SELECT sending_region, receiving_region,
       ROUND(milliseconds, 1) as ms
FROM gcp_latency
WHERE milliseconds > 200
ORDER BY milliseconds DESC
LIMIT 20`,
  },
  {
    label: 'Europe to world',
    category: 'latency',
    query: `SELECT r2.region_name as destination,
       ROUND(AVG(l.milliseconds), 1) as avg_ms,
       ROUND(MIN(l.milliseconds), 1) as min_ms,
       ROUND(MAX(l.milliseconds), 1) as max_ms
FROM gcp_latency l
JOIN gcp_regions r1 ON l.sending_region = r1.region
JOIN gcp_regions r2 ON l.receiving_region = r2.region
WHERE r1.region LIKE 'europe-%'
GROUP BY r2.region_name
ORDER BY avg_ms`,
  },
  // Advanced queries (showcasing DuckDB features)
  {
    label: 'Concentration (HHI)',
    category: 'advanced',
    query: `-- Herfindahl-Hirschman Index by country
WITH country_share AS (
  SELECT country,
         SUM(validator_count) as validators,
         SUM(validator_count) * 1.0 / (SELECT SUM(validator_count) FROM validators) as share
  FROM validators
  GROUP BY country
)
SELECT ROUND(SUM(share * share) * 10000, 1) as hhi_index,
       COUNT(*) as countries,
       MAX(country) FILTER (WHERE validators = (SELECT MAX(validators) FROM country_share)) as top_country,
       ROUND(MAX(share) * 100, 1) as top_share_pct
FROM country_share`,
  },
  {
    label: 'Validator percentiles',
    category: 'advanced',
    query: `SELECT
  QUANTILE_CONT(validator_count, 0.5) as median,
  QUANTILE_CONT(validator_count, 0.75) as p75,
  QUANTILE_CONT(validator_count, 0.90) as p90,
  QUANTILE_CONT(validator_count, 0.99) as p99,
  ROUND(AVG(validator_count), 1) as mean,
  MAX(validator_count) as max
FROM validators
WHERE validator_count > 0`,
  },
  {
    label: 'Latency asymmetry',
    category: 'advanced',
    query: `-- Find region pairs where A→B latency differs most from B→A
SELECT a.sending_region as region_a, a.receiving_region as region_b,
       ROUND(a.milliseconds, 1) as a_to_b_ms,
       ROUND(b.milliseconds, 1) as b_to_a_ms,
       ROUND(ABS(a.milliseconds - b.milliseconds), 1) as asymmetry_ms
FROM gcp_latency a
JOIN gcp_latency b
  ON a.sending_region = b.receiving_region
  AND a.receiving_region = b.sending_region
WHERE a.sending_region < a.receiving_region
ORDER BY asymmetry_ms DESC
LIMIT 10`,
  },
  {
    label: 'Schema info',
    category: 'advanced',
    query: `SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'main'
ORDER BY table_name, ordinal_position`,
  },
]
