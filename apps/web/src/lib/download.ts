import { API_PREFIX } from '@stockroom/shared';
import { ApiError } from './api';

/**
 * Downloads a file from the API (CSV, Excel, PDF) through fetch so errors surface as toasts
 * instead of a blank tab, then hands it to the browser with the server's filename.
 */
export async function downloadFile(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
  const url = `${API_PREFIX}${path}${params.size ? `?${params.toString()}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, { credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Can’t reach the Stockroom server. Is it running?');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, 'INTERNAL', body?.error?.message ?? `Download failed (${res.status})`);
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'download';
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Opens an API-served PDF in a new tab for viewing and printing. */
export function openInNewTab(path: string) {
  window.open(`${API_PREFIX}${path}`, '_blank', 'noopener');
}
