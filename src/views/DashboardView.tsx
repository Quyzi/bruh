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
import {
  addChatEntry,
  getChatLog,
  getChannels,
  setChannelsList,
} from "../lib/dashboardChatStore";
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
  Filler,
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
  Legend,
  Filler,
);

// ── Color palette (Grafana-inspired) ─────────────────────────────────────────

const CHART_COLORS = [
  "#7EB26D",
  "#EAB839",
  "#6ED0E0",
  "#EF843C",
  "#E24D42",
  "#1F78C1",
  "#BA43A9",
  "#705DA0",
];

// ── Section config ───────────────────────────────────────────────────────────

interface StatConfig {
  name: string;
  label: string;
  /** If true, a nonzero value is highlighted red instead of accent. */
  alert?: boolean;
}

interface SectionConfig {
  title: string;
  stats: StatConfig[];
  charts: string[];
}

const SECTIONS: SectionConfig[] = [
  {
    title: "Chat",
    stats: [
      { name: "bruh_chat_messages_received_total", label: "Received" },
      { name: "bruh_chat_messages_sent_total",     label: "Sent" },
      { name: "bruh_moderation_actions_total",     label: "Moderation Actions" },
    ],
    charts: [
      "bruh_chat_messages_received_total",
      "bruh_chat_messages_sent_total",
    ],
  },
  {
    title: "Pipeline",
    stats: [
      { name: "bruh_node_executions_total",         label: "Node Executions" },
      { name: "bruh_node_outcomes_total",           label: "Outcomes" },
      { name: "bruh_pipeline_runs_failed_total",    label: "Failures",      alert: true },
      { name: "bruh_pipeline_events_dropped_total", label: "Events Dropped", alert: true },
    ],
    charts: [
      "bruh_node_executions_total",
      "bruh_node_outcomes_total",
      "bruh_node_execution_duration_ms_sum",
    ],
  },
  {
    title: "Scripts",
    stats: [
      { name: "bruh_script_executions_total", label: "Executions" },
      { name: "bruh_script_errors_total",     label: "Errors", alert: true },
    ],
    charts: [
      "bruh_script_executions_total",
      "bruh_script_execution_duration_ms_sum",
    ],
  },
  {
    title: "EventSub",
    stats: [
      { name: "bruh_eventsub_events_total",         label: "Events" },
      { name: "bruh_eventsub_events_dropped_total", label: "Dropped",    alert: true },
      { name: "bruh_eventsub_reconnects_total",     label: "Reconnects", alert: true },
    ],
    charts: [
      "bruh_eventsub_events_total",
      "bruh_eventsub_events_dropped_total",
    ],
  },
  {
    title: "AI & Database",
    stats: [
      { name: "bruh_ai_prompt_requests_total",    label: "AI Requests" },
      { name: "bruh_ai_prompt_errors_total",      label: "AI Errors",  alert: true },
      { name: "bruh_database_queries_total",      label: "DB Queries" },
      { name: "bruh_database_query_errors_total", label: "DB Errors",  alert: true },
    ],
    charts: [
      "bruh_ai_prompt_requests_total",
      "bruh_database_queries_total",
    ],
  },
  {
    title: "Health",
    stats: [
      { name: "bruh_auth_token_refresh_failures_total", label: "Auth Refresh Failures", alert: true },
      { name: "bruh_timer_ticks_sent_total",            label: "Timer Ticks" },
    ],
    charts: [],
  },
];

// Flat set of all metric names referenced across all sections.
const ALL_SECTION_METRICS = new Set<string>(
  SECTIONS.flatMap((s) => [...s.stats.map((m) => m.name), ...s.charts])
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function metricDisplayName(name: string): string {
  return name
    .replace(/^bruh_/, "")
    .replace(/_total$/, "")
    .replace(/_sum$/, " (sum)")
    .replace(/_/g, " ");
}

function relativeTime(timestamp: string): string {
  // Backend sends Unix milliseconds as a string.
  const t = Number(timestamp);
  const ms = Date.now() - (isNaN(t) ? new Date(timestamp).getTime() : t);
  if (isNaN(ms) || ms < 0) return "just now";
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  return `${Math.floor(ms / 3600000)}h ago`;
}

function seriesShortLabel(s: TimeSeries): string {
  const l = s.labels;
  const base =
    l.name ?? l.channel ?? l.type ?? l.source_name ?? l.source_id ??
    (Object.keys(l).length > 0 ? Object.values(l).join(", ") : s.key);
  const group = l.group?.trim();
  return group ? `${base} [${group}]` : base;
}

// ── Series ref cache ──────────────────────────────────────────────────────────

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

// ── Chart init stagger ────────────────────────────────────────────────────────

let chartInitCounter = 0;
const STAGGER_MS = 80;

// ── FilterSelect ──────────────────────────────────────────────────────────────

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
    if (el.value !== wanted) el.value = wanted;
  });
  return (
    <div class="flex items-center gap-1.5">
      <label for={props.id} class="text-text-secondary text-xs whitespace-nowrap">
        {props.label}
      </label>
      <select
        ref={(el) => (selectRef = el)}
        id={props.id}
        class="bg-bg-tertiary border border-border rounded px-1.5 py-0.5 text-text-primary text-xs min-w-0 max-w-[110px]"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <option value="">All</option>
        <For each={opts()}>
          {(o) => <option value={o.value}>{o.label}</option>}
        </For>
      </select>
    </div>
  );
}

// ── StatPanel ─────────────────────────────────────────────────────────────────

interface StatPanelProps {
  label: string;
  getSeries: () => TimeSeries[];
  alert?: boolean;
}

function StatPanel(props: StatPanelProps) {
  const total = createMemo(() => {
    let sum = 0;
    for (const s of props.getSeries()) {
      const last = s.data[s.data.length - 1];
      if (last != null) sum += last.v;
    }
    return sum;
  });

  const rate = createMemo(() => {
    const intervalMs = getPollIntervalMs();
    let delta = 0;
    for (const s of props.getSeries()) {
      const d = s.data;
      if (d.length < 2) continue;
      const prev = d[d.length - 2]!;
      const last = d[d.length - 1]!;
      const dt = (last.t - prev.t) || intervalMs;
      delta += Math.max(0, (last.v - prev.v) / (dt / 1000));
    }
    return delta;
  });

  const rateStr = () => {
    const r = rate();
    if (r === 0) return "0 /s";
    if (r < 0.1) return `${(r * 60).toFixed(1)} /min`;
    return `${r.toFixed(2)} /s`;
  };

  const isAlert = () => props.alert && total() > 0;

  return (
    <div class="flex flex-col justify-between rounded border border-border bg-bg-secondary px-3 py-2 min-w-0">
      <span class="text-[10px] text-text-secondary uppercase tracking-wide truncate">
        {props.label}
      </span>
      <span
        class="text-2xl font-bold leading-none mt-0.5"
        classList={{
          "text-error": isAlert(),
          "text-text-primary": !isAlert(),
        }}
      >
        {total().toLocaleString()}
      </span>
      <span
        class="text-[10px] mt-0.5"
        classList={{
          "text-error": isAlert(),
          "text-accent": !isAlert() && rate() > 0,
          "text-text-secondary": !isAlert() && rate() === 0,
        }}
      >
        {rateStr()}
      </span>
    </div>
  );
}

// ── ChatFeedPanel ─────────────────────────────────────────────────────────────

function ChatFeedPanel() {
  const [channelFilter, setChannelFilter] = createSignal("");
  let listRef: HTMLDivElement | undefined;

  const entries = createMemo(() => {
    const filter = channelFilter();
    const log = getChatLog()();
    return filter ? log.filter((e) => e.channel === filter) : log;
  });

  createEffect(() => {
    entries();
    if (listRef) listRef.scrollTop = 0;
  });

  const multiChannel = () => getChannels()().length > 1;

  return (
    <div class="flex flex-col h-full min-h-0 rounded-lg border border-border bg-bg-secondary overflow-hidden">
      <div class="dashboard-controls flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <span class="text-[10px] text-text-secondary uppercase tracking-widest font-semibold">
          Live Chat
        </span>
        <Show when={multiChannel()}>
          <select
            class="bg-bg-tertiary border border-border rounded px-1.5 py-0.5 text-text-primary text-xs"
            value={channelFilter()}
            onChange={(e) => setChannelFilter(e.currentTarget.value)}
          >
            <option value="">All channels</option>
            <For each={getChannels()()}>
              {(ch) => <option value={ch}>{ch}</option>}
            </For>
          </select>
        </Show>
      </div>
      <div
        ref={(el) => (listRef = el)}
        class="flex-1 min-h-0 overflow-y-auto px-2 py-2 flex flex-col gap-1.5"
      >
        <Show
          when={entries().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full text-text-secondary text-xs">
              No messages yet
            </div>
          }
        >
          <For each={entries()}>
            {(entry) => (
              <div class="group flex flex-col gap-0.5">
                <div class="flex items-baseline gap-1.5 min-w-0">
                  <Show when={multiChannel()}>
                    <span class="text-[10px] text-text-secondary shrink-0 font-mono">
                      #{entry.channel}
                    </span>
                  </Show>
                  <span
                    class="text-[11px] font-semibold shrink-0 truncate max-w-[120px]"
                    style={{ color: entry.color ?? "#a0a0a0" }}
                  >
                    {entry.username}
                  </span>
                  {/* Timestamp: hidden by default, visible on group hover */}
                  <span class="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity ml-auto pl-1 shrink-0">
                    {relativeTime(entry.timestamp)}
                  </span>
                </div>
                <div
                  class="text-xs text-text-primary break-words leading-snug rounded-lg rounded-tl-sm px-2.5 py-1.5 self-start max-w-[95%]"
                  style={{ "background-color": (entry.color ?? "#646cff") + "1a" }}
                >
                  {entry.message}
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

function fillSlotsForSeries(
  data: { t: number; v: number }[],
  windowStart: number,
  intervalMs: number,
  maxPts: number
): (number | null)[] {
  const out: (number | null)[] = new Array(maxPts);
  let idx = 0;
  for (let i = 0; i < maxPts; i++) {
    const slotTime = windowStart + i * intervalMs;
    while (idx < data.length && data[idx]!.t <= slotTime) idx++;
    out[i] = idx > 0 ? data[idx - 1]!.v : null;
  }
  return out;
}

function totalsToRatesPerSecond(
  totals: (number | null)[],
  intervalMs: number
): (number | null)[] {
  const sec = intervalMs / 1000;
  const out: (number | null)[] = new Array(totals.length);
  out[0] = null;
  for (let i = 1; i < totals.length; i++) {
    const c = totals[i], p = totals[i - 1];
    out[i] = c != null && p != null && sec > 0 ? (c - p) / sec : null;
  }
  return out;
}

function chartDataFingerprint(
  labels: string[],
  datasets: { data: (number | null)[] }[]
): string {
  const lp = `${labels.length},${labels[0] ?? ""},${labels[labels.length - 1] ?? ""}`;
  return lp + "|" + datasets.map((d) => `${d.data.length},${d.data[d.data.length - 1]}`).join(";");
}

// ── MetricChart ───────────────────────────────────────────────────────────────

interface LegendItem { color: string; label: string; }

function MetricChart(props: { metricName: string; getSeries: () => TimeSeries[] }) {
  const [canvasRef, setCanvasRef] = createSignal<HTMLCanvasElement | null>(null);
  const [legendItems, setLegendItems] = createSignal<LegendItem[]>([]);
  let chartInstance: Chart<"line"> | null = null;
  let lastFingerprint: string | null = null;

  onCleanup(() => { chartInstance?.destroy(); chartInstance = null; });

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

    const ctx = canvas.getContext("2d");
    const newLegend: LegendItem[] = [];
    const datasets = series.map((s, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length]!;
      const totals = fillSlotsForSeries(s.data, windowStart, intervalMs, maxPts);
      const data = totalsToRatesPerSecond(totals, intervalMs);
      let backgroundColor: CanvasGradient | string = color + "26";
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 180);
        grad.addColorStop(0, color + "40");
        grad.addColorStop(1, color + "00");
        backgroundColor = grad;
      }
      newLegend.push({ color, label: seriesShortLabel(s) });
      return {
        label: seriesShortLabel(s),
        data,
        borderColor: color,
        backgroundColor,
        borderWidth: 2,
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 5,
        seriesMeta: s.labels as Record<string, string>,
      };
    });
    setLegendItems(newLegend);

    const fingerprint = chartDataFingerprint(labels, datasets);
    if (chartInstance && lastFingerprint === fingerprint) return;
    lastFingerprint = fingerprint;

    if (!chartInstance) {
      Chart.getChart(canvas)?.destroy();
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
            legend: { display: false },
            title: {
              display: true,
              text: `${metricDisplayName(props.metricName)} /s`,
              color: "#707070",
              font: { size: 11, weight: "normal" },
              align: "start",
              padding: { bottom: 6, top: 4 },
            },
            tooltip: {
              backgroundColor: "rgba(20,20,20,0.95)",
              titleColor: "#e0e0e0",
              bodyColor: "#909090",
              borderColor: "#3a3a3a",
              borderWidth: 1,
              padding: 10,
              callbacks: {
                afterBody: (items: TooltipItem<"line">[]) => {
                  const meta = (items[0]?.dataset as { seriesMeta?: Record<string, string> })?.seriesMeta;
                  if (!meta) return [];
                  const skip = new Set(["name", "channel", "type", "group"]);
                  const lines: string[] = [];
                  if (meta.id) lines.push(`id: ${meta.id}`);
                  if (meta.node_type) lines.push(`type: ${meta.node_type}`);
                  if (meta.group) lines.push(`group: ${meta.group}`);
                  for (const [k, v] of Object.entries(meta)) {
                    if (!skip.has(k) && k !== "id" && k !== "node_type" && k !== "group")
                      lines.push(`${k}: ${v}`);
                  }
                  return lines;
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { color: "#606060", maxTicksLimit: 6, font: { size: 10 } },
              grid: { color: "rgba(255,255,255,0.06)" },
              border: { color: "rgba(255,255,255,0.06)" },
            },
            y: {
              beginAtZero: true,
              ticks: { color: "#606060", font: { size: 10 }, maxTicksLimit: 5 },
              grid: { color: "rgba(255,255,255,0.06)" },
              border: { color: "rgba(255,255,255,0.06)" },
            },
          },
        },
      } as unknown as ChartConfiguration<"line">);
    } else {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets = datasets;
      chartInstance.options.plugins!.title!.text = `${metricDisplayName(props.metricName)} /s`;
      const inst = chartInstance;
      requestAnimationFrame(() => inst.update("none"));
    }
  });

  return (
    <div class="flex flex-col min-h-0 flex-1 gap-1">
      <div class="flex-1 min-h-0 min-w-0">
        <canvas ref={setCanvasRef} />
      </div>
      <Show when={legendItems().length > 0}>
        <div class="overflow-y-auto max-h-10 shrink-0 flex flex-wrap gap-x-3 gap-y-0.5 px-0.5">
          <For each={legendItems()}>
            {(item) => (
              <div class="flex items-center gap-1 min-w-0">
                <span
                  class="inline-block w-3 rounded-sm shrink-0"
                  style={{ height: "2px", "background-color": item.color }}
                />
                <span class="text-[10px] text-text-secondary truncate">{item.label}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ── LazyMetricPanel ───────────────────────────────────────────────────────────

function LazyMetricPanel(props: { metricName: string; getSeries: () => TimeSeries[] }) {
  const [isInView, setIsInView] = createSignal(false);
  let containerRef: HTMLDivElement | undefined;
  let inTimer: ReturnType<typeof setTimeout> | null = null;
  let outTimer: ReturnType<typeof setTimeout> | null = null;
  const slot = chartInitCounter++;

  onMount(() => {
    const el = containerRef;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      const visible = entry?.isIntersecting ?? false;
      if (visible) {
        if (outTimer) { clearTimeout(outTimer); outTimer = null; }
        if (!inTimer) inTimer = setTimeout(() => {
          inTimer = null;
          setTimeout(() => setIsInView(true), slot * STAGGER_MS);
        }, 200);
      } else {
        if (inTimer) { clearTimeout(inTimer); inTimer = null; }
        if (!outTimer) outTimer = setTimeout(() => { outTimer = null; setIsInView(false); }, 400);
      }
    }, { root: null, rootMargin: "80px", threshold: 0 });
    observer.observe(el);
    onCleanup(() => {
      observer.disconnect();
      if (inTimer) clearTimeout(inTimer);
      if (outTimer) clearTimeout(outTimer);
    });
  });

  return (
    <div
      ref={(el) => (containerRef = el)}
      class="dashboard-metric-panel rounded-lg border border-border bg-bg-secondary p-3 flex flex-col min-h-0 h-full"
    >
      <Show
        when={isInView()}
        fallback={
          <div class="flex-1 flex items-center justify-center text-text-secondary text-xs uppercase tracking-wide">
            {metricDisplayName(props.metricName)}
          </div>
        }
      >
        <MetricChart metricName={props.metricName} getSeries={props.getSeries} />
      </Show>
      <Show when={isInView() && props.getSeries().length === 0}>
        <p class="text-text-secondary text-xs mt-1 text-center shrink-0">No data yet</p>
      </Show>
    </div>
  );
}

// ── DashboardSection ──────────────────────────────────────────────────────────

function DashboardSection(props: {
  section: SectionConfig;
  getSeriesForMetric: (name: string) => () => TimeSeries[];
}) {
  const statColClass = () => {
    const n = props.section.stats.length;
    if (n <= 2) return "grid-cols-2";
    if (n <= 3) return "grid-cols-3";
    return "grid-cols-4";
  };

  const chartColClass = () => {
    const n = props.section.charts.length;
    if (n === 1) return "grid-cols-1";
    if (n === 2) return "grid-cols-2";
    return "grid-cols-3";
  };

  return (
    <div class="flex flex-col gap-2">
      {/* Section header */}
      <div class="flex items-center gap-2 pt-1">
        <span class="text-[10px] font-semibold text-text-secondary uppercase tracking-widest shrink-0">
          {props.section.title}
        </span>
        <div class="flex-1 h-px bg-border" />
      </div>

      {/* Stat panels */}
      <div class={`grid ${statColClass()} gap-2`}>
        <For each={props.section.stats}>
          {(m) => (
            <StatPanel
              label={m.label}
              getSeries={props.getSeriesForMetric(m.name)}
              alert={m.alert}
            />
          )}
        </For>
      </div>

      {/* Chart panels */}
      <Show when={props.section.charts.length > 0}>
        <div
          class={`grid ${chartColClass()} gap-2`}
          style="grid-auto-rows: 11rem"
        >
          <For each={props.section.charts}>
            {(name) => (
              <LazyMetricPanel
                metricName={name}
                getSeries={props.getSeriesForMetric(name)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ── ResizableChat ─────────────────────────────────────────────────────────────

function ResizableChat() {
  const MIN_W = 240;
  const MAX_W = 600;
  const DEFAULT_W = 320;
  const [width, setWidth] = createSignal(DEFAULT_W);
  let dragging = false;
  let startX = 0;
  let startW = 0;

  function onMouseDown(e: MouseEvent) {
    dragging = true;
    startX = e.clientX;
    startW = width();
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      if (!dragging) return;
      const delta = startX - ev.clientX; // drag left = wider
      setWidth(Math.min(MAX_W, Math.max(MIN_W, startW + delta)));
    };
    const onUp = () => {
      dragging = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div class="flex flex-row shrink-0 min-h-0" style={{ width: `${width()}px` }}>
      {/* Drag handle on the left edge */}
      <div
        class="w-1 shrink-0 cursor-col-resize hover:bg-accent/40 transition-colors rounded"
        onMouseDown={onMouseDown}
      />
      <div class="flex-1 min-w-0 min-h-0">
        <ChatFeedPanel />
      </div>
    </div>
  );
}

// ── DashboardView ─────────────────────────────────────────────────────────────

export function DashboardView() {
  onMount(() => {
    loadChannels()
      .then((list) => setChannelsList(list.map((c) => c.login)))
      .catch(() => {});

    let unlisten: (() => void) | undefined;
    listen<{
      channel: string; username: string; message: string;
      timestamp: string; message_id: string; user_id: string; color?: string;
    }>("dashboard://chat", (event) => {
      const p = event.payload;
      addChatEntry({
        channel: p.channel, username: p.username, message: p.message,
        timestamp: p.timestamp, messageId: p.message_id, userId: p.user_id,
        color: p.color ?? undefined,
      });
    }).then((fn) => { unlisten = fn; });

    startMetricsPolling();
    onCleanup(() => { unlisten?.(); stopMetricsPolling(); });
  });

  const samples = () => getLastSamples();
  const filterLabelKeys = ["id", "name", "node_type", "group"] as const;
  const filterLabelValues = () => allLabelValues(samples(), [...filterLabelKeys]);

  const filterOptionsWithCurrent = (key: "id" | "name" | "node_type" | "group"): string[] => {
    const values = filterLabelValues()[key] ?? [];
    const current =
      key === "id" ? getDashboardFilterId()
      : key === "name" ? getDashboardFilterName()
      : key === "node_type" ? getDashboardFilterNodeType()
      : getDashboardFilterGroup();
    if (!current) return values;
    if (values.includes(current)) return values;
    return [...values, current].sort();
  };

  /** O(series + metrics): group by name first, then filter per section. */
  const filteredByMetric = createMemo(() => {
    const map = getSeriesMap();
    const id = getDashboardFilterId();
    const nm = getDashboardFilterName();
    const ty = getDashboardFilterNodeType();
    const gr = getDashboardFilterGroup();

    // One pass to group all series by metric name
    const byName = new Map<string, TimeSeries[]>();
    for (const s of map.values()) {
      const arr = byName.get(s.name);
      if (arr) arr.push(s);
      else byName.set(s.name, [s]);
    }

    // Also include discovered names beyond our config
    const names = new Set<string>([
      ...ALL_SECTION_METRICS,
      ...metricNamesFromSamples(samples()),
    ]);

    const result = new Map<string, TimeSeries[]>();
    for (const name of names) {
      const raw = byName.get(name) ?? [];
      const filtered = raw.filter((s) =>
        (!id || s.labels.id === id) &&
        (!nm || s.labels.name === nm) &&
        (!ty || s.labels.node_type === ty) &&
        (!gr || s.labels.group === gr)
      );
      const ref = seriesListRefCache.get(name);
      if (ref && seriesListEqual(ref, filtered)) {
        result.set(name, ref);
      } else {
        seriesListRefCache.set(name, filtered);
        result.set(name, filtered);
      }
    }
    return result;
  });

  const getSeriesForMetric = (name: string) => (): TimeSeries[] =>
    filteredByMetric().get(name) ?? [];

  return (
    <div class="flex flex-col h-full min-h-0 w-full">

      {/* Controls bar */}
      <div class="dashboard-controls flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-1.5 border-b border-border bg-bg-secondary shrink-0">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <FilterSelect id="filter-id"    label="Node id"   value={getDashboardFilterId()}       options={filterOptionsWithCurrent("id")}        onChange={setDashboardFilterId} />
          <FilterSelect id="filter-name"  label="Node name" value={getDashboardFilterName()}     options={filterOptionsWithCurrent("name")}      onChange={setDashboardFilterName} />
          <FilterSelect id="filter-type"  label="Type"      value={getDashboardFilterNodeType()} options={filterOptionsWithCurrent("node_type")} onChange={setDashboardFilterNodeType} />
          <FilterSelect id="filter-group" label="Group"     value={getDashboardFilterGroup()}    options={filterOptionsWithCurrent("group")}     onChange={setDashboardFilterGroup} />
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Show when={getLastError()}>
            <span class="text-error text-xs">{getLastError()}</span>
          </Show>
          <FilterSelect id="scrape-interval" label="Scrape" value={String(getPollIntervalMs())}    options={SCRAPE_INTERVAL_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))} onChange={(v) => setScrapeInterval(Number(v))} />
          <FilterSelect id="chart-width"     label="Range"  value={String(getChartWidthMinutes())} options={CHART_WIDTH_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}    onChange={(v) => setChartWidth(Number(v))} />
        </div>
      </div>

      {/* Body: scrollable sections + fixed chat */}
      <div class="flex-1 min-h-0 flex flex-row gap-2 p-2 overflow-hidden">

        {/* Scrollable metrics sections */}
        <div class="flex-1 min-h-0 overflow-y-auto pr-1">
          <div class="flex flex-col gap-4 pb-2">
            <For each={SECTIONS}>
              {(section) => (
                <DashboardSection
                  section={section}
                  getSeriesForMetric={getSeriesForMetric}
                />
              )}
            </For>
          </div>
        </div>

        {/* Resizable chat feed */}
        <ResizableChat />


      </div>
    </div>
  );
}
