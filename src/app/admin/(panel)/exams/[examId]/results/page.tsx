import { Download, Trophy } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader, StatTile } from '@/components/admin/ui';
import { RichText } from '@/components/content/rich-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { getExamResultsAdmin } from '@/features/results/admin';
import { formatDate, formatNumber } from '@/lib/format';

/** /admin/exams/[examId]/results (PRD A-12, docs/02_AppFlow.md §6.10). */
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('admin.examResults'))('title') };
}

export default async function ExamResultsPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(examId)) notFound();
  const [t, locale, data] = await Promise.all([getTranslations('admin.examResults'), getLocale() as Promise<'bn' | 'en'>, getExamResultsAdmin(examId)]);
  if (!data) notFound();
  const n = (v: number | null, d = 2) => (v === null ? '—' : formatNumber(v, locale, d));
  // exam_summary.participants includes late attempts; the tile shows on-time (+ late).

  return (
    <>
      <Link href={`/admin/exams/${examId}`} className="text-sm font-semibold text-primary">← {data.exam.title}</Link>
      <PageHeader
        title={t('title')}
        actions={data.table.length ? <Button asChild variant="secondary" leadingIcon={<Download aria-hidden className="size-4" />}><a href={`/api/admin/exams/${examId}/results.csv`}>{t('export')}</a></Button> : null}
      />
      {data.table.length === 0 ? (
        <EmptyState icon={<Trophy />} title={t('empty')} />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label={t('participants')} value={`${n(data.summary.participants - data.summary.lateParticipants, 0)}${data.summary.lateParticipants ? ` (+${n(data.summary.lateParticipants, 0)} ${t('lateShort')})` : ''}`} />
            <StatTile label={t('average')} value={n(data.summary.average)} />
            <StatTile label={t('highest')} value={n(data.summary.highest)} />
            <StatTile label={t('lowest')} value={n(data.summary.lowest)} />
          </div>
          <Card className="overflow-x-auto p-0 md:p-0">
            <table className="w-full text-sm">
              <caption className="p-4 text-left font-semibold text-fg">{t('ranking', { total: n(data.exam.totalMarks) })}</caption>
              <thead className="bg-surface-2 text-left text-xs text-fg-muted">
                <tr>{(['rank', 'mobile', 'label', 'score', 'cis', 'late', 'submitted'] as const).map((c) => <th key={c} scope="col" className="h-11 px-4 whitespace-nowrap">{t(`cols.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {data.table.map((row) => (
                  <tr key={row.attemptId} className="h-13 border-t border-border">
                    <td className="px-4 font-num font-semibold">{row.rank ?? '—'}</td>
                    <td className="px-4 font-num">{row.studentId ? <Link className="text-primary hover:underline" href={`/admin/students/${row.studentId}`}>{row.mobile}</Link> : row.mobile}</td>
                    <td className="px-4">{row.label ?? '—'}</td>
                    <td className="px-4 font-num font-semibold">{n(row.score)}</td>
                    <td className="px-4 font-num whitespace-nowrap">{row.correct}/{row.incorrect}/{row.skipped}</td>
                    <td className="px-4">{row.isLate ? <Badge variant="warning">{t('lateShort')}</Badge> : null}</td>
                    <td className="px-4 font-num text-xs whitespace-nowrap text-fg-muted">{formatDate(row.submittedAt, locale, 'dateTime')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="overflow-x-auto p-0 md:p-0">
            <table className="w-full text-sm">
              <caption className="p-4 text-left font-semibold text-fg">{t('analysis')}</caption>
              <thead className="bg-surface-2 text-left text-xs text-fg-muted">
                <tr>{(['position', 'question', 'correct', 'wrong'] as const).map((c) => <th key={c} scope="col" className="h-11 px-4 whitespace-nowrap">{t(`qcols.${c}`)}</th>)}</tr>
              </thead>
              <tbody>
                {data.analysis.map((q) => (
                  <tr key={q.questionId} className="border-t border-border">
                    <td className="px-4 py-2 font-num">{q.position}</td>
                    <td className="max-w-md px-4 py-2"><Link href={`/admin/questions/${q.questionId}`} className="hover:underline"><RichText html={q.stemHtml} className="line-clamp-2" /></Link></td>
                    <td className="px-4 py-2 font-num font-semibold">{n(q.correctPercent, 1)}%</td>
                    <td className="px-4 py-2 font-num">{q.mostChosenWrong ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
