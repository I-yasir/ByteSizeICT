import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatClock,
  loadLocal,
  mergeAnswers,
  nextSelection,
  purgeStale,
  saveLocal,
  type SendOutcome,
  storageKey,
  SyncQueue,
  timerState,
} from '@/components/exam/exam-store';
import type { AnswerChange } from '@/types/domain';

const change = (q: string, s: number, o: 'A' | 'B' | null = 'A'): AnswerChange => ({ q, o, m: false, s });

describe('mergeAnswers', () => {
  it('keeps the higher seq per question and reports local-newer entries as pending', () => {
    const server = { q1: { o: 'A' as const, m: false, s: 5 }, q2: { o: 'B' as const, m: true, s: 2 } };
    const local = { q1: { o: 'C' as const, m: false, s: 3 }, q2: { o: null, m: false, s: 7 }, q3: { o: 'D' as const, m: false, s: 8 } };
    const { answers, pending, seq } = mergeAnswers(server, local);
    expect(answers).toEqual({ q1: server.q1, q2: local.q2, q3: local.q3 });
    expect(pending.map((p) => p.q).sort()).toEqual(['q2', 'q3']);
    expect(seq).toBe(8);
  });

  it('works with no local state', () => {
    expect(mergeAnswers({}, undefined)).toEqual({ answers: {}, pending: [], seq: 0 });
  });
});

describe('local store', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips and purges stale stores', () => {
    saveLocal(storageKey('a1'), { seq: 3, answers: { q: { o: 'A', m: false, s: 3 } }, scrollQ: 4 });
    expect(loadLocal(storageKey('a1'))).toMatchObject({ v: 1, seq: 3, scrollQ: 4 });
    localStorage.setItem(storageKey('old'), JSON.stringify({ v: 1, seq: 1, answers: {}, scrollQ: 0, updatedAt: '2020-01-01T00:00:00Z' }));
    localStorage.setItem('unrelated', 'keep');
    purgeStale();
    expect(localStorage.getItem(storageKey('old'))).toBeNull();
    expect(localStorage.getItem(storageKey('a1'))).not.toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('ignores corrupt data', () => {
    localStorage.setItem(storageKey('bad'), '{not json');
    expect(loadLocal(storageKey('bad'))).toBeNull();
  });
});

describe('SyncQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces and coalesces by question (latest seq wins)', async () => {
    const send = vi.fn(async (_changes: AnswerChange[]): Promise<SendOutcome> => 'ok');
    const queue = new SyncQueue({ send });
    queue.enqueue(change('q1', 1, 'A'));
    queue.enqueue(change('q1', 2, 'B'));
    queue.enqueue(change('q2', 3));
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual([change('q1', 2, 'B'), change('q2', 3)]);
    expect(queue.pendingCount).toBe(0);
  });

  it('backs off exponentially on network errors and recovers', async () => {
    const outcomes: SendOutcome[] = ['network', 'network', 'network', 'ok'];
    const send = vi.fn(async (): Promise<SendOutcome> => outcomes.shift() ?? 'ok');
    const statuses: string[] = [];
    const queue = new SyncQueue({ send, onStatus: (s) => statuses.push(s.state) });
    queue.enqueue(change('q1', 1));
    await vi.advanceTimersByTimeAsync(600); // attempt 1 fails → 1 s
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // attempt 2 fails → 2 s
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000); // attempt 3 fails → 4 s
    expect(send).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4000); // attempt 4 ok
    expect(send).toHaveBeenCalledTimes(4);
    expect(queue.pendingCount).toBe(0);
    expect(statuses).toContain('offline');
    expect(statuses.at(-1)).toBe('synced');
  });

  it('a change made while a request is in flight is not lost and wins over the failed one', async () => {
    let resolve: (o: SendOutcome) => void = () => {};
    const send = vi.fn(() => new Promise<SendOutcome>((r) => (resolve = r)));
    const queue = new SyncQueue({ send });
    queue.enqueue(change('q1', 1, 'A'));
    await vi.advanceTimersByTimeAsync(600);
    queue.enqueue(change('q1', 2, 'B')); // while in flight
    resolve('network');
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.pendingChanges()).toEqual([change('q1', 2, 'B')]);
  });

  it('flush sends immediately with keepalive', async () => {
    const send = vi.fn(async (): Promise<SendOutcome> => 'ok');
    const queue = new SyncQueue({ send });
    queue.enqueue(change('q1', 1));
    await queue.flush({ keepalive: true });
    expect(send).toHaveBeenCalledWith([change('q1', 1)], { keepalive: true });
  });

  it('stops on terminal outcomes, keeping unsynced changes for the final submit', async () => {
    const onTerminal = vi.fn();
    const queue = new SyncQueue({ send: async () => 'closed', onTerminal });
    queue.enqueue(change('q1', 1));
    await vi.advanceTimersByTimeAsync(600);
    expect(onTerminal).toHaveBeenCalledWith('closed');
    queue.enqueue(change('q2', 2)); // ignored after stop
    expect(queue.pendingChanges()).toEqual([change('q1', 1)]);
  });

  it('splits large backlogs into batches of 200', async () => {
    const send = vi.fn(async (): Promise<SendOutcome> => 'ok');
    const queue = new SyncQueue({ send });
    for (let i = 0; i < 250; i += 1) queue.enqueue(change(`q${i}`, i + 1));
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(50);
    expect(send.mock.calls.map((call) => (call as unknown as [AnswerChange[]])[0].length)).toEqual([200, 50]);
  });
});

describe('pure helpers', () => {
  it('tap-to-deselect', () => {
    expect(nextSelection(null, 'A')).toBe('A');
    expect(nextSelection('A', 'B')).toBe('B');
    expect(nextSelection('B', 'B')).toBeNull();
  });

  it('timer thresholds at 300 s and 60 s', () => {
    expect(timerState(300_001)).toBe('normal');
    expect(timerState(300_000)).toBe('warning');
    expect(timerState(60_001)).toBe('warning');
    expect(timerState(60_000)).toBe('critical');
    expect(timerState(0)).toBe('expired');
  });

  it('clock format', () => {
    expect(formatClock(65_000)).toBe('01:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-1)).toBe('00:00');
  });
});
