import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockListServers, mockAddServer, mockRemoveServer, mockLoad, mockSave, mockScanDir } =
  vi.hoisted(() => ({
    mockListServers: vi.fn(),
    mockAddServer: vi.fn(),
    mockRemoveServer: vi.fn(),
    mockLoad: vi.fn(),
    mockSave: vi.fn(),
    mockScanDir: vi.fn(),
  }));

vi.mock("../src/config.js", () => ({
  ConfigManager: vi.fn(function () {
    return {
      listServers: mockListServers,
      addServer: mockAddServer,
      removeServer: mockRemoveServer,
      load: mockLoad,
      save: mockSave,
    };
  }),
}));

vi.mock("../src/scanner.js", () => ({
  scanDirectory: mockScanDir,
}));

import { UiServer } from "../src/ui/server.js";

describe("UiServer REST API", () => {
  let server: UiServer;
  let port: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = new UiServer("test-config.json", 0);
    await server.start();
    const addr = (server as unknown as { server: { address: () => { port: number } } }).server.address() as { port: number };
    port = addr.port;
  });

  afterEach(() => {
    server.stop();
  });

  it("GET /api/servers — listServers called and returns JSON", async () => {
    mockListServers.mockResolvedValue([
      { name: "s1", command: "node", args: ["app.js"] },
    ]);
    const res = await fetch(`http://localhost:${port}/api/servers`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0]!.name).toBe("s1");
    expect(mockListServers).toHaveBeenCalledOnce();
  });

  it("POST /api/servers — addServer with parsed request body", async () => {
    mockAddServer.mockResolvedValue(undefined);
    const body = { name: "my-srv", command: "npx", args: ["tsx", "index.ts"] };
    const res = await fetch(`http://localhost:${port}/api/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(201);
    expect(mockAddServer).toHaveBeenCalledWith(body);
    expect(mockAddServer).toHaveBeenCalledOnce();
  });

  it("DELETE /api/servers/:name — removeServer with extracted name", async () => {
    mockRemoveServer.mockResolvedValue(undefined);
    const res = await fetch(`http://localhost:${port}/api/servers/test-name`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    expect(mockRemoveServer).toHaveBeenCalledWith("test-name");
    expect(mockRemoveServer).toHaveBeenCalledOnce();
  });

  it("DELETE /api/servers/:name — url-decoded name", async () => {
    mockRemoveServer.mockResolvedValue(undefined);
    await fetch(`http://localhost:${port}/api/servers/My%20Server`, {
      method: "DELETE",
    });
    expect(mockRemoveServer).toHaveBeenCalledWith("My Server");
  });

  it("POST /api/scan — scanDirectory with provided path", async () => {
    mockScanDir.mockResolvedValue([]);
    const res = await fetch(`http://localhost:${port}/api/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/home/user/projects" }),
    });
    expect(res.status).toBe(200);
    expect(mockScanDir).toHaveBeenCalledWith("/home/user/projects");
    expect(mockScanDir).toHaveBeenCalledOnce();
  });

  it("POST /api/sync — load config and save to global path", async () => {
    const configData = { servers: [{ name: "s1", command: "node", args: [] }] };
    mockLoad.mockResolvedValue(configData);
    mockSave.mockResolvedValue(undefined);
    const res = await fetch(`http://localhost:${port}/api/sync`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockLoad).toHaveBeenCalledOnce();
  });

  it("GET / — returns index.html", async () => {
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("ContextBridge");
  });

  it("404 for unknown routes", async () => {
    const res = await fetch(`http://localhost:${port}/api/unknown`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
  });
});
