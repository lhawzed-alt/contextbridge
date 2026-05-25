import { UiServer } from "./server.js";
import { checkForUpdate, CURRENT_VERSION, GITHUB_REPO } from "../update-checker.js";

const configPath = process.env.CONTEXTBRIDGE_CONFIG ?? "./mcp-servers.json";
const port = parseInt(process.env.CONTEXTBRIDGE_PORT ?? "3721", 10);

const server = new UiServer(configPath, port);
await server.start();

checkForUpdate()