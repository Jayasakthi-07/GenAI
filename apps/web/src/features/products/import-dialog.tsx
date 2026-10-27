import { formatNumber, type ImportPreview, type ImportResult, PRODUCT_CSV_COLUMNS } from '@stockroom/shared';
import { CircleAlert, CircleCheck, FileDown, FileUp, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TD, TH, THead, TR } from '@/components/ui/table';
import { readAsText, reportError } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useCommitImport, usePreviewImport } from './api';

const TEMPLATE = [
  PRODUCT_CSV_COLUMNS.join(','),
  'RIC-NEW-001,Daawat Rozana Super Basmati Rice 10 kg,Staples & Grains > Rice,bag,975,1035,1099,5,,Daawat,,"staple;rice",ACTIVE,false,,4',
  'DAI-NEW-001,Aavin Paneer 200 g,"Dairy & Chilled > Butter, Cheese & Paneer",pack,82,88,92,5,,Aavin,,,ACTIVE,true,12,2',
].join('\r\n');

function downloadTemplate() {
  // BOM so Excel opens the UTF-8 file correctly.
  const blob = new Blob([String.fromCharCode(0xfeff), TEMPLATE, '\r\n'], { type: 'text/csv;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = 'stockroom-products-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 5000);
}

const ACTION_TONES = { create: 'success', update: 'accent', skip: 'neutral', error: 'danger' } as const;
const ACTION_LABELS = { create: 'New', update: 'Update', skip: 'Skip', error: 'Error' } as const;

/** Upload a CSV → check every row on the server → import the valid ones. Nothing is written until the last step. */
export function ImportProductsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<{ name: string; csv: string } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewImport();
  const commit = useCommitImport();

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  const check = (csv: string, update = updateExisting) =>
    previewMutation.mutate(
      { csv, updateExisting: update },
      { onSuccess: setPreview, onError: (e) => reportError(e, undefined, 'Couldn’t read the file') },
    );

  const choose = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv')
      return toast.error('Choose a .csv file', { description: 'Save the sheet as CSV (UTF-8) first.' });
    if (f.size > 5_000_000) return toast.error('That file is over 5 MB');
    const csv = await readAsText(f);
    setFile({ name: f.name, csv });
    setResult(null);
    check(csv);
  };

  const importNow = () => {
    if (!file) return;
    commit.mutate(
      { csv: file.csv, updateExisting },
      {
        onSuccess: (r) => {
          setResult(r);
          toast.success(`Imported ${formatNumber(r.created + r.updated)} products`);
        },
        onError: (e) => reportError(e, undefined, 'Import failed'),
      },
    );
  };

  const importable = preview ? preview.summary.create + preview.summary.update : 0;
  const problems = preview?.rows.filter((r) => r.action === 'error') ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription>
            Add or update products from a CSV file. Rows are checked first; nothing changes until you import.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {result ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
                <CircleCheck className="size-6" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">Import complete</p>
                <p className="mt-1 text-sm text-fg-secondary">
                  {formatNumber(result.created)} added · {formatNumber(result.updated)} updated ·{' '}
                  {formatNumber(result.skipped)} skipped
                  {result.failed ? ` · ${formatNumber(result.failed)} with errors` : ''}
                </p>
              </div>
              {result.errors.length > 0 && <ErrorList rows={result.errors} />}
            </div>
          ) : (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void choose(e.dataTransfer.files[0]);
                }}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border border-dashed border-hairline-strong px-6 py-8 text-center transition-colors',
                  dragging && 'border-accent bg-accent-soft',
                )}
              >
                <FileUp className="size-6 text-fg-tertiary" strokeWidth={1.5} />
                {file ? (
                  <p className="text-sm">
                    <span className="font-medium">{file.name}</span>
                    {preview && (
                      <span className="text-fg-secondary"> · {formatNumber(preview.summary.total)} rows</span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-fg-secondary">Drop a CSV here, or</p>
                )}
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
                    {file ? 'Choose another file' : 'Choose file'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={downloadTemplate}>
                    <FileDown strokeWidth={1.75} /> Template
                  </Button>
                </div>
                <input
                  ref={input}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    void choose(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>

              <label className="flex items-center justify-between gap-4 text-sm">
                <span>
                  <span className="font-medium">Update existing products</span>
                  <span className="block text-fg-secondary">
                    Rows whose SKU already exists replace that product’s details. Off: they’re skipped.
                  </span>
                </span>
                <Switch
                  checked={updateExisting}
                  onCheckedChange={(v) => {
                    setUpdateExisting(v);
                    if (file) check(file.csv, v);
                  }}
                />
              </label>

              {previewMutation.isPending && <p className="text-sm text-fg-secondary">Checking rows…</p>}

              {preview && !previewMutation.isPending && (
                <div className="flex flex-col gap-3">
                  {preview.missingColumns.length > 0 && (
                    <p className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                      Missing required columns: {preview.missingColumns.join(', ')}
                    </p>
                  )}
                  {preview.unknownColumns.length > 0 && (
                    <p className="text-xs text-fg-tertiary">
                      Ignored columns: {preview.unknownColumns.join(', ')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge tone="success">{formatNumber(preview.summary.create)} new</Badge>
                    <Badge tone="accent">{formatNumber(preview.summary.update)} updates</Badge>
                    {preview.summary.skip > 0 && <Badge>{formatNumber(preview.summary.skip)} skipped</Badge>}
                    {preview.summary.error > 0 && (
                      <Badge tone="danger">{formatNumber(preview.summary.error)} with errors</Badge>
                    )}
                  </div>
                  <div className="max-h-72 overflow-auto rounded-md border border-hairline">
                    <table className="w-full border-separate border-spacing-0 text-sm">
                      <THead>
                        <tr>
                          <TH className="w-14">Row</TH>
                          <TH>SKU</TH>
                          <TH>Name</TH>
                          <TH>Result</TH>
                        </tr>
                      </THead>
                      <tbody>
                        {[...problems, ...preview.rows.filter((r) => r.action !== 'error')]
                          .slice(0, 300)
                          .map((r) => (
                            <TR key={r.row}>
                              <TD density="compact" className="tabular text-fg-tertiary">
                                {r.row}
                              </TD>
                              <TD density="compact" className="font-mono text-xs">
                                {r.sku || '—'}
                              </TD>
                              <TD density="compact" className="max-w-56 truncate">
                                {r.name || '—'}
                              </TD>
                              <TD density="compact">
                                <Badge tone={ACTION_TONES[r.action]}>{ACTION_LABELS[r.action]}</Badge>
                                {r.errors.length > 0 && (
                                  <span className="ml-2 text-xs text-danger">{r.errors.join(' · ')}</span>
                                )}
                              </TD>
                            </TR>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {!file && (
                <p className="text-xs text-fg-tertiary">
                  Required columns: sku, name, category, unit, cost_price, selling_price. Categories can be
                  written as a name, a slug, or “Parent &gt; Child”.
                </p>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          {result ? (
            <>
              <Button variant="secondary" onClick={reset}>
                <RotateCcw strokeWidth={1.75} /> Import another file
              </Button>
              <Button variant="primary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!preview || importable === 0 || previewMutation.isPending}
                loading={commit.isPending}
                onClick={importNow}
              >
                {importable
                  ? `Import ${formatNumber(importable)} ${importable === 1 ? 'product' : 'products'}`
                  : 'Import'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ErrorList({ rows }: { rows: Array<{ row: number; sku: string; errors: string[] }> }) {
  return (
    <ul className="max-h-48 w-full overflow-auto rounded-md border border-hairline text-left text-sm">
      {rows.map((r) => (
        <li key={r.row} className="border-b border-hairline px-3 py-2 last:border-b-0">
          <span className="tabular text-fg-tertiary">Row {r.row}</span>{' '}
          <span className="font-mono text-xs">{r.sku}</span>
          <span className="block text-danger">{r.errors.join(' · ')}</span>
        </li>
      ))}
    </ul>
  );
}
