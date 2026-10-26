import type { ChatChart } from '@stockroom/shared';
import { formatMoney, formatNumber } from '@stockroom/shared';
import { BarsChart, TrendChart } from '@/components/charts/charts';

/** A chart built from a tool's structured result (sales by week, forecasts, sales by group). */
export function ChatChartView({ chart }: { chart: ChatChart }) {
  const format = (v: number) =>
    chart.unit === 'money'
      ? formatMoney(v, { compact: v >= 100_000, compactDecimals: true })
      : formatNumber(v);
  const series = chart.series.map((s, i) => ({
    key: s.key,
    label: s.label,
    ...(i > 0 ? { color: 'var(--chart-3)' } : {}),
  }));
  return (
    <figure className="rounded-lg border border-hairline bg-surface p-3">
      <figcaption className="mb-2 text-xs font-medium text-fg-secondary">{chart.title}</figcaption>
      {chart.type === 'trend' ? (
        <TrendChart
          data={chart.data}
          xKey={chart.xKey}
          series={series}
          height={160}
          formatValue={format}
          ariaLabel={chart.title}
        />
      ) : (
        <BarsChart
          data={chart.data}
          xKey={chart.xKey}
          series={series}
          height={170}
          formatValue={format}
          ariaLabel={chart.title}
        />
      )}
    </figure>
  );
}
