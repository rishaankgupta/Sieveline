/**
 * Structured JSON logger with secret redaction. One line per event, safe to ship to any log
 * platform. Redaction is by key name and by value pattern, so a secret that ends up in an
 * unexpected field is still masked.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|dsn|credential/i;
const SECRET_VALUE = [
  /tvly-[A-Za-z0-9_-]{6,}/g,
  /\bsk[-_][A-Za-z0-9_-]{10,}/g,
  /\b(?:pk|rk|whsec)_[A-Za-z0-9]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/gi,
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") {
    let s = value;
    for (const re of SECRET_VALUE) s = s.replace(re, "[redacted]");
    return s.length > 2000 ? `${s.slice(0, 2000)}…[truncated]` : s;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1) };
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

export function createLogger(
  base: Record<string, unknown> = {},
  options: { level?: LogLevel; write?: (line: string) => void } = {},
): Logger {
  const min = ORDER[options.level ?? ((process.env.LOG_LEVEL as LogLevel | undefined) ?? "info")] ?? 20;
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < min) return;
    const entry = redact({ time: new Date().toISOString(), level, msg, ...base, ...fields });
    write(JSON.stringify(entry));
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child: (fields) => createLogger({ ...base, ...fields }, options),
  };
}
