'use server';

import { revalidatePath } from 'next/cache';
import { adminAction } from '@/lib/actions';
import { chapterSchema, idSchema, subjectSchema, topicSchema } from './schemas';
import * as service from './service';

const refresh = <T>(result: T): T => {
  revalidatePath('/admin/taxonomy');
  revalidatePath('/admin/questions', 'layout');
  return result;
};

export const upsertSubject = adminAction('taxonomy.subject', subjectSchema, async (input) => refresh(await service.upsertSubject(input)));
export const upsertChapter = adminAction('taxonomy.chapter', chapterSchema, async (input) => refresh(await service.upsertChapter(input)));
export const upsertTopic = adminAction('taxonomy.topic', topicSchema, async (input) => refresh(await service.upsertTopic(input)));
export const deleteTopic = adminAction('taxonomy.deleteTopic', idSchema, async (input) => refresh(await service.deleteTopic(input.id)));
