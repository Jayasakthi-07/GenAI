import { formatMoney, formatNumber } from '@stockroom/shared';
import { createFileRoute } from '@tanstack/react-router';
import {
  Download,
  Filter,
  IndianRupee,
  Inbox,
  Mail,
  MoreHorizontal,
  PackageSearch,
  Plus,
  Search,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { AiMarker } from '@/components/ai/ai-marker';
import { BarsChart, DonutChart, Sparkline, TrendChart } from '@/components/charts/charts';
import { EmptyState, ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Badge, StatusPill } from '@/components/ui/badge';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import {
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, Label } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { KpiCard } from '@/components/ui/kpi-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui/menus';
import { Avatar, Kbd, Skeleton } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { SegmentedControl, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/design')({
  staticData: { title: 'Design system' },
  component: DesignPage,
});

/* Example content for the gallery only: realistic, clearly labelled, never shown as live data. */
const EXAMPLE_TREND = Array.from({ length: 30 }, (_, i) => {
  const base = 320000 + Math.sin(i / 3) * 40000 + i * 2500 + (i % 7 === 6 ? 60000 : 0);
  return {
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    revenue: Math.round(base),
    average: Math.round(320000 + i * 2500),
  };
});
const EXAMPLE_BARS = [
  { name: 'Staples', value: 1240000 },
  { name: 'Oils & Ghee', value: 860000 },
  { name: 'Beverages', value: 610000 },
  { name: 'Snacks', value: 480000 },
];
const EXAMPLE_ROWS = [
  {
    sku: 'STP-RIC-001',
    name: '24 Mantra Organic Sona Masuri Rice 5 kg',
    stock: 412,
    value: 119480,
    status: 'In stock' as const,
  },
  {
    sku: 'OIL-OIL-001',
    name: 'Fortune Sunlite Refined Sunflower Oil 1 L pouch',
    stock: 0,
    value: 0,
    status: 'Out of stock' as const,
  },
  {
    sku: 'PKF-NDL-002',
    name: 'Maggi 2-Minute Masala Noodles 4 × 70 g',
    stock: 94,
    value: 4418,
    status: 'Low' as const,
  },
];

function ThemeFrame({ theme, children }: { theme: 'light' | 'dark'; children: React.ReactNode }) {
  return (
    <div data-theme={theme} className="rounded-xl border border-hairline bg-canvas p-5 text-fg">
      <p className="mb-4 text-xs font-medium tracking-wide text-fg-tertiary uppercase">{theme}</p>
      {children}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-sm text-fg-secondary">{description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ThemeFrame theme="light">{children}</ThemeFrame>
        <ThemeFrame theme="dark">{children}</ThemeFrame>
      </div>
    </section>
  );
}

function Swatch({ name, varName, text }: { name: string; varName: string; text?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="grid size-9 shrink-0 place-items-center rounded-md border border-hairline text-sm font-semibold"
        style={
          text
            ? { color: `var(${varName})`, background: 'var(--surface)' }
            : { background: `var(${varName})` }
        }
      >
        {text ? 'Aa' : null}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate font-mono text-[11px] text-fg-tertiary">{varName}</p>
      </div>
    </div>
  );
}

/** Sections render twice (light and dark), so control ids must be generated. */
function ToggleRow({ label, control }: { label: string; control: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      {control(id)}
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

function DesignPage() {
  const [segment, setSegment] = useState<'7' | '30' | '90'>('30');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(true);

  return (
    <Page>
      <PageHeader
        title="Design system"
        description="Tokens and components every screen is built from, shown in light and dark. Floating layers (menus, dialogs, toasts) follow the app theme."
      />

      <div className="flex flex-col gap-10">
        <Section
          title="Colour"
          description="Neutral surfaces, one accent, status colours used sparingly. Text meets WCAG AA."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Swatch name="Canvas" varName="--canvas" />
            <Swatch name="Surface" varName="--surface" />
            <Swatch name="Surface 3" varName="--surface-3" />
            <Swatch name="Text" varName="--fg" text />
            <Swatch name="Secondary" varName="--fg-secondary" text />
            <Swatch name="Tertiary" varName="--fg-tertiary" text />
            <Swatch name="Accent" varName="--accent" />
            <Swatch name="Success" varName="--success" />
            <Swatch name="Warning" varName="--warning" />
            <Swatch name="Danger" varName="--danger" />
            <Swatch name="Hairline" varName="--hairline-strong" />
            <Swatch name="Accent text" varName="--accent-text" text />
          </div>
        </Section>

        <Section
          title="Typography"
          description="System font on Apple devices, Inter elsewhere. Tabular numerals for every figure."
        >
          <div className="flex flex-col gap-2">
            <p className="text-3xl font-semibold tracking-tighter">Inventory overview · 32</p>
            <p className="text-2xl font-semibold tracking-tighter">Purchase orders · 24</p>
            <p className="text-xl font-semibold tracking-tight">Section heading · 20</p>
            <p className="text-lg font-semibold tracking-tight">Card title · 17</p>
            <p className="text-base">Body text reads comfortably at 15 pixels. · 15</p>
            <p className="text-sm text-fg-secondary">Secondary text for descriptions and table cells. · 13</p>
            <p className="text-xs text-fg-tertiary">Captions, timestamps and helper text. · 12</p>
            <p className="mt-2 tabular text-2xl font-semibold tracking-tighter">{formatMoney('1234567.5')}</p>
          </div>
        </Section>

        <Section
          title="Buttons"
          description="One primary action per view. Icon-only buttons always have a label."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">
                <Plus /> New purchase order
              </Button>
              <Button variant="secondary">
                <Download /> Export
              </Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">
                <Trash2 /> Delete
              </Button>
              <Button variant="link">View all</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm">
                Small
              </Button>
              <Button variant="primary">Medium</Button>
              <Button variant="primary" size="lg">
                Large
              </Button>
              <Button variant="primary" loading>
                Saving
              </Button>
              <Button variant="secondary" disabled>
                Disabled
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="Filter">
                <Filter strokeWidth={1.75} />
              </IconButton>
              <IconButton label="Search">
                <Search strokeWidth={1.75} />
              </IconButton>
              <IconButton label="More actions">
                <MoreHorizontal strokeWidth={1.75} />
              </IconButton>
              <Spinner className="ml-2 text-fg-tertiary" label="Loading" />
            </div>
          </div>
        </Section>

        <Section title="Form controls" description="Inline validation, clear focus rings, sensible defaults.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Supplier email" hint="Purchase orders are sent here.">
              <Input leading={<Mail strokeWidth={1.75} />} placeholder="orders@supplier.example" />
            </Field>
            <Field label="Reorder point" error="Must be at least the safety stock (40).">
              <Input defaultValue="25" inputMode="numeric" />
            </Field>
            <Field label="Warehouse">
              <Select
                defaultValue="CHN"
                options={[
                  { value: 'CHN', label: 'Chennai Central DC' },
                  { value: 'CBE', label: 'Coimbatore DC' },
                  { value: 'MDU', label: 'Madurai DC' },
                ]}
              />
            </Field>
            <Field label="Unit cost">
              <Input leading={<IndianRupee strokeWidth={1.75} />} defaultValue="134.00" className="tabular" />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <Textarea placeholder="Reason for the adjustment…" rows={2} />
            </Field>
            <ToggleRow
              label="Track expiry dates"
              control={(id) => (
                <Checkbox id={id} checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
              )}
            />
            <ToggleRow
              label="Agents may act automatically"
              control={(id) => <Switch id={id} defaultChecked />}
            />
            <SegmentedControl
              aria-label="Range"
              value={segment}
              onValueChange={setSegment}
              options={[
                { value: '7', label: '7D' },
                { value: '30', label: '30D' },
                { value: '90', label: '90D' },
              ]}
            />
          </div>
        </Section>

        <Section
          title="Status and AI"
          description="Status pills for record states; one consistent marker for AI-written content."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <StatusPill tone="neutral">Draft</StatusPill>
              <StatusPill tone="accent">Sent</StatusPill>
              <StatusPill tone="warning">Pending approval</StatusPill>
              <StatusPill tone="success">Received</StatusPill>
              <StatusPill tone="danger">Out of stock</StatusPill>
              <StatusPill tone="accent" pulse>
                Running
              </StatusPill>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Perishable</Badge>
              <Badge tone="accent">Class A</Badge>
              <Badge tone="success">+12.4%</Badge>
              <Badge tone="warning">Expires in 3 days</Badge>
              <Badge tone="danger">Overdue</Badge>
              <Badge tone="outline">Festive</Badge>
            </div>
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <AiMarker model="qwen3:8b" />
                <span className="text-xs text-fg-tertiary">Stock Sentinel · 2 min ago</span>
              </div>
              <p className="mt-2 text-sm">
                Fortune Sunlite Sunflower Oil 1 L is out of stock in Chennai. Purchase order PO-2026-03609 is
                5 days overdue; ordering 440 units from Sunrise Wholesale (2-day lead time) would restore
                cover before the weekend.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <AiMarker source="rule" />
              </div>
            </Card>
          </div>
        </Section>

        <Section
          title="Cards and KPIs"
          description="Figures count up gently; deltas say what they’re compared with."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <KpiCard
              label="Inventory value"
              icon={<IndianRupee strokeWidth={1.75} />}
              value={5055894}
              format={(v) => formatMoney(v, { compact: true })}
              delta={-0.032}
              deltaLabel="vs 30 days ago"
              goodDirection="neutral"
              trend={EXAMPLE_TREND.map((t) => t.average)}
            />
            <KpiCard
              label="Revenue · 30 days"
              icon={<TrendingUp strokeWidth={1.75} />}
              value={11129826}
              format={(v) => formatMoney(v, { compact: true })}
              delta={0.084}
              deltaLabel="vs prior 30 days"
              trend={EXAMPLE_TREND.map((t) => t.revenue)}
            />
            <Card className="sm:col-span-2">
              <CardHeader>
                <div>
                  <CardTitle>Card title</CardTitle>
                  <CardDescription>One-line description of what this card shows.</CardDescription>
                </div>
                <Button size="sm" variant="ghost">
                  View all
                </Button>
              </CardHeader>
              <CardContent className="text-sm text-fg-secondary">
                Content sits on a white card with a hairline border and generous padding.
              </CardContent>
              <CardFooter className="justify-end">
                <Button size="sm">Secondary</Button>
                <Button size="sm" variant="primary">
                  Primary
                </Button>
              </CardFooter>
            </Card>
          </div>
        </Section>

        <Section title="Table" description="Sticky header, right-aligned numbers, status pills, row hover.">
          <Card className="overflow-hidden">
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH numeric>On hand</TH>
                  <TH numeric>Value</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {EXAMPLE_ROWS.map((r) => (
                  <TR key={r.sku} interactive>
                    <TD>
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-fg-tertiary">{r.sku}</p>
                    </TD>
                    <TD numeric>{formatNumber(r.stock)}</TD>
                    <TD numeric>{formatMoney(r.value)}</TD>
                    <TD>
                      <StatusPill
                        tone={r.status === 'In stock' ? 'success' : r.status === 'Low' ? 'warning' : 'danger'}
                      >
                        {r.status}
                      </StatusPill>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </Section>

        <Section title="Tabs" description="For sections of one record, like a product’s detail page.">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="movements">Movements</TabsTrigger>
              <TabsTrigger value="insights">AI insights</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-sm text-fg-secondary">
              Each tab loads its own data.
            </TabsContent>
            <TabsContent value="stock" className="text-sm text-fg-secondary">
              Stock by warehouse.
            </TabsContent>
            <TabsContent value="movements" className="text-sm text-fg-secondary">
              The ledger for this product.
            </TabsContent>
            <TabsContent value="insights" className="text-sm text-fg-secondary">
              Agent findings for this product.
            </TabsContent>
          </Tabs>
        </Section>

        <Section
          title="Charts"
          description="Minimal gridlines, muted axes, the accent plus neutrals. Example data."
        >
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <TrendChart
                ariaLabel="Example revenue trend"
                data={EXAMPLE_TREND}
                xKey="date"
                series={[
                  { key: 'revenue', label: 'Revenue' },
                  { key: 'average', label: 'Trend', color: 'var(--chart-3)', dashed: true },
                ]}
                formatValue={(v) => formatMoney(v, { compactDecimals: true })}
                formatAxis={(v) => formatMoney(v, { compact: true })}
                formatTick={(d) => d.slice(8)}
                height={200}
              />
            </Card>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card className="p-4">
                <BarsChart
                  ariaLabel="Example value by category"
                  data={EXAMPLE_BARS}
                  xKey="name"
                  layout="vertical"
                  series={[{ key: 'value', label: 'Value' }]}
                  formatValue={(v) => formatMoney(v, { compactDecimals: true })}
                  formatAxis={(v) => formatMoney(v, { compact: true })}
                  height={180}
                />
              </Card>
              <Card className="flex items-center justify-center gap-4 p-4">
                <DonutChart
                  ariaLabel="Example category mix"
                  data={EXAMPLE_BARS.map((b) => ({ label: b.name, value: b.value }))}
                  centerValue="₹31.9L"
                  centerLabel="Total"
                  size={150}
                />
                <div className="w-24">
                  <Sparkline values={EXAMPLE_TREND.map((t) => t.revenue)} />
                </div>
              </Card>
            </div>
          </div>
        </Section>

        <Section title="Loading, empty and error" description="Every data view designs all three states.">
          <div className="grid grid-cols-1 gap-4">
            <Card className="flex flex-col gap-3 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </Card>
            <Card>
              <EmptyState
                compact
                icon={<PackageSearch strokeWidth={1.75} />}
                title="No products match these filters"
                description="Try removing a filter or searching by SKU."
                action={<Button size="sm">Clear filters</Button>}
              />
            </Card>
            <Card>
              <ErrorState
                compact
                error={
                  new ApiError(
                    503,
                    'DB_UNAVAILABLE',
                    'Can’t reach PostgreSQL at 127.0.0.1:5432 — is the service running?',
                  )
                }
                onRetry={() => toast('Retrying…')}
              />
            </Card>
          </div>
        </Section>

        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Overlays and feedback</h3>
            <p className="text-sm text-fg-secondary">
              Dialogs, sheets, menus, tooltips and toasts. These follow the app theme.
            </p>
          </div>
          <Card className="flex flex-wrap items-center gap-2 p-5">
            <Dialog>
              <DialogTrigger asChild>
                <Button>Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Receive stock</DialogTitle>
                  <DialogDescription>Record goods arriving at a warehouse.</DialogDescription>
                </DialogHeader>
                <DialogBody className="flex flex-col gap-4">
                  <Field label="Quantity">
                    <Input inputMode="numeric" defaultValue="120" />
                  </Field>
                </DialogBody>
                <DialogFooter>
                  <Button>Cancel</Button>
                  <Button variant="primary">Receive</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Sheet>
              <SheetTrigger asChild>
                <Button>Open sheet</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Fortune Sunlite Refined Sunflower Oil 1 L pouch</SheetTitle>
                  <SheetDescription>OIL-OIL-001 · Edible Oils & Ghee</SheetDescription>
                </SheetHeader>
                <SheetBody>
                  <p className="text-sm text-fg-secondary">
                    Quick views and short forms open in a sheet, keeping the list in place.
                  </p>
                </SheetBody>
                <SheetFooter>
                  <Button variant="primary">Open product</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>

            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Confirm dialog
            </Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Cancel this purchase order?"
              description="The supplier will need to be told separately. This can’t be undone."
              confirmLabel="Cancel order"
              tone="danger"
              onConfirm={() => {
                setConfirmOpen(false);
                toast.success('Purchase order cancelled');
              }}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>
                  Menu <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem shortcut="E">Edit</DropdownMenuItem>
                <DropdownMenuItem shortcut="D">Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Popover>
              <PopoverTrigger asChild>
                <Button>Popover</Button>
              </PopoverTrigger>
              <PopoverContent>
                <p className="text-sm font-medium">Days of cover</p>
                <p className="mt-1 text-sm text-fg-secondary">
                  Available stock divided by forecast daily demand.
                </p>
              </PopoverContent>
            </Popover>

            <Tooltip content="Tooltips explain icons and terms">
              <Button variant="ghost">Hover me</Button>
            </Tooltip>

            <Button
              onClick={() =>
                toast.success('Purchase order approved', {
                  description: 'PO-2026-03640 · ₹48,210.00',
                  action: { label: 'Undo', onClick: () => toast('Approval undone') },
                })
              }
            >
              Toast with undo
            </Button>
            <Button
              onClick={() =>
                toast.error('Couldn’t reach Ollama', { description: 'Start Ollama, then try again.' })
              }
            >
              Error toast
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Avatar name="Shaheer" />
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </div>
          </Card>
        </section>

        <p className={cn('text-center text-sm text-fg-tertiary')}>
          <Inbox className="mr-1 inline size-4 align-[-3px]" strokeWidth={1.75} />
          Icons: Lucide at a 1.75 stroke, 16–20 px.
        </p>
      </div>
    </Page>
  );
}
