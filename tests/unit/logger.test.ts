import { createLogger, getRecentLogs } from '@/lib/logger';

// __DEV__ is provided by React Native at runtime; define it for Node tests.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

describe('logger', () => {
  it('redacts values under secret-looking keys', () => {
    const log = createLogger('test');
    log.info('session refreshed', {
      accessToken: 'abc123',
      user: { password: 'hunter2', email: 'a@b.co' },
    });
    const last = getRecentLogs().at(-1);
    expect(last?.message).not.toContain('abc123');
    expect(last?.message).not.toContain('hunter2');
    expect(last?.message).toContain('a@b.co');
  });

  it('redacts JWT-shaped strings inside plain values', () => {
    const log = createLogger('test');
    const jwt = `eyJ${'a'.repeat(20)}.eyJ${'b'.repeat(20)}.sig-part`;
    log.error(`request failed with bearer ${jwt}`);
    const last = getRecentLogs().at(-1);
    expect(last?.message).not.toContain(jwt);
    expect(last?.message).toContain('[redacted]');
  });

  it('keeps a bounded buffer', () => {
    const log = createLogger('test');
    for (let i = 0; i < 250; i += 1) log.debug(`entry ${i}`);
    expect(getRecentLogs().length).toBeLessThanOrEqual(200);
  });
});
