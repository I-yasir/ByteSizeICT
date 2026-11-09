'use server';

import { revalidatePath } from 'next/cache';
import { adminAction } from '@/lib/actions';
import { kickOutbox } from '@/lib/outbox/enqueue';
import {
  extendStudentsSchema,
  resetPinSchema,
  setStudentExpirySchema,
  studentIdSchema,
  studentReasonSchema,
  updateStudentSchema,
} from './schemas';
import * as service from './service';

/** Admin student actions (TRD §7.2). Every access change writes an audit row in SQL. */
function done<T>(result: T): T {
  kickOutbox();
  revalidatePath('/admin/students', 'layout');
  return result;
}

export const extendStudents = adminAction('students.extend', extendStudentsSchema, async (input, { admin }) =>
  done(await service.extendStudents(admin.id, input.studentIds, input.days)),
);

export const setStudentExpiry = adminAction('students.setExpiry', setStudentExpirySchema, async (input, { admin }) =>
  done(await service.setStudentExpiry(admin.id, input.studentId, input.expiresAt)),
);

export const cancelStudent = adminAction('students.cancel', studentReasonSchema, async (input, { admin }) =>
  done(await service.cancelStudent(admin.id, input.studentId, input.reason)),
);

export const suspendStudent = adminAction('students.suspend', studentReasonSchema, async (input, { admin }) =>
  done(await service.suspendStudent(admin.id, input.studentId, input.reason)),
);

export const reactivateStudent = adminAction('students.reactivate', studentIdSchema, async (input, { admin }) =>
  done(await service.reactivateStudent(admin.id, input.studentId)),
);

export const resetStudentPin = adminAction('students.resetPin', resetPinSchema, async (input, { admin }) =>
  done(await service.resetStudentPin(admin.id, input)),
);

export const resendCredentials = adminAction('students.resendCredentials', studentIdSchema, async (input, { admin }) =>
  done(await service.resendCredentials(admin.id, input.studentId)),
);

export const forceLogoutStudent = adminAction('students.forceLogout', studentIdSchema, async (input, { admin }) =>
  done(await service.forceLogoutStudent(admin.id, input.studentId)),
);

export const updateStudent = adminAction('students.update', updateStudentSchema, async (input, { admin }) =>
  done(await service.updateStudent(admin.id, input)),
);
