import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { ConfigManager, ConfigError } from "../src/config.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  appendFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConfigManager", () => {
  const testPath = "config.json";
  const validConfig = {
    servers: [{ name: "test", command: "node", args: ["app.js"] }],
  };

  describe("正常读写", () => {
    it("load and parse valid JSON config", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(validConfig));
      const mgr = new ConfigManager(testPath);
      const data = await mgr.load();
      expect(data).toEqual(validConfig);
      expect(mockReadFile).toHaveBeenCalledWith(testPath, "utf-8");
    });

    it("save config data as formatted JSON", async () => {
      const mgr = new ConfigManager(testPath);
      await mgr.save(validConfig);
      expect(mockWriteFile).toHaveBeenCalledWith(
        testPath,
        JSON.stringify(validConfig, null, 2),
        "utf-8",
      );
    });

    it("add a server and persist", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(validConfig));
      const mgr = new ConfigManager(testPath);
      await mgr.addServer({ name: "new", command: "go", args: ["run"] });
      expect(mockWriteFile).toHaveBeenCalledWith(
        testPath,
        expect.stringContaining("new"),
        "utf-8",
      );
    });

    it("remove a server by name", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(validConfig));
      const mgr = new ConfigManager(testPath);
      await mgr.removeServer("test");
      expect(mockWriteFile).toHaveBeenCalledWith(
        testPath,
        expect.not.stringContaining("test"),
        "utf-8",
      );
    });

    it("get a server by name", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(validConfig));
      const mgr = new ConfigManager(testPath);
      const server = await mgr.getServer("test");
      expect(server).toEqual(validConfig.servers[0]);
    });

    it("list all servers", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(validConfig));
      const mgr = new ConfigManager(testPath);
      const servers = await mgr.listServers();
      expect(servers).toHaveLength(1);
    });
  });

  describe("文件不存在自动创建", () => {
    it("return empty config when file does not exist", async () => {
      const enoent = new Error("ENOENT");
      (enoent as NodeJS.ErrnoException).code = "ENOENT";
      mockReadFile.mockRejectedValue(enoent);
      const mgr = new ConfigManager(testPath);
      const data = await mgr.load();
      expect(data).toEqual({ servers: [] });
    });
  });

  describe("JSON损坏防崩溃", () => {
    it("throw ConfigError on malformed JSON", async () => {
      mockReadFile.mockResolvedValue("{invalid json}");
      const mgr = new ConfigManager(testPath);
      await expect(mgr.load()).rejects.toThrow(ConfigError);
    });

    it("include file path and parse error in ConfigError", async () => {
      mockReadFile.mockResolvedValue("{broken}");
      const mgr = new ConfigManager(testPath);
      try {
        await mgr.load();
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        expect((e as ConfigError).filePath).toBe(testPath);
        expect((e as ConfigError).cause).toBeInstanceOf(SyntaxError);
      }
    });

    it("handle null top-level gracefully", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(null));
      const mgr = new ConfigManager(testPath);
      const data = await mgr.load();
      expect(data).toEqual({ servers: [] });
    });

    it("handle missing servers field gracefully", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({}));
      const mgr = new ConfigManager(testPath);
      const data = await mgr.load();
      expect(data).toEqual({ servers: [] });
    });
  });
});
