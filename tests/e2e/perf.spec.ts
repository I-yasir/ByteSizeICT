import { writeFileSync } from 'node:fs';
import { makeExam, makeQuestionBank } from '../helpers/fixtures';
import { createStudent, expect, loginStudent, openAttempt, startAttempt, test } from '../helpers/e2e';

/**
 * P4.20 (local part): JS shipped on the exam route, gzipped as served by `next start` (PRD §5 budget
 * < 180 KB, excluding KaTeX fonts), plus time-to-first-card for 100 questions. The budget uses the
 * compressed **body** bytes (Resource Timing `encodedBodySize`); the CDP transfer total, which also
 * counts ~0.8 KB of HTTP headers (mostly CSP) per script, is reported alongside.
 */
test('exam route JS budget and 100-question load @desktop', async ({ page, context }, testInfo) => {
  const student = await createStudent();
  await loginStudent(context, student.id);
  const bank = await makeQuestionBank(100);
  const examId = await makeExam({ questionIds: bank.questions.map((q) => q.id) });
  const attemptId = await startAttempt(examId, student.id);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const scripts = new Map<string, { url: string; bytes: number }>();
  cdp.on('Network.responseReceived', (e) => {
    if (e.type === 'Script') scripts.set(e.requestId, { url: e.response.url, bytes: 0 });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const entry = scripts.get(e.requestId);
    if (entry) entry.bytes = e.encodedDataLength;
  });

  const started = Date.now();
  await openAttempt(page, attemptId);
  const firstCardMs = Date.now() - started;
  await page.waitForLoadState('networkidle');
  await expect(page.locator('article[data-index="99"]')).toBeAttached({ timeout: 15_000 });

  const bodies = new Map(
    await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((e): e is PerformanceResourceTiming => e.name.endsWith('.js'))
        .map((e) => [e.name, e.encodedBodySize] as const),
    ),
  );
  const files = [...scripts.values()].map((s) => ({ ...s, body: bodies.get(s.url) ?? s.bytes }));
  const body = files.reduce((sum, f) => sum + f.body, 0);
  const transfer = files.reduce((sum, f) => sum + f.bytes, 0);
  const kb = (n: number) => Math.round(n / 102.4) / 10;
  const report = { scripts: files.length, jsKB: kb(body), transferKB: kb(transfer), firstCardMs };
  console.log('PERF', JSON.stringify(report));
  // PERF_DUMP=<file> writes the per-script breakdown for bundle analysis.
  if (process.env.PERF_DUMP) writeFileSync(process.env.PERF_DUMP, JSON.stringify(files, null, 2));
  await testInfo.attach('perf.json', { body: JSON.stringify({ ...report, files }, null, 2), contentType: 'application/json' });
  expect(files.every((f) => bodies.has(f.url)), 'every script has a Resource Timing entry').toBe(true);
  expect(body).toBeLessThan(180 * 1024);
});
