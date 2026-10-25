import { Package } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Product image, or a neutral placeholder when there is none (or it fails to load). */
export function ProductThumb({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        'grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border border-hairline bg-surface-2',
        className,
      )}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Package
          className="size-1/2 text-fg-tertiary"
          strokeWidth={1.5}
          aria-label={name ? undefined : 'No image'}
        />
      )}
    </span>
  );
}
