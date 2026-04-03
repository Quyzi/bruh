import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  For,
  Show,
} from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { loadChannels } from "../lib/tauri";
import { addChatEntry, setChannelsList } from "../lib/dashboardChatStore";
import {
  startMetricsPolling,
  stopMetricsPolling,
  getSeriesMap,
  getLastSamples,
  getLastError,
  getPollIntervalMs,
  getChartWidthMinutes,
  getMaxPoints,
  setScrapeInterval,
  setChartWidth,
  getDashboardFilterId,
  setDashboardFilterId,
  getDashboardFilterName,
  setDashboardFilterName,
  getDashboardFilterNodeType,
  setDashboardFilterNodeType,
  getDashboardFilterGroup,
  setDashboardFilterGroup,
  SCRAPE_INTERVAL_OPTIONS,
  CHART_WIDTH_OPTIONS,
  type TimeSeries,
} from "../lib/metricsChartStore";
import {
  metricNamesFromSamples,
  allLabelValues,
} from "../lib/metricsParser";
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  type ChartConfiguration,
  type TooltipItem,
} from "chart.js";

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend
);

/** All metrics we expose; charts shown for each even with no data. */
const ALL_METRIC_NAMES = [
  "bruh_eventsub_events_total",
  "bruh_eventsub_events_dropped_total",
  "bruh_eventsub_reconnects_total",
  "bruh_chat_messages_received_total",
  "bruh_chat_messages_sent_total",
  "bruh_node_executions_total",
  "bruh_node_outcomes_total",
  "bruh_node_execution_duration_ms_sum",
  "bruh_pipeline_events_dropped_total",
  "bruh_pipeline_runs_failed_total",
  "bruh_auth_token_refresh_failures_total",
  "bruh_timer_ticks_sent_total",
] as const;

/** Dashboard chart order and layout: row 1–2 are 2-col, row 3 is 3-col. */
const DASHBOARD_METRIC_ORDER: string[] = [
  "bruh_chat_messages_received_total",
  "bruh_chat_messages_sent_total",
  "bruh_eventsub_events_total",
  "bruh_node_executions_total",
  "bruh_node_outcomes_total",
  "bruh_node_execution_duration_ms_sum",
  "bruh_pipeline_events_dropped_total",
  "bruh_pipeline_runs_failed_total",
  "bruh_timer_ticks_sent_total",
];

const CHART_COLORS = [
  "rgb(100, 108, 255)",
  "rgb(76, 175, 80)",
  "rgb(255, 152, 0)",
  "rgb(233, 30, 99)",
  "rgb(0, 188, 212)",
  "rgb(255, 235, 59)",
  "rgb(156, 39, 176)",
];

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function metricDisplayName(name: string): string {
  return name.replace(/^bruh_/, "").replace(/_/g, " ");
}

/** Cache for stable refs in filteredByMetric memo. */
const seriesListRefCache = new Map<string, TimeSeries[]>();

function seriesListEqual(a: TimeSeries[], b: TimeSeries[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const sa = a[i]!;
    const sb = b[i]!;
    if (sa.key !== sb.key) return false;
    if (sa.data.length !== sb.data.length) return false;
    const la = sa.data[sa.data.length - 1];
    const lb = sb.data[sb.data.length - 1];
    if (la?.t !== lb?.t || la?.v !== lb?.v) return false;
  }
  return true;
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  options: string[] | { value: string; label: string }[];
  onChange: (value: string) => void;
}

function FilterSelect(props: FilterSelectProps) {
  const opts = () =>
    typeof props.options[0] === "string"
      ? (props.options as string[]).map((v) => ({ value: v, label: v }))
      : (props.options as { value: string; label: string }[]);
  let selectRef: HTMLSelectElement | undefined;
  createEffect(() => {
    const el = selectRef;
    if (!el) return;
    const wanted = props.value;
    opts();
    if (el.value !== wanted) {
      el.value = wanted;
    }
  });
  return (
    <div class="flex items-center gap-1.5">
      <label for={props.id} class="text-text-secondary text-xs whitespace-nowrap">
        {props.label}
      </label>
      <select
        ref={(el) => (selectRef = el)}
        id={props.id}
        class="bg-bg-tertiary border border-border rounded px-1.5 py-0.5 text-text-primary text-xs text-[length:inherit] min-w-0 max-w-[120px]"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <option value="">All</option>
        <For each={opts()}>
          {(o) => (
            <option value={o.value}>{o.label}</option>
          )}
        </For>
      </select>
    </div>
  );
}

/** Short label for legend: prefer name (with group if present), then channel, type, etc. */
function seriesShortLabel(s: TimeSeries): string {
  const l = s.labels;
  const base =
    l.name ??
    l.channel ??
    l.type ??
    l.source_name ??
    l.source_id ??
    (Object.keys(l).length > 0 ? Object.values(l).join(", ") : s.key);
  const group = l.group?.trim();
  return group ? `${base} [${group}]` : base;
}

interface MetricChartProps {
  metricName: string;
  getSeries: () => TimeSeries[];
}

const IN_VIEW_DELAY_MS = 200;
const OUT_OF_VIEW_DELAY_MS = 400;

/** Only mounts the chart when the panel has been in view for a short delay; unmounts after delay when out of view. */
function LazyMetricPanel(props: {
  metricName: string;
  getSeries: () => TimeSeries[];
}) {
  const [isInView, setIsInView] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;
  let inViewTimer: ReturnType<typeof setTimeout> | null = null;
  let outViewTimer: ReturnType<typeof setTimeout> | null = null;

  onMount(() => {
    const el = containerRef;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry?.isIntersecting ?? false;
        if (visible) {
          if (outViewTimer != null) {
            clearTimeout(outViewTimer);
            outViewTimer = null;
          }
          if (inViewTimer == null) {
            inViewTimer = setTimeout(() => {
              inViewTimer = null;
              setIsInView(true);
            }, IN_VIEW_DELAY_MS);
          }
        } else {
          if (inViewTimer != null) {
            clearTimeout(inViewTimer);
            inViewTimer = null;
          }
          outViewTimer = setTimeout(() => {
            outViewTimer = null;
            setIsInView(false);
          }, OUT_OF_VIEW_DELAY_MS);
        }
      },
      { root: null, rootMargin: "80px", threshold: 0 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (inViewTimer != null) clearTimeout(inViewTimer);
      if (outViewTimer != null) clearTimeout(outViewTimer);
    };
  });

  return (
    <div
      ref={(el) => (containerRef = el)}
      class="dashboard-metric-panel h-full min-h-0 rounded-lg border border-border bg-bg-secondary p-3 shadow-sm flex flex-col"
    >
      <Show
        when={isInView()}
        fallback={
          <div class="flex-1 min-h-0 flex items-center justify-center text-text-tertiary text-sm">
            {metricDisplayName(props.metricName)}
          </div>
        }
      >
        <MetricChart
          metricName={props.metricName}
          getSeries={props.getSeries}
        />
      </Show>
      <Show when={isInView() && props.getSeries().length === 0}>
        <p class="text-text-tertiary text-xs mt-1 text-center shrink-0">No data yet</p>
      </Show>
    </div>
  );
}

/** Fill slot values in O(slots + dataLen) using one pass over sorted series data. */
function fillSlotsForSeries(
  data: { t: number; v: number }[],
  windowStart: number,
  intervalMs: number,
  maxPts: number
): (number | null)[] {
  const out: (number | null)[] = new Array(maxPts);
  let idx = 0;
  for (let slotIndex = 0; slotIndex < maxPts; slotIndex++) {
    const slotTime = windowStart + slotIndex * intervalMs;
    while (idx < data.length && data[idx].t <= slotTime) idx++;
    out[slotIndex] = idx > 0 ? data[idx - 1].v : null;
  }
  return out;
}

/** Convert slot totals to per-second rate: (v[i] - v[i-1]) / intervalSec. First slot is null. */
function totalsToRatesPerSecond(
  totals: (number | null)[],
  intervalMs: number
): (number | null)[] {
  const intervalSec = intervalMs / 1000;
  const out: (number | null)[] = new Array(totals.length);
  out[0] = null;
  for (let i = 1; i < totals.length; i++) {
    const curr = totals[i];
    const prev = totals[i - 1];
    if (curr != null && prev != null && intervalSec > 0) {
      out[i] = (curr - prev) / intervalSec;
    } else {
      out[i] = null;
    }
  }
  return out;
}

function chartDataFingerprint(labels: string[], datasets: { data: (number | null)[] }[]): string {
  const labelPart = labels.length + "," + (labels[0] ?? "") + "," + (labels[labels.length - 1] ?? "");
  const dataParts = datasets.map((d) => {
    const arr = d.data;
    const len = arr.length;
    const last = len > 0 ? arr[len - 1] : null;
    return `${len},${last}`;
  });
  return labelPart + "|" + dataParts.join(";");
}

function MetricChart(props: MetricChartProps) {
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | null>(null);
  let chartInstance: Chart<"line"> | null = null;
  let lastFingerprint: string | null = null;

  onCleanup(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  createEffect(() => {
    const canvas = canvasRef();
    const series = props.getSeries();
    if (!canvas) return;
    const maxPts = getMaxPoints();
    const widthMin = getChartWidthMinutes();
    const intervalMs = getPollIntervalMs();
    const windowEnd = Date.now();
    const windowStart = windowEnd - widthMin * 60 * 1000;
    const labels = Array.from({ length: maxPts }, (_, i) =>
      formatTime(windowStart + i * intervalMs)
    );
    const datasets = series.map((s, i) => {
      const totals = fillSlotsForSeries(s.data, windowStart, intervalMs, maxPts);
      const data = totalsToRatesPerSecond(totals, intervalMs);
      return {
        label: seriesShortLabel(s),
        data,
        borderColor: CHART_COLORS[i % CHART_COLORS.length],
        backgroundColor: "transparent",
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 6,
        seriesMeta: s.labels as Record<string, string>,
      };
    });

    const fingerprint = chartDataFingerprint(labels, datasets);
    if (chartInstance && lastFingerprint === fingerprint) {
      return;
    }
    lastFingerprint = fingerprint;

    if (!chartInstance) {
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
      chartInstance = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          transitions: { active: { animation: { duration: 0 } } },
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                color: "#a0a0a0",
                font: { size: 11 },
                padding: 12,
                useBorderRadius: true,
                pointStyle: "circle",
              },
            },
            title: {
              display: true,
              text: `${metricDisplayName(props.metricName)} (per s)`,
              color: "#e0e0e0",
              font: { size: 14, weight: "bold" },
              padding: { bottom: 12 },
            },
            tooltip: {
              backgroundColor: "rgba(37, 37, 37, 0.95)",
              titleColor: "#e0e0e0",
              bodyColor: "#a0a0a0",
              borderColor: "#3a3a3a",
              borderWidth: 1,
              padding: 10,
              callbacks: {
                afterBody: (items: TooltipItem<"line">[]) => {
                  const item = items[0];
                  const meta = (item?.dataset as { seriesMeta?: Record<string, string> } | undefined)?.seriesMeta;
                  if (!meta) return [];
                  const skip = new Set(["name", "channel", "type", "group"]);
                  const lines: string[] = [];
                  if (meta.id != null) lines.push(`id: ${meta.id}`);
                  if (meta.node_type != null)
                    lines.push(`type: ${meta.node_type}`);
                  if (meta.group != null && meta.group !== "")
                    lines.push(`group: ${meta.group}`);
                  for (const [k, v] of Object.entries(meta)) {
                    if (skip.has(k) || k === "id" || k === "node_type" || k === "group")
                      continue;
                    lines.push(`${k}: ${v}`);
                  }
                  return lines;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: {
                color: "#808080",
                maxTicksLimit: 8,
                font: { size: 10 },
              },
              grid: { color: "rgba(58,58,58,0.4)" },
            },
            y: {
              beginAtZero: true,
              ticks: {
                color: "#808080",
                font: { size: 10 },
              },
              grid: { color: "rgba(58,58,58,0.4)" },
            },
          },
        },
      } as unknown as ChartConfiguration<"line">);
    } else {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets = datasets;
      chartInstance.options.plugins!.title!.text = `${metricDisplayName(
        props.metricName
      )} (per s)`;
      const instance = chartInstance;
      requestAnimationFrame(() => {
        instance.update("none");
      });
    }
  });

  return (
    <div class="flex-1 min-h-0 min-w-0">
      <canvas ref={setCanvasRef} />
    </div>
  );
}

export function DashboardView() {
  onMount(() => {
    loadChannels()
      .then((list) => setChannelsList(list.map((c) => c.login)))
      .catch(() => {});
    let unlisten: (() => void) | undefined;
    listen<{
      channel: string;
      username: string;
      message: string;
      timestamp: string;
      message_id: string;
      user_id: string;
      color?: string;
    }>("dashboard://chat", (event) => {
      const p = event.payload;
      addChatEntry({
        channel: p.channel,
        username: p.username,
        message: p.message,
        timestamp: p.timestamp,
        messageId: p.message_id,
        userId: p.user_id,
        color: p.color ?? undefined,
      });
    }).then((fn) => {
      unlisten = fn;
    });
    startMetricsPolling();
    return () => {
      unlisten?.();
      stopMetricsPolling();
    };
  });

  const samples = () => getLastSamples();

  const filterLabelKeys = ["id", "name", "node_type", "group"] as const;
  const filterLabelValues = () =>
    allLabelValues(samples(), [...filterLabelKeys]);

  /** Options for each filter, including current selection so it is retained when options refresh. */
  const filterOptionsWithCurrent = (
    key: "id" | "name" | "node_type" | "group"
  ): string[] => {
    const values = filterLabelValues()[key] ?? [];
    const current =
      key === "id"
        ? getDashboardFilterId()
        : key === "name"
          ? getDashboardFilterName()
          : key === "node_type"
            ? getDashboardFilterNodeType()
            : getDashboardFilterGroup();
    if (!current) return values;
    if (values.includes(current)) return values;
    return [...values, current].sort();
  };

  const discoveredNames = () => metricNamesFromSamples(samples());
  const metricNames = (): string[] => {
    const ordered = new Set(DASHBOARD_METRIC_ORDER);
    const rest = discoveredNames().filter((name) => !ordered.has(name));
    return [...DASHBOARD_METRIC_ORDER, ...rest.sort()];
  };

  const firstRowMetrics = (): string[] => metricNames().slice(0, 3);
  const secondRowMetrics = (): string[] => metricNames().slice(3, 6);
  const thirdRowMetrics = (): string[] => metricNames().slice(6, 9);

  /** One pass over series map → per-metric filtered lists; stable refs when content unchanged. */
  const filteredByMetric = createMemo(() => {
    const map = getSeriesMap();
    const id = getDashboardFilterId();
    const nm = getDashboardFilterName();
    const ty = getDashboardFilterNodeType();
    const gr = getDashboardFilterGroup();
    const result = new Map<string, TimeSeries[]>();
    const names = new Set<string>([...ALL_METRIC_NAMES, ...metricNamesFromSamples(getLastSamples())]);
    for (const name of names) {
      const list: TimeSeries[] = [];
      for (const s of map.values()) {
        if (s.name !== name) continue;
        if (id && s.labels.id !== id) continue;
        if (nm && s.labels.name !== nm) continue;
        if (ty && s.labels.node_type !== ty) continue;
        if (gr && s.labels.group !== gr) continue;
        list.push(s);
      }
      const ref = seriesListRefCache.get(name);
      if (ref && seriesListEqual(ref, list)) {
        result.set(name, ref);
      } else {
        seriesListRefCache.set(name, list);
        result.set(name, list);
      }
    }
    return result;
  });

  const getSeriesForMetric = (name: string) => (): TimeSeries[] =>
    filteredByMetric().get(name) ?? [];

  return (
    <div class="flex flex-col h-full min-h-0 w-full">
      <div class="dashboard-controls flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-1.5 border-b border-border bg-bg-secondary shrink-0">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <FilterSelect
            id="filter-id"
            label="Node id"
            value={getDashboardFilterId()}
            options={filterOptionsWithCurrent("id")}
            onChange={setDashboardFilterId}
          />
          <FilterSelect
            id="filter-name"
            label="Node name"
            value={getDashboardFilterName()}
            options={filterOptionsWithCurrent("name")}
            onChange={setDashboardFilterName}
          />
          <FilterSelect
            id="filter-type"
            label="Node type"
            value={getDashboardFilterNodeType()}
            options={filterOptionsWithCurrent("node_type")}
            onChange={setDashboardFilterNodeType}
          />
          <FilterSelect
            id="filter-group"
            label="Group"
            value={getDashboardFilterGroup()}
            options={filterOptionsWithCurrent("group")}
            onChange={setDashboardFilterGroup}
          />
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <FilterSelect
            id="scrape-interval"
            label="Scrape"
            value={String(getPollIntervalMs())}
            options={SCRAPE_INTERVAL_OPTIONS.map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            onChange={(v) => setScrapeInterval(Number(v))}
          />
          <FilterSelect
            id="chart-width"
            label="Time range"
            value={String(getChartWidthMinutes())}
            options={CHART_WIDTH_OPTIONS.map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            onChange={(v) => setChartWidth(Number(v))}
          />
        </div>
      </div>
      <div class="flex-1 min-h-0 flex flex-col overflow-hidden p-3">
        <Show when={getLastError()}>
          <p class="text-warning text-sm mb-2 shrink-0">{getLastError()}</p>
        </Show>
        <div class="flex-1 min-h-0 flex flex-col gap-3 w-full">
          <div class="flex-1 min-h-0 grid grid-cols-3 gap-3 w-full">
            <For each={firstRowMetrics()}>
              {(name: string) => (
                <LazyMetricPanel
                  metricName={name}
                  getSeries={getSeriesForMetric(name)}
                />
              )}
            </For>
          </div>
          <div class="flex-1 min-h-0 grid grid-cols-3 gap-3 w-full">
            <For each={secondRowMetrics()}>
              {(name: string) => (
                <LazyMetricPanel
                  metricName={name}
                  getSeries={getSeriesForMetric(name)}
                />
              )}
            </For>
          </div>
          <div class="flex-1 min-h-0 grid grid-cols-3 gap-3 w-full">
            <For each={thirdRowMetrics()}>
              {(name: string) => (
                <LazyMetricPanel
                  metricName={name}
                  getSeries={getSeriesForMetric(name)}
                />
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
