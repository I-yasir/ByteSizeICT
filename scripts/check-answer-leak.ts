/**
 * TRD §4.6: exam-runtime code must never reference answer-key fields. Fails the build if
 * `correct_option`/`correctOption` or `explanation` appears in any of the guarded paths.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const GUARDED = [
  'src/features/attempts/paper.ts',
  'src/app/api/attempts',
  'src/app/api/exams',
  'src/components/exam',
];
const FORBIDDEN = /correct_?option|explanation/i;

function files(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => files(join(path, entry)));
}

const hits: string[] = [];
for (const file of GUARDED.flatMap(files)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (FORBIDDEN.test(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
    });
}

if (hits.length > 0) {
  console.error(`Answer-key reference in exam runtime code:\n  ${hits.join('\n  ')}`);
  process.exit(1);
}
console.log('Answer-leak check passed.');
