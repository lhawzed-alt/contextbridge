import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDataChunks: string[] = [];
const mockDataHandlers: Array<(chunk: Buffer) => void> = [];
const mockEndHandlers: Array<() => void> = [];
const mockErrorHandlers: Array<() => void> = [];
let mockStatusCode = 200;
let mockReqErrorHandler: (() => void) | null = null;

vi.mock("node:https", () => {
  const mockRes = {
    set statusCode(v: number) { mockStatusCode = v; },
    get statusCode() { return mockStatusCode; },
    on(event: string, handler: (...args: any[]) => void) {
      if (event === "data") mockDataHandlers.push(handler);
      if (event === "end") mockEndHandlers.push(handler);
      if (event === "error") mockErrorHandlers.push(handler);
      return mockRes;
    },
  };
  const mockReq = {
    on(event: string, handler: () => void) {
      if (event === "error") mockReqErrorHandler = handler;
      return mockReq;
    },
  };
  const httpsGet = vi.fn((_url: string, _opts: unknown, callback: (res: typeof mockRes) => void) => {
    callback(mockRes);
    return mockReq;
  });
  return { default: { get: httpsGet }, get: httpsGet };
});

function flushBody(body: string): void {
  const raw = Buffer.from(body, "utf-8");
  for (const h of mockDataHandlers) h(raw);
  for (const h of mockEndHandlers) h();
}

function flushNetworkError(): void {
  if (mockReqErrorHandler) mockReqErrorHandler();
}

function flushResponseError(): void {
  for (const h of mockErrorHandlers) h();
}

beforeEach(() => {
  mockStatusCode = 200;
  mockDataHandlers.length = 0;
  mockEndHandlers.length = 0;
  mockErrorHandlers.length = 0;
  mockReqErrorHandler = null;
});

import { checkForUpdate, compareVersions, CURRENT_VERSION } from "../src/update-checker.js";

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });

  it("returns -1 when a < b", () => {
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
    expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
    expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
  });

  it("returns 1 when a > b", () => {
    expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
  });

  it("handles different segment lengths", () => {
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.1", "1.0")).toBe(1);
  });
});

describe("checkForUpdate", () => {
  it("returns UpdateInfo when a newer version is available", async () => {
    const p = checkForUpdate();
    flushBody(JSON.stringify({ tag_name: "v1.0.1" }));
    const result = await p;
    expect(result).toEqual({
      latest: "1.0.1",
      url: "https://github.com/your-username/contextbridge/releases/tag/v1.0.1",
    });
  });

  it("returns null when current version matches latest", async () => {
    const p = checkForUpdate();
    flushBody(JSON.stringify({ tag_name: `v${CURRENT_VERSION}` }));
    const result = await p;
    expect(result).toBeNull();
  });

  it("returns null when current version is newer than latest", async () => {
    const p = checkForUpdate();
    flushBody(JSON.stringify({ tag_name: "v0.9.0" }));
    const result = await p;
    expect(result).toBeNull();
  });

  it("returns null on non-200 status code", async () => {
    mockStatusCode = 404;
    const p = checkForUpdate();
    flushBody(JSON.stringify({ message: "Not found" }));
    const result = await p;
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    const p = checkForUpdate();
    flushNetworkError();
    const result = await p;
    expect(result).toBeNull();
  });

  it("returns null on response stream error", async () => {
    const p = checkForUpdate();
    flushResponseError();
    const result = await p;
    expect(result).toBeNull();
  });

  it("returns null when response body has no tag_name", async () => {
    const p = checkForUpdate();
    flushBody(JSON.stringify({}));
    const result = await p;
    expect(result).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    const p = checkForUpdate();
    flushBody("not json");
    const result = await p;
    expect(result).toBeNull();
  });
});
