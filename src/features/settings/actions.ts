'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { adminAction } from '@/lib/actions';
import { kickOutbox } from '@/lib/outbox/enqueue';
import { assetUploadSchema, paymentAccountSchema, planSchema, updateSettingSchema } from './schemas';
import * as service from './service';

/** Public pages read settings/plans/payment accounts → revalidate them on every change. */
const refreshPublic = <T>(result: T): T => {
  for (const path of ['/', '/routine', '/enroll', '/faq', '/renew']) revalidatePath(path);
  revalidatePath('/admin/settings');
  return result;
};

export const updateSetting = adminAction('settings.update', updateSettingSchema, async (input, { admin }) =>
  refreshPublic(await service.updateSetting(admin.id, input.key, input.value)),
);
export const upsertPlan = adminAction('settings.plan', planSchema, async (input, { admin }) =>
  refreshPublic(await service.upsertPlan(admin.id, input)),
);
export const deletePlan = adminAction('settings.deletePlan', z.object({ id: z.uuid() }), async (input, { admin }) =>
  refreshPublic(await service.deletePlan(admin.id, input.id)),
);
export const upsertPaymentAccount = adminAction('settings.paymentAccount', paymentAccountSchema, async (input, { admin }) =>
  refreshPublic(await service.upsertPaymentAccount(admin.id, input)),
);
export const createAssetUploadUrl = adminAction('settings.upload', assetUploadSchema, async (input) =>
  service.createAssetUploadUrl(input.kind, input.ext),
);
export const retryFailedOutbox = adminAction('settings.retryOutbox', z.object({}), async () => {
  const result = await service.retryFailedOutbox();
  kickOutbox();
  return result;
});
