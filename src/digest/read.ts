import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// Parse one log line at the edge. Anything that isn't a valid RunLine returns null (a bad line).
export const parseLine = (line: string): RunLine | null => {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (!isNonEmptyString(o.at) || !isNonEmptyString(o.job)) return null;
  if (typeof o.status !== 'string' || !STATUSES.includes(o.status as RunStatus)) return null;
  const owner = o.owner ?? null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;

  const parsed: RunLine = { at: o.at, job: o.job, status: o.status as RunStatus, owner };
  if (o.error !== undefined) parsed.error = o.error;
  return parsed;
};

export const readNight: ReadNight = (runsDir: string, night: string): Night | null => {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const run = parseLine(line);
    if (run === null) {
      badLines++;
      continue;
    }
    const row = byJob.get(run.job);
    if (row === undefined) {
      byJob.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    // Later lines win, by file order. Times stay as written (offset kept).
    row.owner = run.owner;
    row.runs++;
    if (run.status === 'retry') row.retries++;
    row.lastStatus = run.status;
    row.lastError = run.error ?? null;
    row.lastAt = run.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
