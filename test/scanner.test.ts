import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import path from "node:path";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  appendFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  createReadStream: vi.fn(),
}));

import { readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import {
  scanDirectory,
  readFileByChunks,
  normalizePath,
  FileScannerError,
} from "../src/scanner.js";

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockCreateReadStream = vi.mocked(createReadStream);

function mockDirent(name: string, isDir: boolean) {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  } as import("node:fs").Dirent;
}

function mockStats(size: number, mtime: string) {
  return {
    size,
    mtime: new Date(mtime),
  } as import("node:fs").Stats;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("normalizePath", () => {
  const isWin = process.platform === "win32";

  it("preserve already normalized absolute path", () => {
    const input = isWin ? "C:\\foo\\bar" : "/foo/bar";
    expect(normalizePath(input)).toBe(path.normalize(input));
  });

  it("convert forward slashes on Windows", () => {
    if (isWin) {
      expect(normalizePath("C:/foo/bar")).toBe("C:\\foo\\bar");
    }
  });

  it("preserve UNC path on Windows", () => {
    if (isWin) {
      const unc = "\\\\server\\share\\path";
      expect(normalizePath(unc)).toBe(path.normalize(unc));
    }
  });

  it("handle relative path with mixed separators", () => {
    if (isWin) {
      expect(normalizePath("./foo/bar\\baz")).toBe("foo\\bar\\baz");
    } else {
      expect(normalizePath("./foo/bar\\baz")).toBe("./foo/bar\\baz");
    }
  });
});

describe("scanDirectory", () => {
  it("return FileInfo array for a valid directory", async () => {
    mockReaddir.mockResolvedValue([
      mockDirent("file1.txt", false),
      mockDirent("subdir", true),
    ] as import("node:fs").Dirent[]);

    mockStat
      .mockResolvedValueOnce(mockStats(100, "2025-01-01"))
      .mockResolvedValueOnce(mockStats(0, "2025-01-02"));

    const files = await scanDirectory("/some/dir");

    expect(files).toHaveLength(2);
    expect(files[0]!.name).toBe("file1.txt");
    expect(files[0]!.size).toBe(100);
    expect(files[0]!.isFile).toBe(true);
    expect(files[0]!.isDirectory).toBe(false);
    expect(files[1]!.name).toBe("subdir");
    expect(files[1]!.isDirectory).toBe(true);
  });

  it("return empty array for empty directory", async () => {
    mockReaddir.mockResolvedValue([]);
    const files = await scanDirectory("/empty/dir");
    expect(files).toEqual([]);
  });

  it("throw FileScannerError when directory not found", async () => {
    const enoent = new Error("ENOENT");
    (enoent as NodeJS.ErrnoException).code = "ENOENT";
    mockReaddir.mockRejectedValue(enoent);

    await expect(scanDirectory("/nonexistent")).rejects.toThrow(
      FileScannerError,
    );
  });
});

describe("readFileByChunks", () => {
  it("yield chunks from a readable stream", async () => {
    let pushCount = 0;
    const mockStream = new Readable({
      read() {
        if (pushCount === 0) {
          pushCount++;
          this.push(Buffer.from("part1"));
        } else if (pushCount === 1) {
          pushCount++;
          this.push(Buffer.from("part2"));
        } else {
          this.push(null);
        }
      },
    });
    mockCreateReadStream.mockReturnValue(mockStream as never);

    const chunks: Buffer[] = [];
    for await (const chunk of readFileByChunks("/some/file.txt", 16)) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.toString()).toBe("part1");
    expect(chunks[1]!.toString()).toBe("part2");
    expect(mockCreateReadStream).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ highWaterMark: 16 }),
    );
  });

  it("throw FileScannerError on stream error", async () => {
    const mockStream = new Readable({
      read() {
        this.destroy(new Error("disk failure"));
      },
    });
    mockCreateReadStream.mockReturnValue(mockStream as never);

    const gen = readFileByChunks("/bad/file.txt");
    await expect(gen.next()).rejects.toThrow(FileScannerError);
  });
});
