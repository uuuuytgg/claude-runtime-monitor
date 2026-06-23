# Claude Runtime Monitor

> 中文默认 / English below

**Claude Runtime Monitor** 是一个本地优先的 Claude Code 运行状态与模型额度监控面板。它把 Claude Code hook、statusline、cc-switch 请求日志与 provider 余额聚合到一个暖白风格的实时控制台中，帮助你看见当前 agent 在做什么、上下文压力有多高、会话成本是否正在接近危险区。

项目介绍页：<https://uuuuytgg.github.io/claude-runtime-monitor/>

> 说明：此开源版本不包含 HarmonyOS 原生客户端、服务卡片、签名材料、数据库、构建产物或任何本地密钥。Claude、Claude Code、Anthropic、DeepSeek 等名称归各自所有者所有，本项目非官方项目。

## 功能亮点

- 实时运行状态：离线、空闲、思考、读文件、编辑文件、执行命令、等待权限、错误等状态。
- 暖白监控面板：左侧导航、顶部状态条、AI 核心、模型、Provider、上下文、成本与事件时间线。
- AI 核心宠物：支持默认 Claude 标识，也支持导入/发现 OpenPets 风格宠物资源。
- WebSocket 推送：服务端状态变化会即时广播到 Web 仪表盘。
- Claude Code 接入：提供 hook 与 statusline 脚本，将本地运行事件推送到监控服务。
- cc-switch 读取：可从本机 `.cc-switch/cc-switch.db` 读取 Claude 请求日志，估算上下文占用与会话成本。
- Provider 余额监控：支持 DeepSeek，也提供通用 provider 配置与 Xiaomi MiMo 兼容逻辑。
- 本地 SQLite：事件、额度快照、用量记录都保存在本地数据库中。
- 隐私边界清晰：API key 只在服务端环境变量或本地数据库中使用，不暴露给前端构建产物。

## 快速开始

```bash
pnpm install
cp .env.example .env
# 编辑 .env，按需填入 DEEPSEEK_API_KEY、HOST、PORT、访问 token
pnpm dev
```

默认访问：<http://127.0.0.1:4377>

## 接入 Claude Code

在 Claude Code 的 settings 中配置脚本路径，例如：

```json
{
  "hooks": {
    "PreToolUse": [{ "command": "node /absolute/path/to/scripts/claude-hooks/claude-hook.js" }],
    "PostToolUse": [{ "command": "node /absolute/path/to/scripts/claude-hooks/claude-hook.js" }],
    "Stop": [{ "command": "node /absolute/path/to/scripts/claude-hooks/claude-hook.js" }]
  },
  "statusLine": {
    "type": "command",
    "command": "node /absolute/path/to/scripts/claude-hooks/statusline.js",
    "refreshInterval": 10
  }
}
```

如果你的服务不是默认地址，可以设置：

```bash
CRM_URL=http://127.0.0.1:4377
MONITOR_INTERNAL_TOKEN=your-internal-token
```

## 项目结构

```text
claude-runtime-monitor/
├── apps/
│   ├── server/          # Fastify + SQLite + WebSocket
│   └── web/             # Vite + React dashboard
├── packages/
│   ├── shared/          # shared types and constants
│   ├── state-engine/    # runtime reducer/state machine
│   ├── quota-providers/ # DeepSeek/generic provider clients
│   └── claude-collector/# Claude hook/statusline handlers
├── scripts/
│   └── claude-hooks/    # local Claude Code integration scripts
└── docs/                # GitHub Pages introduction site
```

## 常用命令

```bash
pnpm dev          # 构建 Web 后启动服务端
pnpm dev:server   # 仅启动服务端
pnpm dev:web      # 仅启动 Web 开发服务器
pnpm build        # 构建全部包
pnpm test         # 运行测试
```

## API 概览

| Method | Path | 用途 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/snapshot` | 当前完整快照 |
| GET | `/api/events?limit=50` | 最近事件 |
| GET | `/api/quota/providers` | provider 配置与最近余额 |
| GET | `/api/quota/fetch-all` | 拉取全部 provider 余额 |
| GET | `/ws` | WebSocket 实时推送 |
| POST | `/internal/claude/hook` | Claude Code hook 上报 |
| POST | `/internal/claude/statusline` | statusline 上报 |

## 安全说明

- 不要提交 `.env`、`*.db`、`storage/`、日志、构建产物或任何 token。
- 不建议把监控服务暴露到公网；如需局域网访问，请设置强 `MONITOR_ACCESS_TOKEN`。
- Provider API key 只应保存在服务端环境变量或本地 SQLite 中。
- 本仓库的公开版本已排除 HarmonyOS 客户端、服务卡片和签名材料。

## English

**Claude Runtime Monitor** is a local-first runtime and quota dashboard for Claude Code. It combines Claude Code hooks, statusline updates, cc-switch request logs, and provider balance checks into a warm, readable dashboard for agent activity, context pressure, and session cost.

Project site: <https://uuuuytgg.github.io/claude-runtime-monitor/>

This public release intentionally excludes the HarmonyOS native client, service cards, signing material, local databases, build outputs, and secrets.

### Highlights

- Live runtime state for Claude Code activity.
- Warm dashboard UI with navigation, AI core, provider, context, cost, and event timeline panels.
- AI core pet support, including imported OpenPets-style resources.
- WebSocket updates for the React dashboard.
- Claude Code hook and statusline integration scripts.
- Optional cc-switch log polling for context and cost estimates.
- DeepSeek and generic provider balance checks.
- Local SQLite persistence.
- Server-side secret handling: provider keys are not shipped to the browser.

### Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open <http://127.0.0.1:4377>.

### License

MIT
