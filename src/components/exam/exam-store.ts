/**
 * Local-first autosave primitives (TRD §8.8–8.9, ADR-06). Framework-free so they can be unit tested.
 * Every change carries a per-attempt monotonic `s`; the server and this merge keep the higher `s`.
 */
import type { AnswerChange, OptionKey, SavedAnswer } from '@/types/domain';

export type Entry = SavedAnswer;
export type LocalState = { v: 1; seq: number; answers: Record<string, Entry>; scrollQ: number; updatedAt: string; startedAt?: string };

const PREFIX = 'bsi:attempt:';
const STALE_MS = 7 * 86_400_000;

export const storageKey = (id: string) => `${PREFIX}${id}`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // private mode / blocked storage
  }
}

export function loadLocal(key: string): LocalState | null {
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalState;
    return parsed && parsed.v === 1 && typeof parsed.answers === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocal(key: string, state: Omit<LocalState, 'v' | 'updatedAt'>): void {
  try {
    storage()?.setItem(key, JSON.stringify({ ...state, v: 1, updatedAt: new Date().toISOString() }));
  } catch {
    /* quota or blocked storage: the server copy still syncs */
  }
}

export function clearLocal(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Removes attempt stores untouched for 7 days (TRD §8.8). */
export function purgeStale(now = Date.now()): void {
  const store = storage();
  if (!store) return;
  for (let i = store.length - 1; i >= 0; i -= 1) {
    const key = store.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    const state = loadLocal(key);
    if (!state || now - Date.parse(state.updatedAt) > STALE_MS) store.removeItem(key);
  }
}

/** Server ∪ local, higher seq per question wins; `pending` = local entries the server has not seen. */
export function mergeAnswers(server: Record<string, Entry>, local: Record<string, Entry> | undefined) {
  const answers: Record<string, Entry> = { ...server };
  const pending: AnswerChange[] = [];
  for (const [q, entry] of Object.entries(local ?? {})) {
    const known = server[q];
    if (!known || entry.s > known.s) {
      answers[q] = entry;
      pending.push({ q, o: entry.o, m: entry.m, s: entry.s });
    }
  }
  const seq = Math.max(0, ...Object.values(answers).map((entry) => entry.s));
  return { answers, pending, seq };
}

export type SendOutcome = 'ok' | 'closed' | 'revoked' | 'inactive' | 'invalid' | 'network';
export type SyncStatus = { state: 'synced' | 'pending' | 'offline' | 'stopped'; pending: number };

type Timer = ReturnType<typeof setTimeout>;

/**
 * Coalescing sync queue: one request in flight, latest change per question wins, 600 ms debounce,
 * exponential backoff 1 s → 30 s on network errors, stops on terminal outcomes (closed/revoked/inactive).
 */
export class SyncQueue {
  private queued = new Map<string, AnswerChange>();
  private inFlight: Map<string, AnswerChange> | null = null;
  private timer: Timer | null = null;
  private backoffMs = 0;
  private stopped = false;
  private offline = false;

  constructor(
    private readonly options: {
      send: (changes: AnswerChange[], opts: { keepalive: boolean }) => Promise<SendOutcome>;
      onStatus?: (status: SyncStatus) => void;
      onTerminal?: (outcome: Exclude<SendOutcome, 'ok' | 'network' | 'invalid'>) => void;
      debounceMs?: number;
      maxBatch?: number;
    },
  ) {}

  get pendingCount(): number {
    const keys = new Set([...this.queued.keys(), ...(this.inFlight?.keys() ?? [])]);
    return keys.size;
  }

  /** Every unsynced change (queued + in flight), newest per question. */
  pendingChanges(): AnswerChange[] {
    const merged = new Map(this.inFlight ?? []);
    for (const [q, change] of this.queued) merged.set(q, change);
    return [...merged.values()];
  }

  enqueue(change: AnswerChange): void {
    if (this.stopped) return;
    const existing = this.queued.get(change.q);
    if (!existing || existing.s < change.s) this.queued.set(change.q, change);
    this.emit();
    this.schedule(this.options.debounceMs ?? 600);
  }

  /** Immediate flush (online event, visibilitychange: hidden with keepalive). */
  flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    this.clearTimer();
    return this.run(opts.keepalive ?? false);
  }

  stop(): void {
    this.stopped = true;
    this.clearTimer();
    this.emit();
  }

  private schedule(delay: number) {
    if (this.timer || this.inFlight) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(false);
    }, delay);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async run(keepalive: boolean): Promise<void> {
    if (this.stopped || this.inFlight || this.queued.size === 0) return;
    const batch = [...this.queued.values()].slice(0, this.options.maxBatch ?? 200);
    this.inFlight = new Map(batch.map((change) => [change.q, change]));
    for (const change of batch) this.queued.delete(change.q);

    const outcome = await this.options.send(batch, { keepalive });
    const sent = this.inFlight;
    this.inFlight = null;

    if (outcome === 'network') {
      // put back anything not superseded while in flight, then back off
      for (const [q, change] of sent) if (!this.queued.has(q)) this.queued.set(q, change);
      this.offline = true;
      this.backoffMs = Math.min(this.backoffMs ? this.backoffMs * 2 : 1000, 30_000);
      this.emit();
      this.schedule(this.backoffMs);
      return;
    }
    this.offline = false;
    this.backoffMs = 0;
    if (outcome === 'closed' || outcome === 'revoked' || outcome === 'inactive') {
      for (const [q, change] of sent) if (!this.queued.has(q)) this.queued.set(q, change);
      this.stop();
      this.options.onTerminal?.(outcome);
      return;
    }
    // ok, or invalid (dropped: retrying a rejected payload can never succeed)
    this.emit();
    if (this.queued.size > 0) this.schedule(0);
  }

  private emit() {
    const pending = this.pendingCount;
    this.options.onStatus?.({
      state: this.stopped ? 'stopped' : this.offline && pending > 0 ? 'offline' : pending > 0 ? 'pending' : 'synced',
      pending,
    });
  }
}

/** Option selection rule (S-06): tapping the selected option clears it. */
export function nextSelection(current: OptionKey | null, tapped: OptionKey): OptionKey | null {
  return current === tapped ? null : tapped;
}

/** Timer state thresholds (UI Spec §7.6). */
export function timerState(remainingMs: number): 'normal' | 'warning' | 'critical' | 'expired' {
  if (remainingMs <= 0) return 'expired';
  if (remainingMs <= 60_000) return 'critical';
  if (remainingMs <= 300_000) return 'warning';
  return 'normal';
}

/** "MM:SS" or "H:MM:SS". */
export function formatClock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
