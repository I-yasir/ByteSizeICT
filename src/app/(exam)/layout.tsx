import type { ReactNode } from 'react';

/** Chrome-free group: the exam page renders its own sticky bars (docs/02_AppFlow.md §2). */
export default function ExamLayout({ children }: { children: ReactNode }) {
  return children;
}
