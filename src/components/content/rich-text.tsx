import 'katex/dist/katex.min.css';
import type { ElementType } from 'react';
import { cn } from '@/lib/utils';

/**
 * Renders HTML produced by the server-side renderer `src/lib/content/render.ts` (docs/03_UI_Spec.md §8).
 * `html` must come from `renderRichText` — never pass user text here directly. KaTeX CSS is imported
 * only by modules that render questions.
 */
export function RichText({ html, as: Tag = 'div', className }: { html: string; as?: ElementType; className?: string }) {
  return <Tag className={cn('rich-text', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
