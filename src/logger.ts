import { appendFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

export type LogLevel = "info" | "warn" | "error";

export class Logger {
  private path: string;

  constructor(logDir?: string) {
    const dir = logDir ?? process.cwd();
    this.path = join(dir, "contextbridge.log");
    mkdir(dir, { recursive: true }).catch(() => {});
  }

  private async write(level: LogLevel, msg: string): Promise<void> {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.toUpperCase()}] ${msg}\n`;
    try {
      await appendFile(this.path, line, "utf-8");
    } catch {
      // Logger must never throw — silent discard
    }
  }

  info(msg: string): void { this.write("info", msg); }
  warn(msg: string): void { this.write("warn", msg); }
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `${msg} — ${err.message}` : msg;
    this.write("error", detail);
  }
}
