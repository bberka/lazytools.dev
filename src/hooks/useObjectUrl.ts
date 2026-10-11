import { useEffect, useState } from 'react';

/**
 * An object URL for a Blob or File that backs something on screen, such as
 * an `<img src>`. The URL is created when `source` is set and revoked when
 * `source` is replaced, cleared, or the component unmounts, so the tool has
 * nothing to clean up.
 *
 * Returns null until the first URL exists, which is one render after `source`
 * is set. When `source` is replaced, the previous URL is returned for that one
 * render so an image already on screen does not blank out. Pass a Blob that
 * keeps its identity between renders (from state or a memo), not one built
 * inline.
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

  // While a new source waits for its URL, the entry still holds the previous
  // one. It is revoked right after this render, which does not unload an image
  // that has already been decoded.
  return source && entry ? entry.url : null;
}
