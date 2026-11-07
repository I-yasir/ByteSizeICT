import { requestState } from './mocks';

/** Replacement for 'next/headers' in action tests. */
export async function headers(): Promise<Headers> {
  return new Headers({ 'x-forwarded-for': requestState.ip, 'user-agent': requestState.userAgent });
}

export async function cookies() {
  const jar = new Map<string, string>();
  return {
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) as string } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  };
}
