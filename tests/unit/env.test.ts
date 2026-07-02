describe('env', () => {
  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    jest.resetModules();
  });

  it('throws a readable error when variables are missing', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getEnv, EnvError } = require('@/lib/env') as typeof import('@/lib/env');
      expect(() => getEnv()).toThrow(EnvError);
      expect(() => getEnv()).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
    });
  });

  it('returns parsed values and reports remote config available', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-key';
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getEnv, hasRemoteConfig } = require('@/lib/env') as typeof import('@/lib/env');
      expect(getEnv().EXPO_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
      expect(hasRemoteConfig()).toBe(true);
    });
  });
});
