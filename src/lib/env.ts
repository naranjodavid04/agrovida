import { z } from 'zod';

/**
 * Validated public environment. Only EXPO_PUBLIC_* variables are available in
 * the client bundle; secrets must never live here (CLAUDE.md).
 */
const envSchema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.string().url(),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export class EnvError extends Error {}

/**
 * Returns the validated environment or throws EnvError with a readable
 * message listing the missing variables. Callers decide how to surface it.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new EnvError(
      `Invalid or missing environment variables: ${missing}. Copy .env.example to .env and fill it in.`,
    );
  }
  cached = parsed.data;
  return cached;
}

/** True when Supabase configuration is present (app can attempt remote calls). */
export function hasRemoteConfig(): boolean {
  try {
    getEnv();
    return true;
  } catch {
    return false;
  }
}
