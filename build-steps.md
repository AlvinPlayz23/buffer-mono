• pnpm build did include your new features. The issue was runtime path, not build output.

  Why you didn’t see /connect:

  - You built local code in ca-cli.
  - But you likely launched a different pi (global install / older binary on PATH).

  How to test correctly:

  cd C:\Users\bijim\pi-desk\ca-cli

  # 1) Build
  pnpm build

  # 2) Run exact local built CLI (always correct)
  node packages/coding-agent/dist/cli.js

  # 3) In app, run:
  /connect

  How to verify which pi you’re using:

  Get-Command pi | Format-List Source,Definition

  Development commands:

  cd C:\Users\bijim\pi-desk\ca-cli

  # install deps
  $env:CI='true'
  pnpm install

  # build all packages
  pnpm build

  # watch compile coding-agent only
  pnpm --dir packages/coding-agent run dev

  # run local built cli
  node packages/coding-agent/dist/cli.js

  # run via workspace binary resolution
  pnpm --filter @mariozechner/pi-coding-agent exec pi --help
  pnpm --filter @mariozechner/pi-coding-agent exec pi

  Recommended dev loop (2 terminals):

  1. Terminal A:

  pnpm --dir packages/coding-agent run dev

  2. Terminal B:

  node packages/coding-agent/dist/cli.js

  If you also modify ai/agent/tui, run full rebuild:

  pnpm build
