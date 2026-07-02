/**
 * Diagnostics logger. Redacts anything that looks like a credential so log
 * output can be shared safely from sync diagnostics (IMPLEMENTATION_PROMPT
 * Phase 1: "a basic diagnostics logger that never logs secrets").
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
}

const SECRET_KEY_PATTERN = /(key|token|secret|password|authorization|jwt)/i;
/** JWTs and long opaque keys. */
const SECRET_VALUE_PATTERN = /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+|sb_(secret|publishable)_[\w-]+/g;

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET_VALUE_PATTERN, '[redacted]');
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[redacted]' : redactValue(v);
    }
    return out;
  }
  return value;
}

function serialize(context: unknown): string {
  if (context === undefined) return '';
  try {
    return ` ${JSON.stringify(redactValue(context))}`;
  } catch {
    return ' [unserializable context]';
  }
}

/** In-memory ring buffer surfaced by the sync diagnostics screen. */
const MAX_BUFFERED_ENTRIES = 200;
const buffer: LogEntry[] = [];

function log(level: LogLevel, scope: string, message: string, context?: unknown): void {
  const text = `${redactValue(message)}${serialize(context)}`;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message: text,
  };
  buffer.push(entry);
  if (buffer.length > MAX_BUFFERED_ENTRIES) buffer.shift();
  if (__DEV__ || level === 'warn' || level === 'error') {
    const line = `[${scope}] ${text}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
  }
}

export function getRecentLogs(): readonly LogEntry[] {
  return buffer;
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, context?: unknown) => log('debug', scope, message, context),
    info: (message: string, context?: unknown) => log('info', scope, message, context),
    warn: (message: string, context?: unknown) => log('warn', scope, message, context),
    error: (message: string, context?: unknown) => log('error', scope, message, context),
  };
}
