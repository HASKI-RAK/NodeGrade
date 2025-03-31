/* eslint-disable immutable/no-mutation */
import { ILogObj, Logger as Log } from 'tslog'

/**
 * Singleton Logger class that provides centralized logging functionality
 * for the entire server application.
 */
class Logger {
  private static _instance: Logger
  public log: Log<ILogObj>

  private constructor() {
    // Configure the logger with more detailed settings
    this.log = new Log({
      name: 'HASKI-SERVER'
    })

    this.log.info('Logger initialized')
  }

  public static getInstance(): Logger {
    if (!Logger._instance) {
      Logger._instance = new Logger()
    }
    return Logger._instance
  }

  /**
   * Sets the minimum log level at runtime
   * @param level - The minimum log level to display ("silly" | "trace" | "debug" | "info" | "warn" | "error" | "fatal")
   */
  public setMinLevel(
    level: 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  ): void {
    this.log.settings.minLevel = levelToNumber(level)
  }
}

function levelToNumber(
  level: 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
): number {
  switch (level) {
    case 'silly':
      return 0
    case 'trace':
      return 1
    case 'debug':
      return 2
    case 'info':
      return 3
    case 'warn':
      return 4
    case 'error':
      return 5
    case 'fatal':
      return 6
    default:
      throw new Error('Invalid log level')
  }
}

export default Logger
