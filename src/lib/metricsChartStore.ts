import { batch, createSignal } from "solid-js";
import { renderMetrics } from "./tauri";
import {
  parsePrometheusText,
  seriesKey,
  seriesLabel,
  type MetricSample,
} from "./metricsParser";

export const SCRAPE_INTERVAL_OPTIONS = [
  { value: 5000, label: "5 s" },
  { value: 10000, label: "10 s" },
  { value: 30000, label: "30 s" },
] as const;

export const CHART_WIDTH_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 30, label: "30 min" },
] as const;

export interface SeriesPoint {
  t: number;
  v: number;
}

export interface TimeSeries {
  key: string;
  name: string;
  labels: Record<string, string>;
  label: string;
  data: SeriesPoint[];
}

const [pollIntervalMs, setPollIntervalMs] = createSignal(10000);
const [chartWidthMinutes, setChartWidthMinutes] = createSignal(10);
const [seriesMap, setSeriesMap] = createSignal<Map<string, TimeSeries>>(new Map());
const [lastSamples, setLastSamples] = createSignal<MetricSample[]>([]);
const [lastError, setLastError] = createSignal<string | null>(null);
const [dashboardFilterId, setDashboardFilterIdFn] = createSignal("");
const [dashboardFilterName, setDashboardFilterNameFn] = createSignal("");
const [dashboardFilterNodeType, setDashboardFilterNodeTypeFn] = createSignal("");
const [dashboardFilterGroup, setDashboardFilterGroupFn] = createSignal("");
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastScrapeHash: string = "";

function maxPoints(): number {
  const intervalSec = pollIntervalMs() / 1000;
  return Math.max(1, Math.floor((chartWidthMinutes() * 60) / intervalSec));
}

function trimSeries(data: SeriesPoint[], max: number): SeriesPoint[] {
  if (data.length <= max) return data;
  return data.slice(data.length - max);
}

export function getPollIntervalMs(): number {
  return pollIntervalMs();
}

export function setScrapeInterval(ms: number): void {
  setPollIntervalMs(ms);
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = setInterval(tick, ms);
  }
}

export function getChartWidthMinutes(): number {
  return chartWidthMinutes();
}

export function getMaxPoints(): number {
  return maxPoints();
}

export function setChartWidth(minutes: number): void {
  setChartWidthMinutes(minutes);
  const max = maxPoints();
  setSeriesMap((prev) => {
    const next = new Map(prev);
    for (const [key, s] of next) {
      next.set(key, { ...s, data: trimSeries(s.data, max) });
    }
    return next;
  });
}

export function getSeriesMap(): Map<string, TimeSeries> {
  return seriesMap();
}

export function getLastSamples(): MetricSample[] {
  return lastSamples();
}

export function getLastError(): string | null {
  return lastError();
}

export function getDashboardFilterId(): string {
  return dashboardFilterId();
}
export function setDashboardFilterId(value: string): void {
  setDashboardFilterIdFn(value);
}
export function getDashboardFilterName(): string {
  return dashboardFilterName();
}
export function setDashboardFilterName(value: string): void {
  setDashboardFilterNameFn(value);
}
export function getDashboardFilterNodeType(): string {
  return dashboardFilterNodeType();
}
export function setDashboardFilterNodeType(value: string): void {
  setDashboardFilterNodeTypeFn(value);
}
export function getDashboardFilterGroup(): string {
  return dashboardFilterGroup();
}
export function setDashboardFilterGroup(value: string): void {
  setDashboardFilterGroupFn(value);
}

/** True if the two maps have the same keys and same last point per series (no need to notify). */
function seriesMapUnchanged(
  prev: Map<string, TimeSeries>,
  next: Map<string, TimeSeries>
): boolean {
  if (prev.size !== next.size) return false;
  for (const [key, s] of next) {
    const p = prev.get(key);
    if (!p || p.data.length !== s.data.length) return false;
    const pd = p.data;
    const sd = s.data;
    if (pd.length === 0 && sd.length === 0) continue;
    const lastP = pd[pd.length - 1]!;
    const lastS = sd[sd.length - 1]!;
    if (lastP.t !== lastS.t || lastP.v !== lastS.v) return false;
  }
  return true;
}

/** Cheap fingerprint of scrape response to skip parse/state when unchanged. */
function scrapeHash(lines: string[]): string {
  const n = lines.length;
  const first = lines[0] ?? "";
  const last = lines[n - 1] ?? "";
  return `${n}:${first.slice(0, 80)}:${last.slice(-120)}`;
}

function tick(): void {
  renderMetrics()
    .then((lines) => {
      setLastError(null);
      const hash = scrapeHash(lines);
      if (hash === lastScrapeHash) return;
      lastScrapeHash = hash;
      const samples = parsePrometheusText(lines);
      const now = Date.now();
      const max = maxPoints();
      const prev = seriesMap();
      const next = new Map<string, TimeSeries>();
      for (const s of samples) {
        const key = seriesKey(s);
        const existing = prev.get(key);
        const point: SeriesPoint = { t: now, v: s.value };
        let data: SeriesPoint[];
        if (existing) {
          const appended = existing.data;
          appended.length < max
            ? (data = [...existing.data, point])
            : (data = trimSeries([...existing.data, point], max));
        } else {
          data = [point];
        }
        next.set(key, {
          key,
          name: s.name,
          labels: { ...s.labels },
          label: seriesLabel(s),
          data,
        });
      }
      batch(() => {
        setLastSamples(samples);
        setSeriesMap((current) => {
          if (seriesMapUnchanged(current, next)) return current;
          return next;
        });
      });
    })
    .catch((err: unknown) => {
      setLastError(err instanceof Error ? err.message : String(err));
    });
}

function startTimer(): void {
  if (pollTimer != null) return;
  tick();
  pollTimer = setInterval(tick, pollIntervalMs());
}

function stopTimer(): void {
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function startMetricsPolling(): void {
  startTimer();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
}

export function stopMetricsPolling(): void {
  stopTimer();
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    startTimer();
  } else {
    stopTimer();
  }
}

export function seriesList(): TimeSeries[] {
  return Array.from(seriesMap().values());
}
