import { Document, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { APP_NAME, formatNumber, PO_STATUS_LABELS } from '@stockroom/shared';
import type { PurchaseOrderService } from '../../services/purchase-order.service';
import { registerPdfFonts } from './fonts';

type PoPdfData = Awaited<ReturnType<PurchaseOrderService['forPdf']>>;

// Matches the app's neutral palette: near-black text, grey secondary text, hairline rules.
const ink = '#1d1d1f';
const muted = '#6e6e73';
const hairline = '#d2d2d7';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    color: ink,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  org: { fontSize: 13, fontWeight: 600 },
  title: { fontSize: 20, fontWeight: 600, letterSpacing: -0.3, textAlign: 'right' },
  muted: { color: muted },
  meta: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  box: { flex: 1, borderWidth: 0.5, borderColor: hairline, borderRadius: 6, padding: 10 },
  label: { fontSize: 7.5, color: muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  strong: { fontWeight: 600 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: hairline, paddingVertical: 6 },
  headRow: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: ink, paddingBottom: 5 },
  th: { fontSize: 7.5, color: muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  num: { textAlign: 'right' },
  totals: { marginTop: 12, marginLeft: 'auto', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grand: {
    borderTopWidth: 0.75,
    borderTopColor: ink,
    marginTop: 4,
    paddingTop: 6,
    fontSize: 11,
    fontWeight: 600,
  },
  notes: { marginTop: 24 },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: muted,
  },
});

const cols = { n: 18, sku: 70, product: 0, qty: 50, unit: 28, cost: 62, tax: 36, total: 72 } as const;
const col = (width: number) => (width ? { width } : { flex: 1 });
const amount = (v: { toString(): string }) => formatNumber(v.toString(), { decimals: 2 });
const date = (d: Date | null | undefined) =>
  d
    ? d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
      })
    : '—';

function PurchaseOrderDocument({ data }: { data: PoPdfData }) {
  const { po, warehouse, organization, supplierSkus } = data;
  const org = organization?.name ?? APP_NAME;
  return (
    <Document
      title={`${po.number} — ${po.supplier.name}`}
      author={org}
      creator={APP_NAME}
      producer={APP_NAME}
    >
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.org}>{organization?.legalName ?? org}</Text>
            {organization?.address ? <Text style={s.muted}>{organization.address}</Text> : null}
            {organization?.gstin ? <Text style={s.muted}>GSTIN {organization.gstin}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>Purchase order</Text>
            <Text style={[s.strong, s.num]}>{po.number}</Text>
            <Text style={[s.muted, s.num]}>{PO_STATUS_LABELS[po.status]}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.box}>
            <Text style={s.label}>Supplier</Text>
            <Text style={s.strong}>{po.supplier.name}</Text>
            {po.supplier.contactName ? <Text>{po.supplier.contactName}</Text> : null}
            {po.supplier.address ? <Text style={s.muted}>{po.supplier.address}</Text> : null}
            {po.supplier.city && !po.supplier.address ? (
              <Text style={s.muted}>{po.supplier.city}</Text>
            ) : null}
            {po.supplier.gstin ? <Text style={s.muted}>GSTIN {po.supplier.gstin}</Text> : null}
            {po.supplier.email || po.supplier.phone ? (
              <Text style={s.muted}>
                {[po.supplier.email, po.supplier.phone].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Deliver to</Text>
            <Text style={s.strong}>{warehouse ? `${warehouse.name} (${warehouse.code})` : '—'}</Text>
            {warehouse?.address ? (
              <Text style={s.muted}>{warehouse.address}</Text>
            ) : warehouse ? (
              <Text style={s.muted}>{warehouse.city}</Text>
            ) : null}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Order date</Text>
            <Text>{date(po.orderDate)}</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Expected delivery</Text>
            <Text>{date(po.expectedDate)}</Text>
            <Text style={[s.label, { marginTop: 6 }]}>Payment terms</Text>
            <Text>{po.supplier.paymentTermsDays} days</Text>
          </View>
        </View>

        <View style={s.headRow} fixed>
          <Text style={[s.th, col(cols.n)]}>#</Text>
          <Text style={[s.th, col(cols.sku)]}>SKU</Text>
          <Text style={[s.th, col(cols.product)]}>Product</Text>
          <Text style={[s.th, s.num, col(cols.qty)]}>Qty</Text>
          <Text style={[s.th, col(cols.unit), { paddingLeft: 4 }]}>Unit</Text>
          <Text style={[s.th, s.num, col(cols.cost)]}>Unit cost</Text>
          <Text style={[s.th, s.num, col(cols.tax)]}>GST</Text>
          <Text style={[s.th, s.num, col(cols.total)]}>Amount</Text>
        </View>
        {po.lines.map((line, i) => {
          const supplierSku = supplierSkus.get(line.productId);
          return (
            <View key={line.id} style={s.row} wrap={false}>
              <Text style={[col(cols.n), s.muted]}>{i + 1}</Text>
              <Text style={col(cols.sku)}>{line.product.sku}</Text>
              <View style={col(cols.product)}>
                <Text>{line.product.name}</Text>
                {supplierSku ? <Text style={s.muted}>Supplier SKU {supplierSku}</Text> : null}
              </View>
              <Text style={[s.num, col(cols.qty)]}>{formatNumber(line.quantityOrdered)}</Text>
              <Text style={[col(cols.unit), s.muted, { paddingLeft: 4 }]}>{line.product.unit.code}</Text>
              <Text style={[s.num, col(cols.cost)]}>{amount(line.unitCost)}</Text>
              <Text style={[s.num, col(cols.tax), s.muted]}>
                {formatNumber(line.taxRate.toString(), { decimals: 0 })}%
              </Text>
              <Text style={[s.num, col(cols.total)]}>{amount(line.lineTotal)}</Text>
            </View>
          );
        })}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text style={s.muted}>Subtotal</Text>
            <Text>{amount(po.subtotal)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text style={s.muted}>GST</Text>
            <Text>{amount(po.taxTotal)}</Text>
          </View>
          <View style={[s.totalRow, s.grand]}>
            <Text>Total (INR)</Text>
            <Text>{amount(po.total)}</Text>
          </View>
        </View>

        {po.notes ? (
          <View style={s.notes} wrap={false}>
            <Text style={s.label}>Notes</Text>
            <Text>{po.notes}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <Text>{po.number} · All amounts in Indian rupees (INR)</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderPurchaseOrderPdf(data: PoPdfData): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<PurchaseOrderDocument data={data} />);
}
