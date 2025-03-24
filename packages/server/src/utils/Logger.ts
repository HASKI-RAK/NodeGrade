/* eslint-disable immutable/no-mutation */
import { ILogObj, Logger as Log } from 'tslog'
class Logger {
  private static _instance: Logger
  public log: Log<ILogObj> = new Log()

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger._instance) {
      Logger._instance = new Logger()
    }
    return Logger._instance
  }
}

export default Logger
