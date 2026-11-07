import 'server-only';
import { parseServerEnv } from './env-schema';

/**
 * Validated server environment (TRD §5). Parsed at import time so a misconfigured deployment
 * fails on boot instead of on the first request that needs a missing variable.
 */
export const env = parseServerEnv(process.env);
