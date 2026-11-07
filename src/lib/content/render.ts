import 'server-only';
import katex from 'katex';

/**
 * Server-side rich text → sanitised HTML (docs/03_UI_Spec.md §8, TRD §8.10). The only producer of
 * HTML for `dangerouslySetInnerHTML`. Supported syntax: plain text with line breaks, inline math
 * `$…$`, display math `$$…$$`, inline code `` `…` `` and fenced code blocks. `\$` is a literal dollar.
 * Everything else is HTML-escaped; KaTeX runs with `trust: false`.
 */
const TOKEN = /```(?:[a-zA-Z0-9]*\n)?([\s\S]*?)```|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$|`([^`\n]+)`/g;
const DOLLAR = '\u0000DOLLAR\u0000';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const restoreDollars = (text: string) => text.split(DOLLAR).join('$');

/**
 * Wrapped in `role="img"` labelled with the TeX source: buttons whose only content is math (e.g. an
 * option `$9$`) otherwise have no accessible name, because KaTeX's MathML isn't used for names (P4.21).
 */
function renderMath(tex: string, displayMode: boolean): string {
  const source = restoreDollars(tex);
  return `<span role="img" aria-label="${escapeHtml(source.trim())}">${renderKatex(source, displayMode)}</span>`;
}

function renderKatex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
    maxSize: 20,
    maxExpand: 200,
  });
}

function renderPlain(text: string): string {
  return escapeHtml(restoreDollars(text)).replace(/\r?\n/g, '<br>');
}

export function renderRichText(input: string | null | undefined): string {
  if (!input) return '';
  const text = input.replace(/\\\$/g, DOLLAR);
  let html = '';
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    html += renderPlain(text.slice(last, index));
    const [, fenced, display, inline, code] = match;
    if (fenced !== undefined) {
      html += `<pre class="rt-pre"><code>${escapeHtml(restoreDollars(fenced.replace(/\n$/, '')))}</code></pre>`;
    } else if (display !== undefined) {
      html += `<span class="rt-math-display">${renderMath(display, true)}</span>`;
    } else if (inline !== undefined) {
      html += renderMath(inline, false);
    } else if (code !== undefined) {
      html += `<code class="rt-code">${escapeHtml(restoreDollars(code))}</code>`;
    }
    last = index + match[0].length;
  }
  return html + renderPlain(text.slice(last));
}
