import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/** Service-role client for test fixtures (local Supabase only). */
export const testDb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/** Random valid mobile in the 019 range (seed data uses 017/018). */
export function randomMobile(): string {
  return `019${randomInt(0, 100_000_000).toString().padStart(8, '0')}`;
}

export function randomIp(): string {
  return `10.${randomInt(0, 256)}.${randomInt(0, 256)}.${randomInt(1, 255)}`;
}

const DAY = 24 * 60 * 60 * 1000;

export async function createStudent(options: {
  pinHash: string;
  status?: 'active' | 'suspended' | 'cancelled';
  mustChangePin?: boolean;
  expired?: boolean;
}) {
  const mobile = randomMobile();
  const now = Date.now();
  const { data, error } = await testDb
    .from('students')
    .insert({
      mobile,
      email: `${mobile}@test.local`,
      pin_hash: options.pinHash,
      status: options.status ?? 'active',
      must_change_pin: options.mustChangePin ?? false,
      access_starts_at: new Date(now - 60 * DAY).toISOString(),
      access_expires_at: new Date(options.expired ? now - DAY : now + 30 * DAY).toISOString(),
    })
    .select('id, mobile')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStudent(id: string, mobile: string) {
  await testDb.from('rate_limit_events').delete().eq('subject', mobile);
  await testDb.from('outbox').delete().like('dedupe_key', `%${id}%`);
  const { error } = await testDb.from('students').delete().eq('id', id);
  if (error) throw error;
}
