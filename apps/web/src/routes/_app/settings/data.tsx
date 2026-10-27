import { type SettingsBackup, type SettingsImportResult, settingsBackupSchema } from '@stockroom/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Download, FileJson, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImportProductsDialog } from '@/features/products/import-dialog';
import { exportSettings, simulationQuery, useImportSettings } from '@/features/simulation/api';
import { ResetDemoButton } from '@/features/simulation/reset-demo';
import { systemInfoQueryOptions, useCan } from '@/lib/auth';
import { downloadFile } from '@/lib/download';
import { date } from '@/lib/format';
import { reportError } from '@/lib/forms';

export const Route = createFileRoute('/_app/settings/data')({
  staticData: { title: 'Import & export' },
  component: DataSettings,
});

const SECTION_LABELS = { organization: 'Organization', agents: 'Agents', routing: 'AI routing' } as const;

function saveJson(name: string, value: unknown) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function RestoreDialog({
  backup,
  preview,
  onClose,
}: {
  backup: SettingsBackup;
  preview: SettingsImportResult;
  onClose: () => void;
}) {
  const restore = useImportSettings();
  return (
    <Dialog open onOpenChange={(o) => !o && !restore.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restore settings from {date(backup.exportedAt)}?</DialogTitle>
          <DialogDescription>
            {preview.changes.length
              ? `${preview.changes.length} ${preview.changes.length === 1 ? 'setting differs' : 'settings differ'} from what’s set now.`
              : 'This backup matches the current settings; there’s nothing to restore.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {preview.changes.length > 0 && (
            <ul className="max-h-72 divide-y divide-hairline overflow-y-auto rounded-lg border border-hairline text-sm">
              {preview.changes.map((c, i) => (
                <li key={i} className="flex gap-3 px-3 py-2">
                  <span className="w-24 shrink-0 text-fg-tertiary">{SECTION_LABELS[c.section]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{c.item}</span>
                    <span className="block break-words text-fg-secondary">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {preview.warnings.map((w) => (
            <p key={w} className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
              {w}
            </p>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={restore.isPending}>
            {preview.changes.length ? 'Cancel' : 'Close'}
          </Button>
          {preview.changes.length > 0 && (
            <Button
              loading={restore.isPending}
              onClick={() =>
                restore.mutate(
                  { backup, apply: true },
                  {
                    onSuccess: (r) => {
                      toast.success('Settings restored', {
                        description: `${r.changes.length} ${r.changes.length === 1 ? 'change' : 'changes'} applied and recorded in the audit log.`,
                      });
                      onClose();
                    },
                    onError: (e) => reportError(e, undefined, 'Couldn’t restore the settings'),
                  },
                )
              }
            >
              Restore
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DataSettings() {
  const can = useCan();
  const info = useQuery(systemInfoQueryOptions);
  const sim = useQuery({ ...simulationQuery, enabled: info.data?.demoMode === true });
  const preview = useImportSettings();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pending, setPending] = useState<{ backup: SettingsBackup; preview: SettingsImportResult } | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);

  const exportProducts = (format: 'csv' | 'xlsx') =>
    toast.promise(downloadFile('/products/export', { format }), {
      loading: 'Preparing the export…',
      success: 'Products exported',
      error: (e: unknown) => (e instanceof Error ? e.message : 'Export failed'),
    });

  const readBackup = async (file: File) => {
    let backup: SettingsBackup;
    try {
      const parsed = settingsBackupSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error('bad shape');
      backup = parsed.data;
    } catch {
      toast.error('That file isn’t a Stockroom settings backup', {
        description: 'Choose a .json file made with “Download backup”.',
      });
      return;
    }
    preview.mutate(
      { backup, apply: false },
      {
        onSuccess: (r) => setPending({ backup, preview: r }),
        onError: (e) => reportError(e, undefined, 'Couldn’t read the backup'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Products</CardTitle>
            <CardDescription>
              Bring in a catalog from a spreadsheet, or take the full product list with stock and prices.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {can('catalog.manage') && (
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload strokeWidth={1.75} /> Import CSV
            </Button>
          )}
          <Button variant="secondary" onClick={() => exportProducts('csv')}>
            <FileText strokeWidth={1.75} /> Export CSV
          </Button>
          <Button variant="secondary" onClick={() => exportProducts('xlsx')}>
            <FileSpreadsheet strokeWidth={1.75} /> Export Excel
          </Button>
        </CardContent>
      </Card>

      {can('organization.manage') && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Settings backup</CardTitle>
              <CardDescription>
                Organization settings, agent configuration and model routing in one file, to copy a setup to
                another machine or keep a known-good state. It never includes API keys, users or inventory
                data.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={exporting}
              onClick={() => {
                setExporting(true);
                exportSettings()
                  .then((b) => saveJson(`stockroom-settings-${b.exportedAt.slice(0, 10)}.json`, b))
                  .catch((e: unknown) => reportError(e, undefined, 'Couldn’t export the settings'))
                  .finally(() => setExporting(false));
              }}
            >
              <Download strokeWidth={1.75} /> Download backup
            </Button>
            <Button
              variant="secondary"
              loading={preview.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <FileJson strokeWidth={1.75} /> Restore from file…
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void readBackup(f);
              }}
            />
          </CardContent>
        </Card>
      )}

      {info.data?.demoMode && can('demo.reset') && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Demo data</CardTitle>
              <CardDescription>
                Replace everything with a fresh, deterministic 18 months of history ending yesterday: the same
                products, suppliers and planted situations every time. AI providers, routing and agent
                settings are kept.
                {sim.data?.lastSalesDay && ` The current history ends on ${date(sim.data.lastSalesDay)}.`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ResetDemoButton variant="danger" />
          </CardContent>
        </Card>
      )}

      <ImportProductsDialog open={importOpen} onOpenChange={setImportOpen} />
      {pending && <RestoreDialog {...pending} onClose={() => setPending(null)} />}
    </div>
  );
}
