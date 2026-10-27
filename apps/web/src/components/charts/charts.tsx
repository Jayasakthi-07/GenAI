import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useId } from 'react';
import { cn } from '@/lib/utils';

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

export interface Series {
  key: string;
  label: string;
  color?: string;
  /** Dashed line with no fill, e.g. a forecast or a target. */
  dashed?: boolean;
}

type Formatter = (value: number) => string;

const axisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fill: 'var(--chart-axis)', fontSize: 12 },
  tickMargin: 8,
} as const;

interface TooltipPayloadItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  formatLabel,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  formatValue: Formatter;
  formatLabel?: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border border-hairline bg-elevated px-3 py-2 shadow-float">
      {label !== undefined && (
        <p className="mb-1.5 text-xs font-medium text-fg-secondary">
          {formatLabel ? formatLabel(String(label)) : label}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((item) => (
          <div key={String(item.dataKey)} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-fg-secondary">
              <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden />
              {item.name}
            </span>
            <span className="tabular font-medium text-fg">
              {typeof item.value === 'number' ? formatValue(item.value) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TrendChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: Series[];
  height?: number;
  formatValue?: Formatter;
  formatTick?: (value: string) => string;
  formatLabel?: (label: string) => string;
  /** Compact axis values (e.g. ₹12L) — defaults to formatValue. */
  formatAxis?: Formatter;
  className?: string;
  ariaLabel: string;
}

/** Area/line trend: the first series is filled with a soft gradient, dashed series are lines. */
export function TrendChart({
  data,
  xKey,
  series,
  height = 240,
  formatValue = (v) => v.toLocaleString('en-IN'),
  formatTick,
  formatLabel,
  formatAxis,
  className,
  ariaLabel,
}: TrendChartProps) {
  const gradientId = `grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div className={cn('w-full', className)} style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={series[0]?.color ?? CHART_COLORS[0]} stopOpacity={0.22} />
              <stop offset="100%" stopColor={series[0]?.color ?? CHART_COLORS[0]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey={xKey} {...axisProps} tickFormatter={formatTick} minTickGap={24} />
          <YAxis {...axisProps} width={56} tickFormatter={formatAxis ?? formatValue} />
          <Tooltip
            cursor={{ stroke: 'var(--hairline-strong)', strokeWidth: 1 }}
            content={<ChartTooltip formatValue={formatValue} formatLabel={formatLabel} />}
          />
          {series.map((s, i) =>
            s.dashed || i > 0 ? (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? CHART_COLORS[i]}
                strokeWidth={1.75}
                strokeDasharray={s.dashed ? '4 4' : undefined}
                dot={false}
                activeDot={{ r: 3.5, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ) : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color ?? CHART_COLORS[i]}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ),
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface BarsChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: Series[];
  height?: number;
  layout?: 'vertical' | 'horizontal';
  formatValue?: Formatter;
  formatAxis?: Formatter;
  className?: string;
  ariaLabel: string;
}

export function BarsChart({
  data,
  xKey,
  series,
  height = 240,
  layout = 'horizontal',
  formatValue = (v) => v.toLocaleString('en-IN'),
  formatAxis,
  className,
  ariaLabel,
}: BarsChartProps) {
  const horizontalBars = layout === 'vertical';
  return (
    <div className={cn('w-full', className)} style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={horizontalBars} horizontal={!horizontalBars} stroke="var(--chart-grid)" />
          {horizontalBars ? (
            <>
              <XAxis type="number" {...axisProps} tickFormatter={formatAxis ?? formatValue} />
              <YAxis type="category" dataKey={xKey} {...axisProps} width={120} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...axisProps} minTickGap={12} />
              <YAxis {...axisProps} width={56} tickFormatter={formatAxis ?? formatValue} />
            </>
          )}
          <Tooltip
            cursor={{ fill: 'var(--neutral-soft)' }}
            content={<ChartTooltip formatValue={formatValue} />}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? CHART_COLORS[i]}
              radius={horizontalBars ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DonutChartProps {
  data: Array<{ label: string; value: number; color?: string }>;
  size?: number;
  formatValue?: Formatter;
  centerLabel?: string;
  centerValue?: string;
  ariaLabel: string;
}

export function DonutChart({
  data,
  size = 180,
  formatValue = (v) => v.toLocaleString('en-IN'),
  centerLabel,
  centerValue,
  ariaLabel,
}: DonutChartProps) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="68%"
            outerRadius="100%"
            paddingAngle={1.5}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.label} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip formatValue={formatValue} />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && <span className="tabular text-lg font-semibold tracking-tight">{centerValue}</span>}
          {centerLabel && <span className="text-xs text-fg-tertiary">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

interface ForecastChartProps {
  data: Array<{
    date: string;
    actual: number | null;
    forecast: number | null;
    low: number | null;
    high: number | null;
  }>;
  height?: number;
  formatValue?: Formatter;
  formatTick?: (value: string) => string;
  formatLabel?: (label: string) => string;
  /** Where actuals end and the forecast begins. */
  today?: string;
  ariaLabel: string;
}

/** Actual demand, then the forecast as a dashed line inside its shaded 80 % band. */
export function ForecastChart({
  data,
  height = 260,
  formatValue = (v) => v.toLocaleString('en-IN'),
  formatTick,
  formatLabel,
  today,
  ariaLabel,
}: ForecastChartProps) {
  const rows = data.map((d) => ({ ...d, band: d.low !== null && d.high !== null ? [d.low, d.high] : null }));
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="date" {...axisProps} tickFormatter={formatTick} minTickGap={24} />
          <YAxis {...axisProps} width={56} tickFormatter={formatValue} />
          <Tooltip
            cursor={{ stroke: 'var(--hairline-strong)', strokeWidth: 1 }}
            content={({ active, payload, label }) => (
              <ChartTooltip
                active={active}
                // The band is shown as its own "low – high" line instead of a raw array.
                payload={(payload as unknown as TooltipPayloadItem[] | undefined)?.map((p) =>
                  p.dataKey === 'band' && Array.isArray(p.value)
                    ? {
                        ...p,
                        value: `${formatValue(Number(p.value[0]))} – ${formatValue(Number(p.value[1]))}`,
                      }
                    : p,
                )}
                label={label}
                formatValue={formatValue}
                formatLabel={formatLabel}
              />
            )}
          />
          {today && <ReferenceLine x={today} stroke="var(--hairline-strong)" strokeDasharray="2 3" />}
          <Area
            type="monotone"
            dataKey="band"
            name="Likely range (80 %)"
            stroke="none"
            fill="var(--chart-1)"
            fillOpacity={0.12}
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="Actual"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="forecast"
            name="Forecast"
            stroke="var(--chart-1)"
            strokeWidth={1.75}
            strokeDasharray="4 4"
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Tiny trend line for KPI cards. */
export function Sparkline({
  values,
  tone = 'accent',
  height = 32,
}: {
  values: number[];
  tone?: 'accent' | 'success' | 'danger' | 'neutral';
  height?: number;
}) {
  const id = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (values.length < 2) return <div style={{ height }} />;
  const color = {
    accent: 'var(--chart-1)',
    success: 'var(--success)',
    danger: 'var(--danger)',
    neutral: 'var(--chart-3)',
  }[tone];
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ height }} className="w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
