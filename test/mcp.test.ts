import { describe, it, expect, vi, beforeEach } from "vitest";

const { toolHandlers, mockLoad, mockAddServer, mockRemoveServer, mockScanDirectory, mockClasses } =
  vi.hoisted(() => {
    class MockConfigError extends Error {
      constructor(message: string, filePath?: string, cause?: unknown) {
        super(message);
        this.name = "ConfigError";
      }
    }
    class MockFileScannerError extends Error {
      constructor(message: string, path?: string, cause?: unknown) {
        super(message);
        this.name = "FileScannerError";
      }
    }
    return {
      toolHandlers: {} as Record<string, Function>,
      mockLoad: vi.fn(),
      mockAddServer: vi.fn(),
      mockRemoveServer: vi.fn(),
      mockScanDirectory: vi.fn(),
      mockClasses: { MockConfigError, MockFileScannerError },
    };
  });

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: vi.fn(function () {
    return {
      tool: vi.fn((name: string, ...args: unknown[]) => {
        const cb = args[args.length - 1] as Function;
        toolHandlers[name] = cb;
      }),
      resource: vi.fn(),
      connect: vi.fn(),
    };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock("../src/config.js", () => ({
  ConfigManager: vi.fn(function () {
    return {
      load: mockLoad,
      addServer: mockAddServer,
      removeServer: mockRemoveServer,
    };
  }),
  ConfigError: mockClasses.MockConfigError,
}));

vi.mock("../src/scanner.js", () => ({
  scanDirectory: mockScanDirectory,
  FileScannerError: mockClasses.MockFileScannerError,
}));

import { McpBridgeServer } from "../src/mcp.js";

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(toolHandlers).forEach((k) => delete toolHandlers[k]);
});

describe("McpBridgeServer", () => {
  it("register 4 tools on construction", () => {
    new McpBridgeServer("config.json");
    expect(Object.keys(toolHandlers)).toEqual([
      "list_servers",
      "add_server",
      "remove_server",
      "scan_directory",
    ]);
  });

  describe("tool response format (CallToolResult)", () => {
    it("list_servers returns content with text", async () => {
      mockLoad.mockResolvedValue({
        servers: [{ name: "s1", command: "node", args: [] }],
      });
      new McpBridgeServer("config.json");
      const result = await toolHandlers["list_servers"]();
      expect(result).toHaveProperty("content");
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty("type", "text");
      expect(typeof result.content[0].text).toBe("string");
    });

    it("add_server returns confirmation message", async () => {
      mockAddServer.mockResolvedValue(undefined);
      new McpBridgeServer("config.json");
      const result = await toolHandlers["add_server"]({
        name: "my-server",
        command: "node",
        args: ["index.js"],
      });
      expect(result).toHaveProperty("content");
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("my-server");
    });

    it("remove_server returns confirmation message", async () => {
      mockRemoveServer.mockResolvedValue(undefined);
      new McpBridgeServer("config.json");
      const result = await toolHandlers["remove_server"]({
        name: "old-server",
      });
      expect(result).toHaveProperty("content");
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("old-server");
    });

    it("scan_directory returns file list as text", async () => {
      mockScanDirectory.mockResolvedValue([
        {
          name: "readme.md",
          absolutePath: "/fake/readme.md",
          size: 100,
          isDirectory: false,
          isFile: true,
          modifiedAt: new Date(),
        },
      ]);
      new McpBridgeServer("config.json");
      const result = await toolHandlers["scan_directory"]({
        path: "/some/dir",
      });
      expect(result).toHaveProperty("content");
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("readme.md");
    });
  });

  describe("MCP 错误传播 isError: true", () => {
    it("list_servers returns isError when ConfigError thrown", async () => {
      mockLoad.mockRejectedValue(
        Object.assign(new Error("Permission denied reading config file"), { name: "ConfigError" }),
      );
      new McpBridgeServer("config.json");
      const result = await toolHandlers["list_servers"]();
      expect(result.isError).toBe(true);
    });

    it("list_servers returns isError with generic message on unknown error", async () => {
      mockLoad.mockRejectedValue(new Error("Something broke"));
      new McpBridgeServer("config.json");
      const result = await toolHandlers["list_servers"]();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Failed to list servers");
    });

    it("add_server returns isError when ConfigError thrown", async () => {
      mockAddServer.mockRejectedValue(
        Object.assign(new Error("Permission denied writing config file"), { name: "ConfigError" }),
      );
      new McpBridgeServer("config.json");
      const result = await toolHandlers["add_server"]({
        name: "my-server",
        command: "node",
        args: [],
      });
      expect(result.isError).toBe(true);
    });

    it("remove_server returns isError when ConfigError thrown", async () => {
      mockRemoveServer.mockRejectedValue(
        Object.assign(new Error("File locked or unavailable"), { name: "ConfigError" }),
      );
      new McpBridgeServer("config.json");
      const result = await toolHandlers["remove_server"]({
        name: "old-server",
      });
      expect(result.isError).toBe(true);
    });

    it("scan_directory returns isError when FileScannerError thrown", async () => {
      mockScanDirectory.mockRejectedValue(
        Object.assign(new Error("Network drive unavailable or disconnected"), { name: "FileScannerError" }),
      );
      new McpBridgeServer("config.json");
      const result = await toolHandlers["scan_directory"]({
        path: "\\\\server\\share",
      });
      expect(result.isError).toBe(true);
    });

    it("scan_directory returns isError with generic message on unknown error", async () => {
      mockScanDirectory.mockRejectedValue(new Error("Random failure"));
      new McpBridgeServer("config.json");
      const result = await toolHandlers["scan_directory"]({
        path: "/some/path",
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Failed to scan directory");
    });
  });
});
