# Buffer Agent Landing Site - Implementation Plan

## Confirmed Decisions
- **Branding:** Buffer Agent
- **Deployment:** Custom hosting (SSG)
- **Scope:** Minimal - core pages only, no blog

## Tech Stack
- **Framework:** Nuxt 3
- **Styling:** Tailwind CSS
- **Icons:** @nuxt/icon (Iconify)
- **Fonts:** JetBrains Mono (code) + Inter (body)
- **Build:** Static generation (SSG)

## Site Structure

### Pages (5 total)
1. **`/` (Home)** - Hero, key features, quick start, providers, CTA
2. **`/features`** - Detailed feature breakdown with examples
3. **`/extensions`** - Extension system showcase with code samples
4. **`/providers`** - All supported AI providers & login methods
5. **`/docs`** - Quick start guide & commands reference

### Components

#### Layout
- `TheHeader.vue` - Logo, navigation, GitHub link
- `TheFooter.vue` - Links, license, social

#### Home Page
- `HeroSection.vue` - Headline, animated terminal, CTA buttons
- `FeatureGrid.vue` - 6 key feature cards
- `QuickStart.vue` - Installation commands with copy
- `ProviderGrid.vue` - Supported providers logos
- `CTASection.vue` - Final call to action

#### Shared
- `CodeBlock.vue` - Syntax highlighted code with copy
- `TerminalWindow.vue` - Fake terminal chrome
- `FeatureCard.vue` - Icon + title + description

## Design System

### Colors (Dark Theme)
```css
--primary: #00aaff      /* Accent blue */
--secondary: #6b7280    /* Muted gray */
--success: #22c55e      /* Green */
--bg-dark: #0d1117      /* Deep dark */
--bg-card: #161b22      /* Card background */
--text-primary: #e6edf3
--text-muted: #8b949e
```

### Typography
- Headings: Inter (bold)
- Body: Inter
- Code: JetBrains Mono

### Visual Elements
- Terminal-style code blocks
- Gradient text on hero
- Animated typing effect
- Subtle grid background pattern
- Glassmorphism cards

## Key Content

### Hero Section
- **Headline:** "Your AI-Powered Coding Partner"
- **Subheadline:** "A powerful terminal-based coding agent that reads, writes, edits, and executes - so you don't have to."
- **CTA:** "Get Started" → /docs | "GitHub" → repo

### Feature Grid (Home)
1. 🤖 **Multiple AI Providers** - Claude, GPT, Gemini, Copilot & more
2. 📁 **Full File Operations** - Read, write, edit with syntax highlighting
3. ⚡ **Terminal Integration** - Execute commands with safety controls
4. 🌳 **Session Management** - Tree branching, compaction, navigation
5. 🔌 **Extensible** - Custom tools, commands, themes, providers
6. 🖥️ **Desktop App** - GUI client with Electron

### Quick Start
```bash
# Install
npm install -g buffer-agent

# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Run
buffer
```

### Providers
| Provider | Type | Models |
|----------|------|--------|
| Anthropic | API Key / Subscription | Claude 4, Sonnet, Haiku |
| OpenAI | API Key / Subscription | GPT-4, GPT-4o, o1, o3 |
| Google | API Key / Subscription | Gemini 2.5 Pro, Flash |
| GitHub Copilot | Subscription | GPT-4, Claude, Gemini |
| Mistral | API Key | Mistral Large, Medium |
| Groq | API Key | Llama, Mixtral |
| xAI | API Key | Grok |
| OpenRouter | API Key | All models |

## File Structure
```
buffer-site/
├── nuxt.config.ts
├── tailwind.config.ts
├── app.vue
├── assets/
│   └── css/
│       └── main.css
├── components/
│   ├── layout/
│   │   ├── TheHeader.vue
│   │   └── TheFooter.vue
│   ├── home/
│   │   ├── HeroSection.vue
│   │   ├── FeatureGrid.vue
│   │   ├── QuickStart.vue
│   │   ├── ProviderGrid.vue
│   │   └── CTASection.vue
│   └── ui/
│       ├── CodeBlock.vue
│       ├── TerminalWindow.vue
│       └── FeatureCard.vue
├── pages/
│   ├── index.vue
│   ├── features.vue
│   ├── extensions.vue
│   ├── providers.vue
│   └── docs.vue
├── composables/
│   └── useCopy.ts
└── public/
    ├── favicon.ico
    └── og-image.png
```

## Implementation Steps

### Step 1: Project Setup
```bash
npx nuxi@latest init buffer-site
cd buffer-site
npm install -D @nuxtjs/tailwindcss @nuxt/icon
```

### Step 2: Configuration
- Configure Tailwind with custom colors
- Set up Google Fonts (Inter, JetBrains Mono)
- Add Iconify icons

### Step 3: Base Components
- Create layout components (Header, Footer)
- Build UI components (CodeBlock, TerminalWindow, FeatureCard)

### Step 4: Home Page
- Hero with animated terminal
- Feature grid
- Quick start section
- Provider logos
- CTA

### Step 5: Additional Pages
- Features page with detailed breakdown
- Extensions page with code examples
- Providers page with all options
- Docs page with quick reference

### Step 6: Polish
- Responsive design
- SEO meta tags
- Open Graph images
- Performance optimization

## Assets Needed
- [ ] Logo SVG (can create simple text-based one)
- [x] Screenshots (use existing from docs/images)
- [ ] Provider logos (link to official sources)
- [ ] OG image for social sharing
