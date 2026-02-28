/**
 * Parse Prometheus exposition text format into typed samples.
 * Lines are of the form: name{label="value",...} value
 * or: name value
 */

export interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

/**
 * Builds a stable key for a time series (metric name + sorted labels).
 */
export function seriesKey(sample: MetricSample): string {
  const labelPart = Object.keys(sample.labels)
    .sort()
    .map((k) => `${k}="${sample.labels[k]}"`)
    .join(",");
  return labelPart ? `${sample.name}{${labelPart}}` : sample.name;
}

/**
 * Human-readable label for a series (e.g. for chart legend).
 */
export function seriesLabel(sample: MetricSample): string {
  const parts = Object.entries(sample.labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(", ") : sample.name;
}

/**
 * Parse Prometheus text format (as returned by render_metrics).
 * Returns only counter/gauge samples (skips HELP/TYPE and invalid lines).
 */
export function parsePrometheusText(lines: string[]): MetricSample[] {
  const result: MetricSample[] = [];
  // Match: name{label="val",...} value  or  name value
  const metricRe = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([\d.eE+-]+)\s*$/;
  const labelRe = /([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(metricRe);
    if (!match) continue;
    const [, name, labelsStr, valueStr] = match;
    const value = parseFloat(valueStr);
    if (Number.isNaN(value)) continue;
    const labels: Record<string, string> = {};
    if (labelsStr) {
      let labelMatch: RegExpExecArray | null;
      while ((labelMatch = labelRe.exec(labelsStr)) !== null) {
        labels[labelMatch[1]] = labelMatch[2];
      }
    }
    result.push({ name: name ?? "", labels, value });
  }
  return result;
}

/**
 * Collect unique metric names from samples.
 */
export function metricNamesFromSamples(samples: MetricSample[]): string[] {
  const set = new Set(samples.map((s) => s.name));
  return Array.from(set).sort();
}

/**
 * For a given metric name, collect unique values per label key (for filter dropdowns).
 */
export function labelValuesFromSamples(
  samples: MetricSample[],
  metricName: string
): Record<string, string[]> {
  const byKey: Record<string, Set<string>> = {};
  for (const s of samples) {
    if (s.name !== metricName) continue;
    for (const [k, v] of Object.entries(s.labels)) {
      if (!byKey[k]) byKey[k] = new Set();
      byKey[k].add(v);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [k, set] of Object.entries(byKey)) {
    out[k] = Array.from(set).sort();
  }
  return out;
}

/**
 * Collect unique values for given label keys across all samples (for global filters).
 */
export function allLabelValues(
  samples: MetricSample[],
  keys: string[]
): Record<string, string[]> {
  const byKey: Record<string, Set<string>> = {};
  for (const k of keys) byKey[k] = new Set();
  for (const s of samples) {
    for (const k of keys) {
      const v = s.labels[k];
      if (v != null && v !== "") byKey[k].add(v);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [k, set] of Object.entries(byKey)) {
    out[k] = Array.from(set).sort();
  }
  return out;
}
