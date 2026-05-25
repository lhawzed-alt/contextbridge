import { UiServer } from "./server.js";
import { checkForUpdate, CURRENT_VERSION, GITHUB_REPO } from "../update-checker.js";

const configPath = process.env.CONTEXTBRIDGE_CONFIG ?? "./mcp-servers.json";
const port = parseInt(process.env.CONTEXTBRIDGE_PORT ?? "3721", 10);

const server = new UiServer(configPath, port);
await server.start();
console.log(`ContextBridge UI → http://localhost:${port}`);
console.log(`Version ${CURRENT_VERSION} · Report bugs → https://github.com/${GITHUB_REPO}/issues`);

checkForUpdate().then((info) => {
  if (info) {
    console.log(`✨ New version v${info.latest} available! Download: ${info.url}`);
  }
});
