import { LoggerService } from '@nestjs/common';

export class StructuredLogger implements LoggerService {
  private write(level: string, message: unknown, context?: string, trace?: string) {
    process.stdout.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      context,
      message: typeof message === 'string' ? message : String(message),
      trace,
    })}\n`);
  }

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }
}
