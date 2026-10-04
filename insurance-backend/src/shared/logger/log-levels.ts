import { LogLevel } from '@nestjs/common';

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

/**
 * The levels to print for LOG_LEVEL (that level and everything more severe).
 * Without it: `log` in production, `debug` otherwise.
 */
export function logLevels(): LogLevel[] {
  const fallback = process.env.NODE_ENV === 'production' ? 'log' : 'debug';
  const wanted = (process.env.LOG_LEVEL || fallback).toLowerCase() as LogLevel;
  const index = LOG_LEVELS.indexOf(wanted);
  return LOG_LEVELS.slice(0, (index === -1 ? LOG_LEVELS.indexOf(fallback) : index) + 1);
}
