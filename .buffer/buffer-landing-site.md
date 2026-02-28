# Buffer Landing Site - Nuxt Implementation Plan

## Overview
A modern, responsive promotional website for Buffer coding agent built with Nuxt 3, showcasing its features, capabilities, and getting started guide.

## Tech Stack
- **Framework:** Nuxt 3
- **Styling:** Tailwind CSS
- **Animations:** @vueuse/motion or CSS animations
- **Icons:** @nuxt/icon (Iconify)
- **Content:** Nuxt Content (for blog/docs if needed)
- **Deployment:** Static generation (SSG)

## Site Structure

### Pages
1. **`/` (Home)** - Hero, key features, quick start, CTA
2. **`/features`** - Detailed feature breakdown
3. **/extensions** - Extension system showcase
4. **/providers** - Supported AI providers & models
5. **/docs`** - Quick reference / getting started
6. **/pricing** - (Optional) Highlight free/open-source

### Components

#### Layout
- `TheHeader.vue` - Navigation with logo
- `TheFooter.vue` - Links, social, license
- `TheSidebar.vue` - For docs section (optional)

#### Home Page
- `HeroSection.vue` - Animated hero with terminal preview
- `FeatureGrid.vue` - Key features cards
- `QuickStart.vue` - Installation commands with copy button
- `TerminalDemo.vue` - Animated terminal showing buffer in action
- `ProviderLogos.vue` - Supported AI providers
- `CodeExample.vue` - Syntax highlighted code blocks
- `Testimonials.vue` - (Optional) User quotes
- `CTASection.vue` - Call to action

#### Features Page
- `FeatureCard.vue` - Individual feature with icon/description
- `ComparisonTable.vue` - Buffer vs other tools (optional)
- `ScreenshotGallery.vue` - TUI screenshots

#### Extensions Page
- `ExtensionExample.vue` - Code sample with explanation
- `ExtensionCapabilities.vue` - List of what extensions can do

## Design System

### Colors
```css
/* Dark theme matching the TUI aesthetic */
--primary: #00aaff     /* Accent blue */
--secondary: #6b7280   /* Muted gray */
--success: #22c55e     /* Green */
--error: #ef4444       /* Red */
--warning: #f59e0b     /* Orange */
--bg-dark: #0d1117     /* Deep dark */
--bg-card: #161b22     /* Card background */
--text-primary: #e6edf3
--text-muted: #8b949e
```

### Typography
- Headings: Inter or JetBrains Mono (developer-friendly)
- Body: Inter
- Code: JetBrains Mono

### Visual Elements
- Terminal-style code blocks with syntax highlighting
- Gradient text effects on hero
- Animated typing effect for demos
- Glassmorphism cards
- Subtle grid/dot patterns for backgrounds

## Key Sections Content

### Hero
- Headline: "Your AI-Powered Coding Partner"
- Subheadline: "A powerful terminal-based coding agent that reads, writes, edits, and executes - so you don't have to."
- CTA buttons: "Get Started" | "View on GitHub"
- Visual: Animated terminal demo

### Feature Highlights (Home)
1. **Multiple AI Providers** - Claude, GPT, Gemini, and more
2. **Full File Operations** - Read, write, edit with diff preview
3. **Terminal Integration** - Execute commands safely
4. **Session Management** - Tree-based branching, compaction
5. **Extensible** - Custom tools, commands, themes
6. **Desktop App** - GUI client for those who prefer it

### Quick Start
```bash
# Install
npm install -g buffer-agent

# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run
buffer
```

### Provider Support Grid
Visual grid showing all supported providers:
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- GitHub Copilot
- Mistral
- Groq
- xAI
- OpenRouter
- Custom providers

### Extension Showcase
Example code snippets showing:
- Custom tool registration
- Event handling
- UI customization
- Custom providers

## Implementation Steps

### Phase 1: Project Setup
1. Create Nuxt 3 project
2. Configure Tailwind CSS with custom theme
3. Set up Iconify icons
4. Create base layout components

### Phase 2: Core Pages
1. Build home page with all sections
2. Create features page
3. Add providers page
4. Set up basic docs page

### Phase 3: Interactive Elements
1. Terminal animation component
2. Code copy functionality
3. Smooth scroll navigation
4. Mobile responsive menu

### Phase 4: Polish
1. SEO optimization
2. Open Graph images
3. Performance optimization
4. Accessibility audit

## File Structure
```
buffer-site/
├── nuxt.config.ts
├── tailwind.config.ts
├── app.vue
├── assets/
│   ├── css/
│   │   └── main.css
│   └── images/
│       └── screenshots/
├── components/
│   ├── layout/
│   │   ├── TheHeader.vue
│   │   └── TheFooter.vue
│   ├── home/
│   │   ├── HeroSection.vue
│   │   ├── FeatureGrid.vue
│   │   ├── QuickStart.vue
│   │   ├── TerminalDemo.vue
│   │   ├── ProviderLogos.vue
│   │   └── CTASection.vue
│   ├── features/
│   │   └── FeatureCard.vue
│   └── ui/
│       ├── CodeBlock.vue
│       ├── CopyButton.vue
│       └── TerminalWindow.vue
├── pages/
│   ├── index.vue
│   ├── features.vue
│   ├── extensions.vue
│   ├── providers.vue
│   └── docs.vue
├── composables/
│   └── useCopy.ts
└── public/
    └── favicon.ico
```

## Assets Needed
- Logo (SVG)
- Terminal screenshots (use actual buffer screenshots)
- Provider logos (available from respective brands)
- OG image for social sharing

## Questions for Clarification

Before implementation, I'd like to confirm a few things:

1. **Deployment Target:** Where will this be hosted? (Vercel, Netlify, GitHub Pages, custom?)
2. **Domain:** Will it be at buffer.dev, bufferagent.com, or similar?
3. **GitHub Repository:** Is the repo at github.com/badlogic/pi-mono or will there be a dedicated buffer-agent repo?
4. **Branding:** Should we use "Buffer" or "Buffer Agent" as the primary name?
5. **Additional Content:** Should we include a blog section for updates/tutorials?
