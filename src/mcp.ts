import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ConfigManager, type McpServerConfig, ConfigError } from "./config.js";
import { scanDirectory, FileScannerError } from "./scanner.js";
import { Logger } from "./logger.js";

const log = new Logger();

function errorResponse(msg: string): { content: { type: "text"; text: string }[]; isError: true } {
  return { content: [{ type: "text", text: msg }], isError: true };
}

function okText(text: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text }] };
}

export class McpBridgeServer {
  private mcpServer: McpServer;
  private configManager: ConfigManager;

  constructor(configPath: string, serverInfo?: { name: string; version: string }) {
    this.configManager = new ConfigManager(configPath);
    this.mcpServer = new McpServer({
      name: serverInfo?.name ?? "ContextBridge",
      version: serverInfo?.version ?? "1.0.0",
    });
    this.registerTools();
    this.registerResources();
  }

  private registerTools(): void {
    this.mcpServer.tool(
      "list_servers",
      "List all configured MCP servers",
      {},
      async () => {
        try {
          const servers = await this.configManager.listServers();
          return okText(JSON.stringify(servers, null, 2));
        } catch (e) {
          log.error("list_servers failed", e);
          return errorResponse(
            e instanceof ConfigError
              ? e.message
              : "Failed to list servers",
          );
        }
      },
    );

    this.mcpServer.tool(
      "add_server",
      "Add a new MCP server configuration",
      {
        name: z.string().min(1),
        command: z.string().min(1),
        args: z.array(z.string()),
        env: z.record(z.string(), z.string()).optional(),
      },
      async ({ name, command, args, env }) => {
        try {
          const server: McpServerConfig = { name, command, args, ...(env !== undefined ? { env } : {}) };
          await this.configManager.addServer(server);
          return okText(`Server "${name}" added`);
        } catch (e) {
          log.error("add_server failed", e);
          return errorResponse(
            e instanceof ConfigError
              ? e.message
              : "Failed to add server",
          );
        }
      },
    );

    this.mcpServer.tool(
      "remove_server",
      "Remove an MCP server by name",
      { name: z.string().min(1) },
      async ({ name }) => {
        try {
          await this.configManager.removeServer(name);
          return okText(`Server "${name}" removed`);
        } catch (e) {
          log.error("remove_server failed", e);
          return errorResponse(
            e instanceof ConfigError
              ? e.message
              : "Failed to remove server",
          );
        }
      },
    );

    this.mcpServer.tool(
      "scan_directory",
      "Scan a directory for files and folders",
      { path: z.string().min(1) },
      async ({ path }) => {
        try {
          const entries = await scanDirectory(path);
          return okText(JSON.stringify(entries, null, 2));
        } catch (e) {
          log.error("scan_directory failed", e);
          return errorResponse(
            e instanceof FileScannerError
              ? e.message
              : "Failed to scan directory",
          );
        }
      },
    );
  }

  private registerResources(): void {
    this.mcpServer.resource(
      "servers",
      "config://servers",
      async () => {
        try {
          const servers = await this.configManager.listServers();
          return {
            contents: [
              {
                uri: "config://servers",
                mimeType: "application/json",
                text: JSON.stringify(servers, null, 2),
              },
            ],
          };
        } catch (e) {
          log.error("config://servers resource failed", e);
          return {
            contents: [
              {
                uri: "config://servers",
                mimeType: "application/json",
                text: JSON.stringify({ error: "Failed to load config" }, null, 2),
              },
            ],
          };
        }
      },
    );
  }

  async start(): Promise<void> {
    process.on("uncaughtException", (err) => {
      log.error("Uncaught exception", err);
    });
    process.on("unhandledRejection", (reason) => {
      log.error("Unhandled rejection", reason);
    });

    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }
}
