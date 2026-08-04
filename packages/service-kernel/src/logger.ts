interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

function write(stream: "log" | "error", level: "info" | "error", module: string, message: string, context?: LogContext): void {
  const timestamp = new Date().toISOString();
  const payload = { level, module, message, timestamp, ...context };
  try {
    console[stream](JSON.stringify(payload));
  } catch {
    // Review finding: a context value that JSON.stringify can't serialize (circular
    // reference, BigInt, etc.) must not silently defeat the one function that exists
    // specifically to enforce AD-17 — fall back to a payload guaranteed to serialize.
    console[stream](JSON.stringify({ level, module, message, timestamp, contextSerializationFailed: true }));
  }
}

export function createLogger(module: string): Logger {
  return {
    info(message, context) {
      write("log", "info", module, message, context);
    },
    error(message, context) {
      write("error", "error", module, message, context);
    },
  };
}
