// @vitest-environment node
// Every Server Action and Route Handler rejects unauthenticated callers (P2.26 gate requirement).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMocks } from '../helpers/mocks';

vi.mock('@/lib/auth/guards', () => import('../helpers/guards-mock'));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => import('../helpers/next-server-mock'));
vi.mock('next/headers', () => import('../helpers/next-headers-mock'));

beforeEach(resetMocks);

const ID = '00000000-0000-4000-8000-000000000999';

describe('admin Server Actions without a session → UNAUTHENTICATED', async () => {
  const modules = {
    admissions: await import('@/features/admissions/actions'),
    students: await import('@/features/students/actions'),
    taxonomy: await import('@/features/taxonomy/actions'),
    questions: await import('@/features/questions/actions'),
    exams: await import('@/features/exams/actions'),
    settings: await import('@/features/settings/actions'),
  };
  const publicActions = new Set(['submitAdmission']);
  const cases = Object.entries(modules).flatMap(([feature, mod]) =>
    Object.entries(mod)
      .filter(([name, fn]) => typeof fn === 'function' && !publicActions.has(name))
      .map(([name, fn]) => [`${feature}.${name}`, fn as (raw: unknown) => Promise<{ ok: boolean; error?: { code: string } }>] as const),
  );

  it('covers every exported admin action', () => expect(cases.length).toBeGreaterThanOrEqual(36));

  it.each(cases)('%s', async (_name, action) => {
    const result = await action({});
    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
  });
});

describe('student Route Handlers without a session → 401', () => {
  const json = (body: unknown) => ({
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('POST /api/exams/:id/start', async () => {
    const { POST } = await import('@/app/api/exams/[examId]/start/route');
    const response = await POST(new Request('http://localhost:3000/x', json({})), { params: Promise.resolve({ examId: ID }) });
    expect(response.status).toBe(401);
  });

  it('GET /api/attempts/:id', async () => {
    const { GET } = await import('@/app/api/attempts/[attemptId]/route');
    const response = await GET(new Request('http://localhost:3000/x'), { params: Promise.resolve({ attemptId: ID }) });
    expect(response.status).toBe(401);
  });

  it('PUT /api/attempts/:id/answers', async () => {
    const { PUT } = await import('@/app/api/attempts/[attemptId]/answers/route');
    const response = await PUT(new Request('http://localhost:3000/x', { ...json({ changes: [] }), method: 'PUT' }), {
      params: Promise.resolve({ attemptId: ID }),
    });
    expect(response.status).toBe(401);
  });

  it('POST /api/attempts/:id/submit', async () => {
    const { POST } = await import('@/app/api/attempts/[attemptId]/submit/route');
    const response = await POST(new Request('http://localhost:3000/x', json({})), { params: Promise.resolve({ attemptId: ID }) });
    expect(response.status).toBe(401);
  });

  it('mutating runtime routes reject foreign origins before auth', async () => {
    const { POST } = await import('@/app/api/exams/[examId]/start/route');
    const response = await POST(
      new Request('http://localhost:3000/x', { method: 'POST', headers: { origin: 'https://evil.example' } }),
      { params: Promise.resolve({ examId: ID }) },
    );
    expect(response.status).toBe(403);
  });
});

describe('admin Route Handlers without a session → 401', () => {
  it('GET results.csv', async () => {
    const { GET } = await import('@/app/api/admin/exams/[examId]/results.csv/route');
    expect((await GET(new Request('http://localhost:3000/x'), { params: Promise.resolve({ examId: ID }) })).status).toBe(401);
  });

  it('GET question template', async () => {
    const { GET } = await import('@/app/api/admin/questions/template/route');
    expect((await GET(new Request('http://localhost:3000/x?format=csv'))).status).toBe(401);
  });

  it('POST outbox drain needs the cron secret', async () => {
    const { POST } = await import('@/app/api/internal/outbox/drain/route');
    const response = await POST(new Request('http://localhost:3000/x', { method: 'POST', headers: { 'x-cron-secret': 'wrong' } }));
    expect(response.status).toBe(401);
  });
});
