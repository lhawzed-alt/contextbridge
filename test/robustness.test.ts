import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  appendFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:fs", () => ({
  createReadStream: vi.fn(),
}));

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { ConfigManager, ConfigError } from "../src/config.js";
import {
  scanDirectory,
  readFileByChunks,
  normalizePath,
  FileScannerError,
} from "../src/scanner.js";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
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

// ─── ConfigManager 健壮性 ───────────────────────────────────────

describe("ConfigManager 健壮性", () => {
  const testPath = "config.json";
  const validConfig = {
    servers: [{ name: "test", command: "node", args: ["app.js"] }],
  };

  describe("load() 权限与IO错误", () => {
    it("EACCES → ConfigError", async () => {
      const e = new Error("EACCES");
      (e as NodeJS.ErrnoException).code = "EACCES";
      mockReadFile.mockRejectedValue(e);
      const mgr = new ConfigManager(testPath);
      await expect(mgr.load()).rejects.toThrow(ConfigError);
      await expect(mgr.load()).rejects.toMatchObject({
        message: expect.stringContaining("Permission denied"),
        filePath: testPath,
      });
    });

    it("EIO → ConfigError with drive offline message", async () => {
      const e = new Error("EIO");
      (e as NodeJS.ErrnoException).code = "EIO";
      mockReadFile.mockRejectedValue(e);
      const mgr = new ConfigManager(testPath);
      await expect(mgr.load()).rejects.toThrow(ConfigError);
      await expect(mgr.load()).rejects.toMatchObject({
        message: expect.stringContaining("I/O error"),
      });
    });
  });

  describe("save() 重试与错误", () => {
    it("EBUSY → retry once, succeed on retry", async () => {
      const ebusy = new Error("EBUSY");
      (ebusy as NodeJS.ErrnoException).code = "EBUSY";
      mockWriteFile
        .mockRejectedValueOnce(ebusy)
        .mockResolvedValueOnce(undefined);
      const mgr = new ConfigManager(testPath);
      await mgr.save(validConfig);
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });

    it("EBUSY → retry once, throw ConfigError on second failure", async () => {
      const ebusy = new Error("EBUSY");
      (ebusy as NodeJS.ErrnoException).code = "EBUSY";
      mockWriteFile.mockRejectedValue(ebusy);
      const mgr = new ConfigManager(testPath);
      await expect(mgr.save(validConfig)).rejects.toThrow(ConfigError);
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });

    it("EIO → retry once, throw ConfigError", async () => {
      const eio = new Error("EIO");
      (eio as NodeJS.ErrnoException).code = "EIO";
      mockWriteFile.mockRejectedValue(eio);
      const mgr = new ConfigManager(testPath);
      await expect(mgr.save(validConfig)).rejects.toThrow(ConfigError);
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });

    it("EACCES → ConfigError (no retry)", async () => {
      const e = new Error("EACCES");
      (e as NodeJS.ErrnoException).code = "EACCES";
      mockWriteFile.mockRejectedValue(e);
      const mgr = new ConfigManager(testPath);
      await expect(mgr.save(validConfig)).rejects.toThrow(ConfigError);
      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── Scanner 健壮性 ─────────────────────────────────────────────

describe("Scanner 健壮性", () => {
  describe("normalizePath 极端路径过滤", () => {
    it("空字符串 → FileScannerError", () => {
      expect(() => normalizePath("")).toThrow(FileScannerError);
    });

    it("包含 null 字符 → FileScannerError", () => {
      expect(() => normalizePath("/valid\0path")).toThrow(FileScannerError);
    });

    it("超长路径 → FileScannerError", () => {
      const longPath = "/" + "a".repeat(5000);
      expect(() => normalizePath(longPath)).toThrow(FileScannerError);
    });
  });

  describe("scanDirectory 极端路径", () => {
    it("空路径 → FileScannerError", async () => {
      await expect(scanDirectory("")).rejects.toThrow(FileScannerError);
    });

    it("null 字符路径 → FileScannerError", async () => {
      await expect(scanDirectory("/good\0bad")).rejects.toThrow(FileScannerError);
    });

    it("超长路径 → FileScannerError", async () => {
      await expect(scanDirectory("/" + "a".repeat(5000))).rejects.toThrow(FileScannerError);
    });
  });

  describe("scanDirectory 系统错误码", () => {
    it("EACCES → FileScannerError", async () => {
      const e = new Error("EACCES");
      (e as NodeJS.ErrnoException).code = "EACCES";
      mockReaddir.mockRejectedValue(e);
      await expect(scanDirectory("/restricted")).rejects.toThrow(FileScannerError);
      await expect(scanDirectory("/restricted")).rejects.toMatchObject({
        message: expect.stringContaining("Permission denied"),
      });
    });

    it("ENETUNREACH → FileScannerError with network message", async () => {
      const e = new Error("ENETUNREACH");
      (e as NodeJS.ErrnoException).code = "ENETUNREACH";
      mockReaddir.mockRejectedValue(e);
      await expect(scanDirectory("\\\\server\\share")).rejects.toThrow(FileScannerError);
      await expect(scanDirectory("\\\\server\\share")).rejects.toMatchObject({
        message: expect.stringContaining("Network drive"),
      });
    });

    it("ECONNRESET → FileScannerError with network message", async () => {
      const e = new Error("ECONNRESET");
      (e as NodeJS.ErrnoException).code = "ECONNRESET";
      mockReaddir.mockRejectedValue(e);
      await expect(scanDirectory("\\\\server\\share")).rejects.toThrow(FileScannerError);
      await expect(scanDirectory("\\\\server\\share")).rejects.toMatchObject({
        message: expect.stringContaining("Network drive"),
      });
    });

    it("EIO → FileScannerError with network message", async () => {
      const e = new Error("EIO");
      (e as NodeJS.ErrnoException).code = "EIO";
      mockReaddir.mockRejectedValue(e);
      await expect(scanDirectory("/some/path")).rejects.toThrow(FileScannerError);
      await expect(scanDirectory("/some/path")).rejects.toMatchObject({
        message: expect.stringContaining("Network drive"),
      });
    });
  });

  describe("scanDirectory stat 失败优雅跳过", () => {
    it("单个条目 stat 失败 → 跳过该条目, 不影响其他", async () => {
      mockReaddir.mockResolvedValue([
        mockDirent("good.txt", false),
        mockDirent("bad.txt", false),
        mockDirent("also-good.txt", false),
      ] as import("node:fs").Dirent[]);

      mockStat
        .mockResolvedValueOnce(mockStats(100, "2025-01-01"))
        .mockRejectedValueOnce(new Error("EACCES"))
        .mockResolvedValueOnce(mockStats(200, "2025-01-02"));

      const files = await scanDirectory("/some/dir");
      expect(files).toHaveLength(2);
      expect(files[0]!.name).toBe("good.txt");
      expect(files[1]!.name).toBe("also-good.txt");
    });

    it("所有条目 stat 失败 → 返回空数组", async () => {
      mockReaddir.mockResolvedValue([
        mockDirent("a.txt", false),
        mockDirent("b.txt", false),
      ] as import("node:fs").Dirent[]);

      mockStat
        .mockRejectedValueOnce(new Error("EACCES"))
        .mockRejectedValueOnce(new Error("EIO"));

      const files = await scanDirectory("/some/dir");
      expect(files).toEqual([]);
    });
  });

  describe("readFileByChunks 错误码", () => {
    function makeMockStream(errCode: string) {
      const err = new Error(errCode);
      (err as NodeJS.ErrnoException).code = errCode;
      return new Readable({
        read() {
          this.destroy(err);
        },
      });
    }

    it("ENOENT → FileScannerError", async () => {
      mockCreateReadStream.mockReturnValue(makeMockStream("ENOENT") as never);
      const gen = readFileByChunks("/notfound.txt");
      await expect(gen.next()).rejects.toThrow(FileScannerError);
    });

    it("EACCES → FileScannerError with permission message", async () => {
      mockCreateReadStream.mockReturnValue(makeMockStream("EACCES") as never);
      const gen = readFileByChunks("/restricted.txt");
      await expect(gen.next()).rejects.toThrow(FileScannerError);
    });

    it("EIO → FileScannerError with drive offline message", async () => {
      mockCreateReadStream.mockReturnValue(makeMockStream("EIO") as never);
      const gen = readFileByChunks("/offline.txt");
      await expect(gen.next()).rejects.toThrow(FileScannerError);
    });
  });
});
