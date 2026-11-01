import type { Night, ReadNight } from './types.js';

// Stub until #2 lands, so § 2 can import against the real path.
export const readNight: ReadNight = (_runsDir: string, _night: string): Night | null => {
  throw new Error('readNight: not implemented yet (#2)');
};
