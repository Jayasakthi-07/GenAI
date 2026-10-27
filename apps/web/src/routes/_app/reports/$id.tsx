import { REPORT_TYPE_LABELS } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronLeft, Download, FileSpreadsheet, Printer } from 'lucide-react';
import { useState } from 'react';
import { PageLoading } from '@/components/feedback/page-loading';
import { ErrorState } from '@/components/feedback/states';
import { Page, PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { reportQuery } from '@/features/reports/api';
import { ReportBody } from '@/features/reports/report-view';
import { downloadFile, openInNewTab } from '@/lib/download';
import { dateTime } from '@/lib/format';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/reports/$id')({
  staticData: { title: 'Report' },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(reportQuery(params.id)).catch(() => undefined),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useParams();
  const q = useQuery(reportQuery(id));
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);

  if (q.isPending) return <PageLoading />;
  if (q.isError)
    return (
      <Page>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn’t open this report" />
        </Card>
      </Page>
    );
  const r = q.data;
  const download = (kind: 'pdf' | 'csv') => {
    setBusy(kind);
    downloadFile(`/reports/${r.id}/${kind}`, kind === 'pdf' ? { download: 1 } : {})
      .catch((e: unknown) => reportError(e, undefined, 'Couldn’t download the report'))
      .finally(() => setBusy(null));
  };

  return (
    <Page className="max-w-6xl">
      <PageHeader
        eyebrow={
          <Link to="/reports" className="inline-flex items-center gap-1 hover:text-fg">
            <ChevronLeft className="size-4" strokeWidth={1.75} /> Reports
          </Link>
        }
        title={r.title}
        description={`${REPORT_TYPE_LABELS[r.type]} · covers ${dateTime(r.periodStart)} to ${dateTime(r.periodEnd)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => openInNewTab(`/reports/${r.id}/pdf`)}>
              <Printer strokeWidth={1.75} /> Print
            </Button>
            <Button variant="secondary" loading={busy === 'pdf'} onClick={() => download('pdf')}>
              <Download strokeWidth={1.75} /> PDF
            </Button>
            <Button variant="secondary" loading={busy === 'csv'} onClick={() => download('csv')}>
              <FileSpreadsheet strokeWidth={1.75} /> CSV
            </Button>
          </>
        }
      />
      <ReportBody report={r} />
      {r.runId && (
        <p className="mt-4 px-1 text-sm text-fg-tertiary">
          Written {dateTime(r.createdAt)} by the Report Writer.{' '}
          <Link to="/agents/runs/$id" params={{ id: r.runId }} className="text-accent-text hover:underline">
            See how
          </Link>
        </p>
      )}
    </Page>
  );
}
