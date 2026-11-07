import 'server-only';
import { JWT } from 'google-auth-library';
import { env } from '@/lib/env';

/**
 * Google Sheets v4 REST client (TRD §9.2): write-only mirror, never a data source. When
 * GOOGLE_SHEET_ID is empty every call is a no-op that reports `{ skipped: true }`.
 */
export const SHEET_TABS = {
  admissions: 'Admissions',
  students: 'Active Students',
  results: 'Exam Results',
} as const;

export type CellValue = string | number | boolean | null;
export type SheetsResult = { skipped: true } | { skipped: false; row: number | null };

type Fetch = typeof fetch;

export type SheetsClient = {
  appendRow(tab: string, values: CellValue[]): Promise<SheetsResult>;
  findRowByColumn(tab: string, column: string, value: string): Promise<number | null>;
  updateRow(tab: string, row: number, values: CellValue[]): Promise<SheetsResult>;
  upsertRowByColumn(tab: string, column: string, key: string, values: CellValue[]): Promise<SheetsResult>;
};

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const range = (tab: string, cells: string) => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${cells}`);

export function createSheetsClient(options: {
  spreadsheetId: string | undefined;
  getToken: () => Promise<string>;
  fetchImpl?: Fetch;
}): SheetsClient {
  const doFetch = options.fetchImpl ?? fetch;
  const { spreadsheetId } = options;

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await doFetch(`${BASE}/${spreadsheetId}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await options.getToken()}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw new Error(`Sheets API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    return response.json();
  }

  const client: SheetsClient = {
    async appendRow(tab, values) {
      if (!spreadsheetId) return { skipped: true };
      const body = (await call(
        `/values/${range(tab, 'A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: 'POST', body: JSON.stringify({ values: [values] }) },
      )) as { updates?: { updatedRange?: string } };
      const match = body.updates?.updatedRange?.match(/!A(\d+)/);
      return { skipped: false, row: match?.[1] ? Number(match[1]) : null };
    },

    async findRowByColumn(tab, column, value) {
      if (!spreadsheetId) return null;
      const body = (await call(`/values/${range(tab, `${column}:${column}`)}`)) as { values?: string[][] };
      const index = (body.values ?? []).findIndex((row, i) => i > 0 && row[0] === value); // row 1 = header
      return index === -1 ? null : index + 1;
    },

    async updateRow(tab, row, values) {
      if (!spreadsheetId) return { skipped: true };
      await call(`/values/${range(tab, `A${row}`)}?valueInputOption=RAW`, {
        method: 'PUT',
        body: JSON.stringify({ values: [values] }),
      });
      return { skipped: false, row };
    },

    async upsertRowByColumn(tab, column, key, values) {
      if (!spreadsheetId) return { skipped: true };
      const row = await client.findRowByColumn(tab, column, key);
      return row === null ? client.appendRow(tab, values) : client.updateRow(tab, row, values);
    },
  };
  return client;
}

let jwt: JWT | null = null;
async function serviceAccountToken(): Promise<string> {
  jwt ??= new JWT({
    email: env.GOOGLE_SA_EMAIL,
    key: env.GOOGLE_SA_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const { token } = await jwt.getAccessToken();
  if (!token) throw new Error('Google service account returned no access token');
  return token;
}

export const sheets = createSheetsClient({ spreadsheetId: env.GOOGLE_SHEET_ID, getToken: serviceAccountToken });
