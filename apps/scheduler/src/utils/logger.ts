import { format } from 'date-fns';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Determine log level from environment variable, default to INFO
const getLogLevel = (): LogLevel => {
  const levelStr = process.env.LOG_LEVEL?.toUpperCase();
  switch (levelStr) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    default:
      return LogLevel.INFO; // Default level
  }
};

const configuredLogLevel: LogLevel = getLogLevel();

// Simple console logger implementation
const logMessage = (level: LogLevel, message: string, ...optionalParams: any[]) => {
  if (level >= configuredLogLevel) {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss.SSS');
    const levelStr = LogLevel[level]; // Get string representation of enum
    console.log(`[${timestamp}] [${levelStr}] ${message}`, ...optionalParams);
  }
};

export const logger = {
  debug: (message: string, ...optionalParams: any[]) => {
    logMessage(LogLevel.DEBUG, message, ...optionalParams);
  },
  info: (message: string, ...optionalParams: any[]) => {
    logMessage(LogLevel.INFO, message, ...optionalParams);
  },
  warn: (message: string, ...optionalParams: any[]) => {
    logMessage(LogLevel.WARN, message, ...optionalParams);
  },
  error: (message: string, ...optionalParams: any[]) => {
    // Ensure errors always get logged regardless of level?
    // For now, stick to configured level, but could change.
    logMessage(LogLevel.ERROR, message, ...optionalParams);
  },
  getConfiguredLevel: (): string => LogLevel[configuredLogLevel],
};

// Log the configured level on startup
logger.info(`Logger initialized with level: ${logger.getConfiguredLevel()}`); 