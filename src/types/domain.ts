/** Shared domain payload types (TRD §7). Isomorphic. */
export type OptionKey = 'A' | 'B' | 'C' | 'D';

export type AnswerChange = { q: string; o: OptionKey | null; m: boolean; s: number };

export type PaperOption = { key: OptionKey; html: string; imageUrl: string | null };

/** In-exam question. Options are already in display order; never carries the answer key. */
export type PaperQuestion = {
  id: string;
  n: number;
  stemHtml: string;
  stemImageUrl: string | null;
  options: PaperOption[];
};

export type SavedAnswer = { o: OptionKey | null; m: boolean; s: number };

export type AttemptSession = {
  attemptId: string;
  status: 'in_progress';
  exam: {
    id: string;
    title: string;
    durationMinutes: number;
    marksPerQuestion: number;
    negativeMark: number;
    allowMarkForReview: boolean;
    questionCount: number;
    totalMarks: number;
  };
  deadlineAt: string;
  serverNow: string;
  lastQuestionIndex: number;
  questions: PaperQuestion[];
  answers: Record<string, SavedAnswer>;
};

export type QuestionStatus = 'correct' | 'incorrect' | 'skipped';
export type OptionStats = { A: number; B: number; C: number; D: number; skipped: number };

export type ReviewQuestion = PaperQuestion & {
  selected: OptionKey | null;
  marked: boolean;
  /** null until answers are published */
  status: QuestionStatus | null;
  correctOption: OptionKey | null;
  explanationHtml: string | null;
  explanationImageUrl: string | null;
  /** percentages; null unless stats are visible */
  stats: OptionStats | null;
};
