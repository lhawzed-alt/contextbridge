import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { ConfigManager, type McpServerConfig } from "../config.js";
import { scanDirectory } from "../scanner.js";
import { Logger } from "../logger.js";
import { checkForUpdate, CURRENT_VERSION } from "../update-checker.js";
import { INDEX_HTML } from "./_html.js";

const log = new Logger();

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

function parseJsonBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export class UiServer {
  private server: http.Server;
  private configManager: ConfigManager;

  constructor(
    configPath: string,
    private port: number,
  ) {
    this.configManager = new ConfigManager(configPath);
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        log.info(`UI server started on port ${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    this.server.close();
    log.info("UI server stopped");
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      await this.route(req, res);
    } catch (err) {
      log.error(`Unhandled error in UI server`, err);
      sendJson(res, 500, { error: err instanceof Error ? err.message : "Internal error" });
    }
  }

  private async route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/api/servers") {
      const servers = await this.configManager.listServers();
      sendJson(res, 200, servers);
      return;
    }

    if (method === "POST" && url.pathname === "/api/servers") {
      const raw = await readBody(req);
      const body = parseJsonBody(raw) as McpServerConfig | undefined;
      if (!body || typeof body.name !== "string") {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      await this.configManager.addServer(body);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (method === "DELETE" && url.pathname.startsWith("/api/servers/")) {
      const name = decodeURIComponent(url.pathname.slice("/api/servers/".length));
      await this.configManager.removeServer(name);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/api/scan") {
      const raw = await readBody(req);
      const body = parseJsonBody(raw) as { path: string } | undefined;
      if (!body || typeof body.path !== "string") {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      const files = await scanDirectory(body.path);
      sendJson(res, 200, files);
      return;
    }

    if (method === "GET" && url.pathname === "/api/version-check") {
      const info = await checkForUpdate();
      sendJson(res, 200, { current: CURRENT_VERSION, update: info });
      return;
    }

    if (method === "POST" && url.pathname === "/api/sync") {
      const data = await this.configManager.load();
      const globalPath = join(
        process.env.APPDATA
          ? join(process.env.APPDATA, "ContextBridge")
          : join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".contextbridge"),
        "mcp-servers.json",
      );
      const { ConfigManager: GlobalConfig } = await import("../config.js");
      const globalMgr = new GlobalConfig(globalPath);
      await globalMgr.save(data);
      sendJson(res, 200, { ok: true, path: globalPath });
      return;
    }

    if (method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(INDEX_HTML);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  }
}
