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
  public setMinLevel(level: 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'): void {
    this.log.settings.minLevel = level as unknown as number; // Cast to number to resolve type mismatch
  }
}

export default Logger
