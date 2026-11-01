import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('gives one row per job, sorted, and counts the bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    const jobs = night?.rows.map((r) => r.job) ?? [];
    expect(jobs).toHaveLength(5);
    expect(jobs).toEqual([...jobs].sort());
  });

  it('aggregates fixtures/refresh: 3 retries, then ok', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the last error for notes/backup', () => {
    expect(row('notes/backup')?.lastStatus).toBe('fail');
    expect(row('notes/backup')?.lastError).toBe('quota exceeded');
  });

  it('keeps a row with a null owner', () => {
    expect(row('digest/render')?.owner).toBeNull();
  });

  it('keeps times as written, offset included', () => {
    expect(row('rig/rotate-logs')?.firstAt).toBe('2026-10-28T23:00:02+01:00');
    expect(row('lane/sync')?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-read-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2000-01-01')).toBeNull();
  });

  it('an empty file is a night with no rows', () => {
    writeFileSync(join(dir, '2000-01-02.jsonl'), '');
    expect(readNight(dir, '2000-01-02')).toEqual({ night: '2000-01-02', rows: [], badLines: 0 });
  });

  it('counts invalid lines without throwing and skips blank ones', () => {
    const lines = [
      '{"at":"t1","job":"a","status":"ok","owner":"x"}',
      '{"at":"t2","job":"a","status":"maybe","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      'not json',
      '',
      '{"at":"t3","job":"a","status":"retry","owner":"x","error":"boom"}',
      '',
    ];
    writeFileSync(join(dir, '2000-01-03.jsonl'), lines.join('\n'));
    const n = readNight(dir, '2000-01-03');
    expect(n?.badLines).toBe(3);
    expect(n?.rows).toEqual([
      { job: 'a', owner: 'x', runs: 2, retries: 1, lastStatus: 'retry', lastError: 'boom', firstAt: 't1', lastAt: 't3' },
    ]);
  });
});
