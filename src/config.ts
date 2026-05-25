import { readFile, writeFile } from "node:fs/promises";
import { Logger } from "./logger.js";

const log = new Logger();

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ConfigData {
  servers: McpServerConfig[];
}

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

function isErrno(e: unknown, code: string): boolean {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === code;
}

export class ConfigManager {
  constructor(private readonly filePath: string) {}

  async load(): Promise<ConfigData> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object") {
        return { servers: [] };
      }
      const data = parsed as Partial<ConfigData>;
      return { servers: Array.isArray(data.servers) ? data.servers : [] };
    } catch (e) {
      if (isErrno(e, "ENOENT")) {
        return { servers: [] };
      }
      if (e instanceof SyntaxError) {
        throw new ConfigError(
          `JSON parse error in config file`,
          this.filePath,
          e,
        );
      }
      if (isErrno(e, "EACCES")) {
        throw new ConfigError(
          `Permission denied reading config file`,
          this.filePath,
          e,
        );
      }
      if (isErrno(e, "EIO")) {
        throw new ConfigError(
          `I/O error reading config file (disk or network drive may be offline)`,
          this.filePath,
          e,
        );
      }
      throw new ConfigError(
        `Failed to read config file`,
        this.filePath,
        e,
      );
    }
  }

  async save(data: ConfigData): Promise<void> {
    try {
      await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
      if (isErrno(e, "EACCES")) {
        log.error(`Permission denied writing config: ${this.filePath}`, e);
        throw new ConfigError(
          `Permission denied writing config file`,
          this.filePath,
          e,
        );
      }
      if (isErrno(e, "EBUSY") || isErrno(e, "EIO")) {
        log.warn(`File busy/IO error, retrying once: ${this.filePath}`);
        try {
          await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
          return;
        } catch (retryErr) {
          throw new ConfigError(
            `File locked or unavailable (retry failed)`,
            this.filePath,
            retryErr,
          );
        }
      }
      throw new ConfigError(
        `Failed to write config file`,
        this.filePath,
        e,
      );
    }
  }

  async addServer(server: McpServerConfig): Promise<void> {
    const data = await this.load();
    data.servers.push(server);
    await this.save(data);
    log.info(`Server added: ${server.name}`);
  }

  async removeServer(name: string): Promise<void> {
    const data = await this.load();
    data.servers = data.servers.filter((s) => s.name !== name);
    await this.save(data);
    log.info(`Server removed: ${name}`);
  }

  async getServer(name: string): Promise<McpServerConfig | undefined> {
    const data = await this.load();
    return data.servers.find((s) => s.name === name);
  }

  async listServers(): Promise<McpServerConfig[]> {
    const data = await this.load();
    return data.servers;
  }
}
