import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Fixtures live in a temp dir, never in runs/ (read-only real nights).
let runsDir: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

const NORMAL = '2026-10-01';
const EMPTY = '2026-10-02';
const BAD = '2026-10-03';
const MISSING = '2026-10-04';

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // File order is deliberately not sorted order: the digest sorts rows by job.
  writeFileSync(
    join(runsDir, `${NORMAL}.jsonl`),
    [
      '{"at":"2026-10-01T23:00:02+01:00","job":"zeta/cleanup","status":"ok","owner":"lane-07"}',
      '{"at":"2026-10-01T01:00:01+01:00","job":"lane/sync","status":"retry","owner":"rook","error":"lock held"}',
      '{"at":"2026-10-01T01:01:01+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      '{"at":"2026-10-01T02:30:00+01:00","job":"alpha/backup","status":"fail","owner":null,"error":"disk full"}',
      '',
    ].join('\n'),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [
      '{"at":"2026-10-03T01:00:01+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      'this is not json',
      '{"at":"2026-10-03T02:00:01+01:00","job":"notes/backup","status":"ok","owner":"lane-07"}',
      '',
    ].join('\n'),
  );
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// Job names from the table body, in rendered order.
const jobsOnPage = (html: string): string[] => {
  const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  return [...tbody.matchAll(/<tr[^>]*>\s*<td>([^<]*)<\/td>/g)].map((m) => m[1] ?? '');
};

describe('GET /digest/:night', () => {
  it('200 for a normal night, with every job in the table', async () => {
    const res = await createApp(config).request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<h1>${NORMAL}</h1>`);
    expect(html).not.toContain('could not be read');
    expect(jobsOnPage(html)).toEqual(['alpha/backup', 'lane/sync', 'zeta/cleanup']);
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('shows "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('notes the bad line and still shows the good rows', async () => {
    const res = await createApp(config).request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line could not be read');
    expect(jobsOnPage(html)).toEqual(['lane/sync', 'notes/backup']);
  });
});

describe('GET /api/digest/:night', () => {
  it('200 for a normal night, with rows', async () => {
    const res = await createApp(config).request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe(NORMAL);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/backup', 'lane/sync', 'zeta/cleanup']);
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('empty night has rows: []', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('bad line is counted, good rows still there', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'notes/backup']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for one night', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const body = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;
    expect(jobsOnPage(html)).toEqual(body.rows.map((r) => r.job));
  });
});
