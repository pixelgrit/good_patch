import { useEffect, useState } from 'react';

export interface About {
  title: string;
  extract: string;
  url: string;
}

let cache: Promise<Record<string, About>> | null = null;

/** The Wikipedia summary for a locality, loaded once on first use. */
export function useAbout(code: string): About | null {
  const [all, setAll] = useState<Record<string, About> | null>(null);
  useEffect(() => {
    cache ??= fetch(`${import.meta.env.BASE_URL}data/about.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    let live = true;
    cache.then((a) => live && setAll(a));
    return () => {
      live = false;
    };
  }, []);
  return all?.[code] ?? null;
}
