/**
 * Chart Patterns Configuration
 *
 * Defines metric patterns for chart detection and rendering.
 * These patterns determine which fields are considered chartable
 * and how to match user queries to specific metrics.
 */

export interface MetricPattern {
  /** Metric identifier */
  name: string
  /** Patterns to match in user queries */
  queryPatterns: RegExp[]
  /** Patterns to match in data field names */
  fieldPatterns: RegExp[]
  /** Priority for selection (lower = higher priority) */
  priority: number
}

/**
 * Chart Detection Constants
 */
export const CHART_CONSTANTS = {
  /** Minimum data points required for chart visualization */
  MIN_DATA_POINTS: 2,
  /** Minimum keys required (X-axis + at least one Y-axis) */
  MIN_KEYS: 2,
  /** Maximum metrics to display in a chart */
  MAX_METRICS: 5,
  /** Default chart color */
  DEFAULT_COLOR: '#00D9FF'
} as const

/**
 * Metric patterns for chart detection
 * Priority determines selection order when multiple metrics match
 */
export const METRIC_PATTERNS: MetricPattern[] = [
  {
    name: 'steps',
    queryPatterns: [/steps/i, /walked/i, /walking/i],
    fieldPatterns: [/steps/i],
    priority: 1
  },
  {
    name: 'heart_rate',
    queryPatterns: [/heart.*rate/i, /hr\b/i, /pulse/i, /bpm/i],
    fieldPatterns: [/heart.*rate/i, /\bhr\b/i, /bpm/i],
    priority: 2
  },
  {
    name: 'calories',
    queryPatterns: [/calories/i, /kcal/i, /burned/i, /energy/i],
    fieldPatterns: [/calories/i, /kcal/i],
    priority: 3
  },
  {
    name: 'distance',
    queryPatterns: [/distance/i, /km/i, /miles/i, /meters/i],
    fieldPatterns: [/distance/i, /\bkm\b/i, /miles/i],
    priority: 4
  },
  {
    name: 'duration',
    queryPatterns: [/duration/i, /time/i, /minutes/i, /hours/i],
    fieldPatterns: [/duration/i, /time(?!stamp)/i, /minutes/i],
    priority: 5
  },
  {
    name: 'floors',
    queryPatterns: [/floors/i, /climbed/i, /stairs/i],
    fieldPatterns: [/floors/i],
    priority: 6
  },
  {
    name: 'active_minutes',
    queryPatterns: [/active.*minutes/i, /activity.*time/i],
    fieldPatterns: [/active.*minutes/i, /moderately.*active/i, /vigorously.*active/i],
    priority: 7
  },
  {
    name: 'sleep',
    queryPatterns: [/sleep/i, /rest/i, /slept/i],
    fieldPatterns: [/sleep/i, /rest/i],
    priority: 8
  },
  {
    name: 'stress',
    queryPatterns: [/stress/i, /anxiety/i],
    fieldPatterns: [/stress/i],
    priority: 9
  },
  {
    name: 'oxygen',
    queryPatterns: [/oxygen/i, /spo2/i, /o2/i],
    fieldPatterns: [/oxygen/i, /spo2/i, /\bo2\b/i],
    priority: 10
  }
]

/**
 * Field patterns to exclude from charts
 * These fields are not useful for visualization
 */
export const EXCLUDED_FIELD_PATTERNS: RegExp[] = [
  /Id$/i,                           // userProfileId, deviceId, etc.
  /^id$/i,                          // plain 'id' field
  /profile/i,                       // profileId, userProfile
  /duration.*milliseconds/i,        // Overly precise duration
  /version/i,                       // Version numbers
  /goal/i,                          // Goal values (not actual data)
  /constant/i,                      // Constant values
  /timestamp/i,                     // Timestamps (used for X-axis, not Y-axis)
  /date/i,                          // Dates (used for X-axis, not Y-axis)
  /uuid/i,                          // UUIDs
  /token/i,                         // Authentication tokens
  /key/i                            // API keys or similar
]

/**
 * Date field patterns
 * Used to identify X-axis candidates
 */
export const DATE_FIELD_PATTERNS: RegExp[] = [
  /date/i,
  /time/i,
  /timestamp/i,
  /day/i,
  /month/i,
  /year/i
]

/**
 * Check if a field name matches any of the exclusion patterns
 */
export function isExcludedField(fieldName: string): boolean {
  return EXCLUDED_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))
}

/**
 * Check if a field name matches any date patterns
 */
export function isDateField(fieldName: string): boolean {
  return DATE_FIELD_PATTERNS.some(pattern => pattern.test(fieldName))
}

/**
 * Find metrics matching a user query
 * Returns metrics sorted by priority
 */
export function findMatchingMetrics(query: string): MetricPattern[] {
  const matches = METRIC_PATTERNS.filter(metric =>
    metric.queryPatterns.some(pattern => pattern.test(query))
  )

  return matches.sort((a, b) => a.priority - b.priority)
}

/**
 * Find fields matching a metric pattern
 */
export function findMatchingFields(fields: string[], metric: MetricPattern): string[] {
  return fields.filter(field =>
    metric.fieldPatterns.some(pattern => pattern.test(field))
  )
}

/**
 * Priority list for health metrics
 * Used when no specific metric is requested in the query
 */
export const HEALTH_METRIC_PRIORITY = [
  'steps',
  'totalSteps',
  'calories',
  'totalCalories',
  'activeCalories',
  'distance',
  'totalDistance',
  'heart',
  'heartRate',
  'averageHeartRate',
  'floors',
  'floorsClimbed',
  'active',
  'moderatelyActiveMinutes',
  'vigorouslyActiveMinutes',
  'sleep',
  'stress',
  'oxygen',
  'spo2'
]
