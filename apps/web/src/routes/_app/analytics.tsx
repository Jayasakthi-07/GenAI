import { INSIGHT_PERIODS } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ClearFilters, FilterMenu, Toolbar } from '@/components/data-table/toolbar';
import { Page, PageHeader } from '@/components/layout/page-header';
import { SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCategoryTree, useWarehouses } from '@/features/catalog/api';
import { AbcXyzPanel } from '@/features/insights/abc-xyz';
import {
  type InsightData,
  type InsightFilters,
  type InsightSection,
  insightQuery,
} from '@/features/insights/api';
import { DeadStockPanel } from '@/features/insights/dead-stock';
import { ForecastPanel } from '@/features/insights/forecast';
import { MovementsPanel } from '@/features/insights/movements';
import { InsightView } from '@/features/insights/shared';
import { SuppliersPanel } from '@/features/insights/suppliers';
import { TurnoverPanel } from '@/features/insights/turnover';
import { ValuationPanel } from '@/features/insights/valuation';
import { cleanSearch, idParam } from '@/lib/list-search';

const TABS = [
  { value: 'valuation', label: 'Valuation' },
  { value: 'movements', label: 'Movements' },
  { value: 'abc-xyz', label: 'ABC–XYZ' },
  { value: 'turnover', label: 'Turnover' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'dead-stock', label: 'Dead stock' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const searchSchema = z.object({
  tab: z
    .enum(TABS.map((t) => t.value) as [Tab, ...Tab[]])
    .optional()
    .catch(undefined),
  days: z
    .union(
      INSIGHT_PERIODS.map((d) => z.literal(d)) as [
        z.ZodLiteral<30>,
        z.ZodLiteral<90>,
        ...z.ZodLiteral<number>[],
      ],
    )
    .optional()
    .catch(undefined),
  warehouseId: idParam,
  categoryId: idParam,
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute('/_app/analytics')({
  validateSearch: searchSchema,
  staticData: { title: 'Analytics' },
  component: AnalyticsPage,
});

/** Which filters each tab honours, so the toolbar never offers one that does nothing. */
const USES: Record<Tab, { days: boolean; warehouse: boolean; category: boolean }> = {
  valuation: { days: true, warehouse: true, category: true },
  movements: { days: true, warehouse: true, category: true },
  'abc-xyz': { days: false, warehouse: true, category: true },
  turnover: { days: true, warehouse: true, category: true },
  forecast: { days: false, warehouse: true, category: true },
  suppliers: { days: false, warehouse: false, category: false },
  'dead-stock': { days: false, warehouse: true, category: true },
};

function Panel({ tab, filters }: { tab: Tab; filters: InsightFilters }) {
  const uses = USES[tab];
  const f: InsightFilters = {
    days: uses.days ? filters.days : 90,
    warehouseId: uses.warehouse ? filters.warehouseId : undefined,
    categoryId: uses.category ? filters.categoryId : undefined,
  };
  switch (tab) {
    case 'valuation':
      return <Section section="valuation" filters={f} render={(d) => <ValuationPanel data={d} />} />;
    case 'movements':
      return (
        <Section section="movements" filters={f} render={(d) => <MovementsPanel data={d} days={f.days} />} />
      );
    case 'abc-xyz':
      return <Section section="abc-xyz" filters={f} kpis={0} render={(d) => <AbcXyzPanel data={d} />} />;
    case 'turnover':
      return <Section section="turnover" filters={f} render={(d) => <TurnoverPanel data={d} />} />;
    case 'forecast':
      return <Section section="forecast" filters={f} render={(d) => <ForecastPanel data={d} />} />;
    case 'suppliers':
      return <Section section="suppliers" filters={f} kpis={0} render={(d) => <SuppliersPanel data={d} />} />;
    case 'dead-stock':
      return (
        <Section section="dead-stock" filters={f} kpis={3} render={(d) => <DeadStockPanel data={d} />} />
      );
  }
}

function Section<K extends InsightSection>({
  section,
  filters,
  render,
  kpis,
}: {
  section: K;
  filters: InsightFilters;
  render: (data: InsightData<K>) => React.ReactNode;
  kpis?: number;
}) {
  const query = useQuery(insightQuery(section, filters));
  return (
    <InsightView query={query} kpis={kpis}>
      {render}
    </InsightView>
  );
}

function AnalyticsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const warehouses = useWarehouses();
  const categories = useCategoryTree();
  const tab = search.tab ?? 'valuation';
  const days = search.days ?? 90;
  const uses = USES[tab];
  const setSearch = (patch: Partial<Search>) =>
    void navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true });

  return (
    <Page>
      <PageHeader
        title="Analytics"
        description="Where the money is, what moves, how well demand is predicted and which suppliers deliver. Every figure is calculated by Stockroom from the ledger."
      />
      <Tabs value={tab} onValueChange={(v) => setSearch({ tab: v === 'valuation' ? undefined : (v as Tab) })}>
        <TabsList aria-label="Analytics views">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {(uses.days || uses.warehouse || uses.category) && (
          <Toolbar className="pt-4">
            {uses.days && (
              <SegmentedControl
                aria-label="Period"
                value={String(days)}
                onValueChange={(v) => setSearch({ days: v === '90' ? undefined : Number(v) })}
                options={INSIGHT_PERIODS.map((d) => ({
                  value: String(d),
                  label: d === 365 ? '1Y' : `${d}D`,
                  ariaLabel: `Last ${d} days`,
                }))}
              />
            )}
            {uses.warehouse && (
              <FilterMenu
                label="Warehouse"
                multiple={false}
                value={search.warehouseId}
                onChange={(v) => setSearch({ warehouseId: v?.[0] })}
                options={(warehouses.data ?? []).map((w) => ({ value: w.id, label: w.name }))}
              />
            )}
            {uses.category && (
              <FilterMenu
                label="Category"
                multiple={false}
                searchable
                value={search.categoryId}
                onChange={(v) => setSearch({ categoryId: v?.[0] })}
                options={categories.flat.map((c) => ({ value: c.id, label: c.path }))}
              />
            )}
            <ClearFilters
              show={Boolean(search.warehouseId || search.categoryId || search.days)}
              onClear={() => setSearch({ warehouseId: undefined, categoryId: undefined, days: undefined })}
            />
          </Toolbar>
        )}

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.value === tab && (
              <Panel
                tab={tab}
                filters={{ days, warehouseId: search.warehouseId, categoryId: search.categoryId }}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Page>
  );
}
