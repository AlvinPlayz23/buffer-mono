# Buffer Desktop

Electron desktop ACP client for Buffer CLI.

## Run

```bash
pnpm install
pnpm run dev
```

## Notes

- Starts Buffer ACP server as a subprocess (`buffer --acp` by default).
- Uses JSON-RPC 2.0 over stdio newline-delimited messages.
- Renderer receives normalized ACP events via secure preload IPC bridge.
