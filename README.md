# ContextBridge

> **Feed your local files & network drives into AI agents — zero uploads, zero config, zero cloud.**

[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.2-000?logo=bun&logoColor=fff)](https://bun.sh)
[![MCP SDK](https://img.shields.io/badge/MCP%20Protocol-1.29-0A9396?logo=modelcontextprotocol&logoColor=fff)](https://modelcontextprotocol.io)
[![Vitest](https://img.shields.io/badge/Tests-60_✓-6B9F3A?logo=vitest&logoColor=fff)](https://vitest.dev)
[![License](https://img.shields.io/badge/License-MIT-8A2BE2)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-FF6B6B)](CONTRIBUTING.md)
[![Windows](https://img.shields.io/badge/Windows-x64-00A4EF?logo=windows&logoColor=fff)](https://github.com/your-username/contextbridge/releases)
[![Linux](https://img.shields.io/badge/Linux-x64-E95420?logo=linux&logoColor=fff)](https://github.com/your-username/contextbridge/releases)

---

## 🔥 The Pain

You're deep in **Vibe Coding** — Cursor, Trae, Claude Code — iterating at lightspeed. Then you hit the wall:

```
❌ "I need to read this 200MB log file"
❌ "Show me the project structure"
❌ "What's in that network share?"
❌ "Load my current MCP config"
```

Copy-paste loses context. Uploading to some cloud AI tool leaks your IP. Writing bespoke scripts every time is exhausting.

**ContextBridge is the on-ramp.** A single binary that exposes your local filesystem, network drives & MCP configs as native MCP tools — so your AI agent can just *reach in and grab what it needs*.

---

## ✨ What It Does

| | Feature | Why You Care |
|---|---|---|
| 🖥️ | **Web Dashboard** | Teal-themed UI at `localhost:3721` — manage servers, scan dirs, sync global config in clicks |
| ⚙️ | **MCP Protocol Native** | Full `tools/list`, `tools/call`, `resources/read` — works with **every** MCP host |
| 📂 | **Streaming File Scanner** | Async-generator based — eats 10K+ file directories & UNC network paths without OOM |
| 🔗 | **MCP Server Manager** | Add/remove/list MCP server configs — version-controlled JSON, human-readable |
| 🌐 | **Global Sync** | Push your config to `%APPDATA%/ContextBridge/` — one click, every project sees it |
| 🐧 | **Cross-Platform Binary** | `bun build --compile` → single exe for Windows & Linux, zero runtime deps |
| 🛡️ | **Bulletproof I/O** | EACCES/EIO/EBUSY auto-retry, UNC timeout (15s), malformed path filtering — never crashes |
| 🔬 | **90%+ Coverage** | 60 unit tests across 5 suites — file locks, network drops, JSON corruption, permission denied |

---

## 🚀 Quick Start

### 🧪 One-liner (source)

```bash
git clone https://github.com/your-username/contextbridge.git
cd contextbridge
bun install
bun run prebuild
bun start
```

Open → **http://localhost:3721** 🎉

### 📦 Pre-compiled binary

```bash
# Windows
bun run package:win
./dist/contextbridge.exe

# Linux
bun run package:linux
./dist/contextbridge
```

> No Node.js, no Bun, no `npm install` — single file, double-click, done.

### 🧰 Use as a library

```typescript
import { McpBridgeServer } from "./src/mcp.js";

const bridge = new McpBridgeServer("./mcp-servers.json");
await bridge.start();
// Your AI agent now has: list_servers, add_server, remove_server, scan_directory
```

---

## 🔌 Integrate with AI Tools

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "contextbridge": {
      "command": "C:\\path\\to\\contextbridge\\dist\\contextbridge.exe"
    }
  }
}
```

Now your Cursor agent can call:

| Tool | What it does |
|---|---|
| `list_servers` | List all MCP servers you've configured |
| `add_server` | Register a new MCP server (name, command, args, env) |
| `remove_server` | Remove a server by name |
| `scan_directory` | Recursively scan a local or network path (streamed!) |

### Trae

Same pattern — set the MCP host command to the binary path. The stdio transport speaks pure MCP protocol.

### Claude Code / Any MCP Host

```bash
npx @modelcontextprotocol/inspector path/to/contextbridge.exe
```

---

## 🛠️ Architecture

```
                         ┌──────────────────┐
                         │   AI Agent        │
                         │ Cursor · Trae ·   │
                         │ Claude Code       │
                         └────────┬─────────┘
                                  │ MCP Protocol (stdio)
                    ┌─────────────▼─────────────┐
                    │     McpBridgeServer        │
                    │   @modelcontextprotocol/   │
                    │         sdk                │
                    ├───────────┬────────────────┤
                    │ Tools      │ Resources     │
                    │  list      │ config://     │
                    │  call      │   servers     │
                    ├───────────┴────────────────┤
                    │  ▸ ConfigManager (JSON)    │
                    │  ▸ FileScanner (stream)    │
                    │  ▸ Logger (zero-dep)       │
                    ├────────────────────────────┤
                    │  UiServer (optional)       │
                    │  http://localhost:3721     │
                    └────────────────────────────┘
```

### Tech Stack

| Layer | Choice | Why |
|---|---|---|
| **Language** | TypeScript 6.0 `strict` | Type-safe, no `any` anywhere |
| **MCP** | `@modelcontextprotocol/sdk` | Official SDK, spec-compliant |
| **Runtime** | Bun 1.2 / Node 20+ | Bun for compile, Node for fallback |
| **Testing** | Vitest v4 | 60 tests, 5 suites, all passing |
| **Packaging** | `bun build --compile` | Single binary, ~106MB, zero deps |
| **Config Validation** | Zod v4 | Runtime schema enforcement |
| **Logging** | Custom file logger | Zero dependencies, never throws |

---

## 🛡️ Privacy & Security

```
┌─────────────────────────────────────────────┐
│               NO CLOUD. PERIOD.              │
│                                             │
│  ✓ Zero telemetry — no analytics, no pings  │
│  ✓ Zero uploads — files stay on your disk   │
│  ✓ Zero credential leak — env vars passed    │
│      through, never persisted as plaintext   │
│  ✓ Localhost only — binds to 127.0.0.1       │
│  ✓ Auditable — ~1,200 lines, no bloat       │
└─────────────────────────────────────────────┘
```

**ContextBridge never phones home.** Every file read, every directory scan, every config change happens entirely on your machine. If you compile from source, you can audit every line.

---

## 📊 Test Coverage

```bash
🧪 test/config.test.ts         —  11 tests   Config load/save, EACCES, EIO, EBUSY retry
🧪 test/scanner.test.ts        —   9 tests   Directory scan, stat, path validation, UNC
🧪 test/mcp.test.ts            —  11 tests   Tool handlers, error propagation, isError
🧪 test/robustness.test.ts     —  21 tests   File locks, UNC offline, permissions, malformed paths
🧪 test/ui.test.ts             —   8 tests   API routing, JSON body parsing
───────────────────────────────────────────────────────────────────────────────────────
✅ 60 tests passed  ·  5 test files  ·  90%+ coverage
```

---

## 🧑‍💻 Development

```bash
# Type-check (zero errors expected)
bun run typecheck

# Run all tests
bun test

# Watch mode
bun vitest

# Build from source
bun run build

# Package binary
bun run package:win   # or package:linux
```

### Env Variables

| Var | Default | Description |
|---|---|---|
| `CONTEXTBRIDGE_CONFIG` | `./mcp-servers.json` | Config file path |
| `CONTEXTBRIDGE_PORT` | `3721` | Web dashboard port |

---

## 📄 License

**MIT** — free for personal, commercial, or whatever. Go build something awesome.

---

<p align="center">
  <strong>ContextBridge</strong> · Made for the Vibe Coding era · <a href="https://github.com/your-username/contextbridge">★ Star on GitHub</a>
  <br>
  <sub>Found a bug? <a href="https://github.com/your-username/contextbridge/issues">Open an issue</a> · Want to contribute? PRs welcome!</sub>
</p>
