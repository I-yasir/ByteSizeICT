'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminAction, run } from '@/lib/actions';
import { type ActionResult, failFromZod, getRequestContext } from '@/lib/http';
import { kickOutbox } from '@/lib/outbox/enqueue';
import { approveAdmissionSchema, rejectAdmissionSchema, submitAdmissionSchema } from './schemas';
import * as service from './service';

/** Public: /enroll (V-06). */
export async function submitAdmission(raw: unknown): Promise<ActionResult<{ admissionId: string }>> {
  const parsed = submitAdmissionSchema.safeParse(raw);
  if (!parsed.success) return failFromZod(parsed.error);
  const ctx = await getRequestContext();
  const result = await run('admissions.submit', () => service.submitAdmission(parsed.data, ctx));
  if (result.ok) {
    kickOutbox();
    revalidatePath('/admin/admissions');
  }
  return result;
}

export const approveAdmission = adminAction('admissions.approve', approveAdmissionSchema, async (input, { admin }) => {
  const result = await service.approveAdmission(admin.id, input);
  kickOutbox();
  revalidatePath('/admin', 'layout');
  return result;
});

export const rejectAdmission = adminAction('admissions.reject', rejectAdmissionSchema, async (input, { admin }) => {
  const result = await service.rejectAdmission(admin.id, input);
  kickOutbox();
  revalidatePath('/admin', 'layout');
  return result;
});

/** Drawer detail + approve-dialog defaults (docs/02_AppFlow.md §6.3). */
export const loadAdmissionDetail = adminAction('admissions.detail', z.object({ id: z.uuid() }), async (input) => {
  const { getAdmissionDetail } = await import('./queries');
  return getAdmissionDetail(input.id);
});
