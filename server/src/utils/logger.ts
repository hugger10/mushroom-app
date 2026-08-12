import pino, { Logger } from "pino";
import path from "path";

type LogBindings = Record<string, string | number | undefined>;

const isDevelopment = process.env.NODE_ENV === "development";
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? "debug" : "info");
const logToFile = process.env.LOG_TO_FILE === "true";
const logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");

const loggerOptions: pino.LoggerOptions = {
  level: logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string): { level: string } => ({ level: label }),
    bindings: (bindings: pino.Bindings): LogBindings => ({
      pid: bindings.pid
      // host: bindings.hostname
    })
  }
};

let logger: Logger;

if (isDevelopment) {
  logger = pino({
    ...loggerOptions,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "yyyy-mm-dd HH:MM:ss",
        ignore: "pid,host"
      }
    }
  });
} else if (logToFile) {
  const logFile = pino.destination({
    dest: path.join(logDir, "app.log"),
    mkdir: true,
    sync: false
  });

  const errorLogFile = pino.destination({
    dest: path.join(logDir, "error.log"),
    mkdir: true,
    sync: false
  });

  logger = pino(
    loggerOptions,
    pino.multistream([
      { stream: process.stdout },
      { level: "error", stream: errorLogFile },
      { level: "info", stream: logFile }
    ])
  );
} else {
  logger = pino(loggerOptions);
}

export default logger;

export { logger };
