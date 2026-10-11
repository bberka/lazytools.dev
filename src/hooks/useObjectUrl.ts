import { useEffect, useState } from 'react';

/**
 * An object URL for a Blob or File that backs something on screen, such as
 * an `<img src>`. The URL is created when `source` is set and revoked when
 * `source` is replaced, cleared, or the component unmounts, so the tool has
 * nothing to clean up.
 *
 * Returns null until the URL exists, which is one render after `source`
 * changes. Pass a Blob that keeps its identity between renders (from state or
 * a memo), not one built inline.
 */
export function useObjectUrl(source: Blob | null | undefined): string | null {
  const [entry, setEntry] = useState<{ source: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!source) return;

    const url = URL.createObjectURL(source);
    // The URL cannot exist before this effect runs, so state is the only way
    // to get it into the render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntry({ source, url });

    return () => {
      URL.revokeObjectURL(url);
      setEntry((current) => (current?.url === url ? null : current));
    };
  }, [source]);

  // An entry made for an earlier source points at a URL that is about to be
  // revoked, so it is never handed out.
  return entry && entry.source === source ? entry.url : null;
}
