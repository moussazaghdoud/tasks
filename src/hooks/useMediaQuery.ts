import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
  );
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsWide = () => useMediaQuery('(min-width: 1280px)');
export const isCoarsePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
