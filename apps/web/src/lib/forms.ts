import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from './api';

/**
 * Shows a failed mutation to the user: field errors go onto the form (when one is given),
 * everything else becomes a toast with the server's actionable message.
 */
export function reportError<T extends FieldValues>(
  error: unknown,
  form?: UseFormReturn<T>,
  title = 'Couldn’t save',
) {
  if (error instanceof ApiError) {
    const fields = Object.entries(error.fields);
    if (form && fields.length) {
      for (const [name, message] of fields) form.setError(name as Path<T>, { type: 'server', message });
    }
    if (!form || !fields.length || error.code !== 'VALIDATION_ERROR') {
      toast.error(title, { description: error.message });
    }
    return;
  }
  toast.error(title, { description: error instanceof Error ? error.message : 'Something went wrong.' });
}

/** Reads a File as a data URL (for image uploads). */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Couldn’t read the file'));
    reader.readAsDataURL(file);
  });
}

export function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Couldn’t read the file'));
    reader.readAsText(file);
  });
}
