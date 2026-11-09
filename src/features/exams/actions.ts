'use server';

import { revalidatePath } from 'next/cache';
import { adminAction } from '@/lib/actions';
import {
  examIdSchema,
  examSettingsSchema,
  setExamAudienceSchema,
  setExamQuestionsSchema,
  setFeaturedSchema,
  updateExamSettingsSchema,
} from './schemas';
import * as service from './service';

/** Exam builder actions. Public routine pages are revalidated on every change (PRD A-13). */
const refresh = <T>(result: T): T => {
  revalidatePath('/');
  revalidatePath('/routine');
  revalidatePath('/admin/exams', 'layout');
  return result;
};

export const createExam = adminAction('exams.create', examSettingsSchema, async (input, { admin }) =>
  refresh(await service.createExam(admin.id, input)),
);
export const updateExamSettings = adminAction('exams.update', updateExamSettingsSchema, async (input) =>
  refresh(await service.updateExamSettings(input.id, input.settings)),
);
export const setExamQuestions = adminAction('exams.questions', setExamQuestionsSchema, async (input) =>
  refresh(await service.setExamQuestions(input.id, input.questionIds)),
);
export const setExamAudience = adminAction('exams.audience', setExamAudienceSchema, async (input) =>
  refresh(await service.setExamAudience(input.id, input.audience, input.planIds)),
);
export const publishExam = adminAction('exams.publish', examIdSchema, async (input, { admin }) =>
  refresh(await service.publishExam(admin.id, input.id)),
);
export const unpublishExam = adminAction('exams.unpublish', examIdSchema, async (input, { admin }) =>
  refresh(await service.unpublishExam(admin.id, input.id)),
);
export const archiveExam = adminAction('exams.archive', examIdSchema, async (input, { admin }) =>
  refresh(await service.archiveExam(admin.id, input.id)),
);
export const setFeaturedExam = adminAction('exams.feature', setFeaturedSchema, async (input, { admin }) =>
  refresh(await service.setFeaturedExam(admin.id, input.id)),
);
