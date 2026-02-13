# Project Memory

This file is loaded into context when present.
Use it for stable project facts, constraints, and preferences.

## Project Overview
**Pi** is a minimal terminal coding harness/agent (npm: @mariozechner/pi-coding-agent).
- Highly extensible via TypeScript: Extensions, Skills, Prompt Templates, Themes
- Supports 25+ model providers (Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, etc.)
- Four modes: interactive, print/JSON, RPC, SDK
- Built-in tools: read, write, edit, bash, grep, find, ls
- Sessions stored as JSONL with tree structure; in-place branching supported
- Auto-compaction for long sessions; manual compaction available
- Loads context from AGENTS.md/CLAUDE.md files walking up from cwd
- System prompt can be replaced/appended via .pi/SYSTEM.md or .pi/APPEND_SYSTEM.md

## Key Architecture
- Core packages: @mariozechner/pi-ai (LLM), @mariozechner/pi-agent (framework), @mariozechner/pi-tui (UI)
- Extensions run with full system access; skills instruct models via Agent Skills standard
- Pi Packages bundle resources (npm or git); discoverable in ~/.pi/agent/ or .pi/ local
- Settings via ~/.pi/agent/settings.json (global) or .pi/settings.json (project overrides)
- Custom models/providers: ~/.pi/agent/models.json for OpenAI/Anthropic/Google APIs

## Development Status
- OSS vacation period: PRs auto-closed until February 16, 2026
- Approved contributors can submit post-vacation without reapproval
- Community: Discord, GitHub discussions