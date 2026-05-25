import { readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { normalize, sep } from "node:path";
import { Logger } from "./logger.js";

const log = new Logger();

const MAX_PATH_LENGTH = 4096;

export interface FileInfo {
  name: string;
  absolutePath: string;
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  modifiedAt: Date;
}

export class FileScannerError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FileScannerError";
  }
}

function isErrno(e: unknown, code: string): boolean {
  return e instanceof Error && (e as NodeJS.ErrnoException).code === code;
}

function isValidPath(input: string): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  if (input.length > MAX_PATH_LENGTH) return false;
  if (/[\0]/.test(input)) return false;
  return true;
}

function isUncPath(input: string): boolean {
  return input.startsWith("\\\\");
}

export function normalizePath(input: string): string {
  if (!isValidPath(input)) {
    throw new FileScannerError(
      `Invalid or malformed path`,
      input,
    );
  }
  const normalized = normalize(input);
  if (sep === "\\" && normalized.includes("/")) {
    return normalized.replace(/\//g, "\\");
  }
  return normalized;
}

async function scanWithTimeout(
  dirPath: string,
  timeoutMs = 15000,
): Promise<{ dirent: import("node:fs").Dirent }[]> {
  const scanPromise = readdir(dirPath, { withFileTypes: true });

  if (!isUncPath(dirPath)) {
    const entries = await scanPromise;
    return entries.map((dirent) => ({ dirent }));
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new FileScannerError("UNC path timeout", dirPath)),
      timeoutMs,
    ),
  );
  const entries = (await Promise.race([scanPromise, timeout])) as import("node:fs").Dirent[];
  return entries.map((dirent) => ({ dirent }));
}

export async function scanDirectory(dirPath: string): Promise<FileInfo[]> {
  if (!isValidPath(dirPath)) {
    throw new FileScannerError(
      `Invalid or malformed path`,
      dirPath,
    );
  }

  try {
    const entries = await scanWithTimeout(dirPath);
    const results: FileInfo[] = [];

    for (const { dirent } of entries) {
      const fullPath = normalizePath(`${dirPath}\\${dirent.name}`);
      try {
        const s = await stat(fullPath);
        results.push({
          name: dirent.name,
          absolutePath: fullPath,
          size: s.size,
          isDirectory: dirent.isDirectory(),
          isFile: dirent.isFile(),
          modifiedAt: s.mtime,
        });
      } catch (statErr) {
        log.warn(`Cannot stat entry ${fullPath} — skipping`);
      }
    }

    return results;
  } catch (e) {
    if (e instanceof FileScannerError) throw e;
    if (isErrno(e, "ENOENT")) {
      throw new FileScannerError(`Directory not found`, dirPath, e);
    }
    if (isErrno(e, "EACCES")) {
      log.error(`Permission denied scanning directory: ${dirPath}`, e);
      throw new FileScannerError(
        `Permission denied scanning directory`,
        dirPath,
        e,
      );
    }
    if (isErrno(e, "ENETUNREACH") || isErrno(e, "ECONNRESET") || isErrno(e, "EIO")) {
      log.error(`Network drive unavailable: ${dirPath}`, e);
      throw new FileScannerError(
        `Network drive unavailable or disconnected`,
        dirPath,
        e,
      );
    }
    throw new FileScannerError(
      `Failed to scan directory`,
      dirPath,
      e,
    );
  }
}

export async function* readFileByChunks(
  filePath: string,
  chunkSize = 65536,
): AsyncGenerator<Buffer> {
  if (!isValidPath(filePath)) {
    throw new FileScannerError(`Invalid or malformed path`, filePath);
  }

  const stream = createReadStream(filePath, {
    highWaterMark: chunkSize,
  });

  try {
    for await (const chunk of stream) {
      yield chunk as Buffer;
    }
  } catch (e) {
    if (isErrno(e, "ENOENT")) {
      throw new FileScannerError(`File not found`, filePath, e);
    }
    if (isErrno(e, "EACCES")) {
      throw new FileScannerError(
        `Permission denied reading file`,
        filePath,
        e,
      );
    }
    if (isErrno(e, "EIO")) {
      throw new FileScannerError(
        `I/O error reading file (drive may be offline)`,
        filePath,
        e,
      );
    }
    throw new FileScannerError(`Failed to read file`, filePath, e);
  }
}
