import { UiServer } from "./server.js";
import { McpBridgeServer } from "../mcp.js";
import { checkForUpdate, CURRENT_VERSION, GITHUB_REPO } from "../update-checker.js";

const configPath = process.env.CONTEXTBRIDGE_CONFIG ?? "./mcp-servers.json";
const port = parseInt(process.env.CONTEXTBRIDGE_PORT ?? "3721", 10);

const mcpServer = new McpBridgeServer(configPath);
mcpServer.start().catch((err) => {
  console.error("[MCP] Failed to start:", err);
});

const uiServer = new UiServer(configPath, port);
uiServer.start()
  .then(() => {
    console.log(`ContextBridge UI → http://localhost:${port}`);
  })
  .catch((err) => {
    console.error(`[UI] Failed to start on port ${port}:`, err);
  });

console.log(`ContextBridge v${CURRENT_VERSION} · Report bugs → https://github.com/${GITHUB_REPO}/issues`);

checkForUpdate().then((info) => {
  if (info) {
    console.log(`✨ New version v${info.latest} available! Download: ${info.url}`);
  }
});
