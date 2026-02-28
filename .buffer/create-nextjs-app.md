# Final Plan: Create Next.js Web Application (with Clerk)

This plan outlines the steps to create a Next.js web application for the `buffer-agent` project, including a landing page, Clerk authentication, and a dashboard.

## Phase 1: Setup
- [ ] Create `apps/web` directory.
- [ ] Initialize `apps/web/package.json` with necessary dependencies:
    - `next`, `react`, `react-dom`
    - `tailwindcss`, `lucide-react`, `framer-motion`
    - `@clerk/nextjs` (for authentication)
    - `clsx`, `tailwind-merge`
- [ ] Create `apps/web/tsconfig.json`.
- [ ] Create `apps/web/next.config.js`.
- [ ] Create `apps/web/postcss.config.js` and `apps/web/tailwind.config.ts`.
- [ ] Setup `apps/web/app/layout.tsx` and `apps/web/app/globals.css`.

## Phase 2: Landing Page
- [ ] Port the existing `landing/index.html` to Next.js components in `apps/web/app/(marketing)/page.tsx`.
- [ ] Create reusable components for the landing page (Navbar, Hero, Features, Elite, Footer).
- [ ] Update Navbar with Clerk's `<SignedOut>`, `<SignedIn>`, `<SignInButton>`, and `<UserButton>`.

## Phase 3: Authentication (Clerk)
- [ ] Setup `middleware.ts` for Clerk protection.
- [ ] Create `apps/web/app/sign-in/[[...sign-in]]/page.tsx`.
- [ ] Create `apps/web/app/sign-up/[[...sign-up]]/page.tsx`.
- [ ] Configure environment variables for Clerk (template only).

## Phase 4: Dashboard
- [ ] Design and implement the main dashboard layout `apps/web/app/dashboard/layout.tsx`.
- [ ] Create the dashboard overview `apps/web/app/dashboard/page.tsx`.
- [ ] Create a sessions management page `apps/web/app/dashboard/sessions/page.tsx`.
- [ ] Create a settings page `apps/web/app/dashboard/settings/page.tsx`.

## Phase 5: Integration (Optional/Future)
- [ ] Integrate with the agent's RPC mode or direct SDK usage to show live session data in the dashboard.
