interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

function write(stream: "log" | "error", level: "info" | "error", module: string, message: string, context?: LogContext): void {
  const payload = {
    level,
    module,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  console[stream](JSON.stringify(payload));
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
