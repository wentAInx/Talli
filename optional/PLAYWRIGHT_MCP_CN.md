# 可选：Playwright MCP

本项目的 canonical task 已经要求 Playwright E2E。MCP 不是完成 V1 的必要条件；它只是让 Codex 可以更方便地直接操作浏览器做视觉/交互检查。

Codex 当前支持 project-scoped MCP 配置。如果你尚未在全局 Codex 配置中安装 Playwright MCP，可以把下面片段**合并**到 `.codex/config.toml`：

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]
```

不要为了添加该片段覆盖现有 `[agents]` 配置。

也可以用 Codex CLI 添加 MCP server；如果你已经在全局 `~/.codex/config.toml` 配置了 Playwright，就无需在项目内重复配置。

无论是否使用 MCP，最终 UI 都应由项目内 Playwright E2E 提供可重复验收，而不是只依赖 agent 的一次人工浏览。
