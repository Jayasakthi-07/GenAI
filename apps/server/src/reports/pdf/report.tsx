import { Document, Page, renderToBuffer, StyleSheet, Text, View } from '@react-pdf/renderer';
import { APP_NAME, type ReportDto, REPORT_TYPE_LABELS } from '@stockroom/shared';
import { registerPdfFonts } from './fonts';

const ink = '#1d1d1f';
const muted = '#6e6e73';
const hairline = '#d2d2d7';
const good = '#248a3d';
const bad = '#c9302c';

const s = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9.5,
    color: ink,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
  },
  eyebrow: { fontSize: 8, color: muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 18, fontWeight: 600, letterSpacing: -0.3, marginTop: 4 },
  sub: { color: muted, marginTop: 3 },
  kpis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    borderTopWidth: 0.5,
    borderLeftWidth: 0.5,
    borderColor: hairline,
  },
  kpi: { width: '25%', padding: 9, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: hairline },
  kpiLabel: { fontSize: 7.5, color: muted },
  kpiValue: { fontSize: 12, fontWeight: 600, marginTop: 3 },
  kpiChange: { fontSize: 7.5, marginTop: 2 },
  section: { marginTop: 18 },
  h: { fontSize: 10.5, fontWeight: 600, marginBottom: 6 },
  para: { lineHeight: 1.35, marginBottom: 6 },
  bullet: { flexDirection: 'row', marginBottom: 3, lineHeight: 1.3 },
  dot: { width: 10, color: muted },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: hairline, paddingVertical: 5 },
  head: { flexDirection: 'row', borderBottomWidth: 0.75, borderBottomColor: ink, paddingBottom: 4 },
  th: { fontSize: 7.5, color: muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  num: { textAlign: 'right' },
  source: { marginTop: 4, fontSize: 7.5, color: muted },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: muted,
  },
});

/** The bundled Inter subset has no ₹ glyph, so amounts read "INR" in print. */
const t = (text: string) => text.replace(/₹\s?/g, 'INR ');
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

function Narrative({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p, i) => {
          const lines = p.split('\n');
          if (lines.every((l) => /^\s*[-*•]\s+/.test(l) || !l.trim()))
            return (
              <View key={i} style={{ marginBottom: 6 }}>
                {lines
                  .filter((l) => l.trim())
                  .map((l, j) => (
                    <View key={j} style={s.bullet}>
                      <Text style={s.dot}>•</Text>
                      <Text style={{ flex: 1 }}>{t(l.replace(/^\s*[-*•]\s+/, '').replace(/\*\*/g, ''))}</Text>
                    </View>
                  ))}
              </View>
            );
          return (
            <Text key={i} style={s.para}>
              {t(p.replace(/\*\*/g, '').replace(/\n/g, ' '))}
            </Text>
          );
        })}
    </>
  );
}

function ReportDocument({ report: r, organization }: { report: ReportDto; organization: string }) {
  const c = r.content;
  return (
    <Document title={r.title} author={organization} creator={APP_NAME} producer={APP_NAME}>
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>
          {organization} · {REPORT_TYPE_LABELS[r.type]}
        </Text>
        <Text style={s.title}>{r.title}</Text>
        <Text style={s.sub}>
          {when(r.periodStart)} – {when(r.periodEnd)}
        </Text>

        <View style={s.kpis}>
          {c.kpis.map((k) => (
            <View key={k.key} style={s.kpi}>
              <Text style={s.kpiLabel}>{k.label}</Text>
              <Text style={s.kpiValue}>{t(k.value)}</Text>
              {k.change && (
                <Text
                  style={[s.kpiChange, { color: k.tone === 'good' ? good : k.tone === 'bad' ? bad : muted }]}
                >
                  {t(k.change)}
                </Text>
              )}
            </View>
          ))}
        </View>

        <View style={s.section}>
          <Text style={s.h}>Briefing</Text>
          <Narrative text={c.narrative} />
          <Text style={s.source}>
            {r.narrativeSource === 'AI'
              ? `Written by AI${r.modelUsed ? ` · ${r.modelUsed}` : ''}, from the figures in this report.`
              : 'Rule-based — AI unavailable. Generated from the figures in this report.'}
          </Text>
        </View>

        {c.changes.length > 0 && (
          <View style={s.section}>
            <Text style={s.h}>What changed</Text>
            {c.changes.map((line, i) => (
              <View key={i} style={s.bullet}>
                <Text style={s.dot}>•</Text>
                <Text style={{ flex: 1 }}>{t(line)}</Text>
              </View>
            ))}
          </View>
        )}

        {c.risks.length > 0 && (
          <View style={s.section}>
            <Text style={s.h} minPresenceAhead={40}>
              Most urgent
            </Text>
            {c.risks.map((risk, i) => (
              <View key={i} style={s.row} wrap={false}>
                <Text
                  style={{
                    width: 62,
                    fontWeight: 600,
                    color: risk.severity === 'CRITICAL' || risk.severity === 'HIGH' ? bad : ink,
                  }}
                >
                  {risk.severity.charAt(0) + risk.severity.slice(1).toLowerCase()}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: 600 }}>{t(risk.title)}</Text>
                  <Text style={{ color: muted, marginTop: 1 }}>{t(risk.detail)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {c.agentActivity.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h}>What the agents did</Text>
            <View style={s.head}>
              <Text style={[s.th, { flex: 1 }]}>Agent</Text>
              <Text style={[s.th, s.num, { width: 50 }]}>Runs</Text>
              <Text style={[s.th, s.num, { width: 50 }]}>With AI</Text>
              <Text style={[s.th, s.num, { width: 62 }]}>Proposals</Text>
              <Text style={[s.th, s.num, { width: 58 }]}>Executed</Text>
              <Text style={[s.th, s.num, { width: 58 }]}>Rejected</Text>
            </View>
            {c.agentActivity.map((a) => (
              <View key={a.agentKey} style={s.row}>
                <Text style={{ flex: 1 }}>{a.agent}</Text>
                <Text style={[s.num, { width: 50 }]}>{a.runs}</Text>
                <Text style={[s.num, { width: 50 }]}>{a.aiRuns}</Text>
                <Text style={[s.num, { width: 62 }]}>{a.proposals}</Text>
                <Text style={[s.num, { width: 58 }]}>{a.executed}</Text>
                <Text style={[s.num, { width: 58 }]}>{a.rejected}</Text>
              </View>
            ))}
          </View>
        )}

        {c.pendingDecisions.length > 0 && (
          <View style={s.section}>
            <Text style={s.h}>Waiting for your decision</Text>
            {c.pendingDecisions.map((p) => (
              <View key={p.id} style={s.row}>
                <Text style={{ width: 120, color: muted }}>{p.agent}</Text>
                <View style={{ flex: 1 }} wrap={false}>
                  <Text style={{ fontWeight: 600 }}>{t(p.title)}</Text>
                  <Text style={{ color: muted, marginTop: 1 }}>{t(p.summary)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            {APP_NAME} · generated {when(r.createdAt)}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReportPdf(report: ReportDto, organization: string): Promise<Buffer> {
  registerPdfFonts();
  return renderToBuffer(<ReportDocument report={report} organization={organization} />);
}
