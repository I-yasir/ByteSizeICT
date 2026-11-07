import { buildTemplateCsv, buildTemplateXlsx } from '@/features/questions/import';
import { getAdminAuth } from '@/lib/auth/guards';
import { fail, jsonResult } from '@/lib/http';

/** Import template download (docs/02_AppFlow.md §6.7). */
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = await getAdminAuth();
  if (!auth.ok) return jsonResult(fail(auth.code));

  const format = new URL(request.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
  if (format === 'xlsx') {
    return new Response(await buildTemplateXlsx(), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="question-import-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response(buildTemplateCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="question-import-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
