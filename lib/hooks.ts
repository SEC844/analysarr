'use client';

import { useState, useEffect } from 'react';

export type PosterSize = 'sm' | 'md' | 'lg';

export function usePosterSize(): [PosterSize, (s: PosterSize) => void] {
  const [size, setSize] = useState<PosterSize>('md');

  useEffect(() => {
    const stored = localStorage.getItem('posterSize') as PosterSize | null;
    if (stored === 'sm' || stored === 'md' || stored === 'lg') setSize(stored);
  }, []);

  const update = (s: PosterSize) => {
    setSize(s);
    localStorage.setItem('posterSize', s);
  };

  return [size, update];
}
