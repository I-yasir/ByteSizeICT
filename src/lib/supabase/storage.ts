import 'server-only';
import { supabaseAdmin } from './admin';

export const QUESTION_MEDIA_BUCKET = 'question-media';
export const PUBLIC_ASSETS_BUCKET = 'public-assets';
/** R1.1: rows JSON of browser-parsed imports (private, deleted on commit/cancel or after 24 h). */
export const IMPORT_UPLOADS_BUCKET = 'import-uploads';

/**
 * Signs private question-media paths (TRD §9.3). Returns a map path → URL; unknown/failed paths are
 * omitted so callers render the "image couldn't load" placeholder.
 */
export async function signQuestionMedia(
  paths: (string | null | undefined)[],
  ttlSeconds: number,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;

  const { data, error } = await supabaseAdmin.storage
    .from(QUESTION_MEDIA_BUCKET)
    .createSignedUrls(unique, Math.max(60, Math.ceil(ttlSeconds)));
  if (error) throw error;
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

export function publicAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabaseAdmin.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(path).data.publicUrl;
}
