# Buffer Landing Page Plan

## Overview
Create a modern, animated single-page landing site for **buffer-agent** - a coding agent CLI with integrated AI, agent core, and TUI modules.

**Tech Stack:**
- Single HTML file
- Tailwind CSS (via CDN)
- GSAP (GreenSock Animation Platform)
- Motion/animation effects

**Location:** `/landing/index.html`

---

## Page Structure

### 1. Hero Section
- **Headline:** "Your AI Coding Partner in the Terminal"
- **Subheadline:** "Buffer is a powerful CLI coding agent with integrated AI, beautiful TUI, and desktop app support"
- **CTA Buttons:**
  - "Get Started" (primary - links to npm/docs)
  - "View on GitHub" (secondary)
- **Animated visual:** Terminal mockup showing buffer in action
- **Badge:** "v0.52.10" | "Node.js >= 20"

### 2. Features Grid (with scroll animations)
Six key feature cards:

| Feature | Icon | Description |
|---------|------|-------------|
| 🤖 Multi-Model AI | Robot | Support for Anthropic, OpenAI, Google Gemini, Mistral, AWS Bedrock |
| ⌨️ Interactive TUI | Terminal | Beautiful terminal UI with themes, keybindings, and tree view |
| 🔧 Extensible | Puzzle | Custom extensions, skills, and prompt templates |
| 🖥️ Desktop App | Monitor | Electron desktop client with GUI sessions |
| 🔌 ACP Protocol | Plug | JSON-RPC server mode for editor integration |
| 📦 SDK | Package | Full SDK for building on top of Buffer |

### 3. Code Examples Section
Animated tabs showing different usage modes:

```bash
# Interactive mode
buffer

# Print mode (one-shot)
buffer --print "List all TypeScript files in src/"

# ACP server mode (for editors/clients)
buffer --acp
```

### 4. Providers/Models Section
Logo grid showing supported AI providers:
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- Mistral AI
- AWS Bedrock

### 5. Installation Section
Simple install command with copy button:

```bash
npm install -g buffer-agent
# or
pnpm add -g buffer-agent
```

### 6. Desktop App Preview
Screenshot/preview of the Electron desktop client with feature highlights:
- Session management
- Permission controls
- Real-time streaming updates

### 7. Footer
- Links: Documentation, GitHub, npm, Examples
- License info
- Social/community links

---

## Animation Strategy (GSAP + Motion)

### Initial Load
1. Logo/name fades in from top
2. Headline types out character by character
3. CTA buttons slide up with stagger
4. Terminal mockup fades in with slight scale

### Scroll Animations
1. Feature cards slide in from sides (alternating)
2. Code blocks animate in with code typing effect
3. Provider logos fade in as a grid
4. Installation section pulses subtly

### Interactions
1. Hover effects on all cards/buttons
2. Copy-to-clipboard animation for code blocks
3. Smooth scrolling between sections
4. Parallax effect on hero background

---

## Design Tokens

### Colors (Tailwind)
```css
/* Primary palette - Terminal-inspired */
--primary: #10B981 (emerald-500) - Success/growth
--secondary: #6366F1 (indigo-500) - Innovation
--accent: #F59E0B (amber-500) - Highlights
--dark: #0F172A (slate-900) - Background
--code-bg: #1E293B (slate-800) - Code blocks
```

### Typography
- Headings: Inter or system font (bold, clean)
- Code: JetBrains Mono or Fira Code (monospace)
- Body: Inter (readable)

### Visual Style
- Dark mode default (terminal aesthetic)
- Gradient accents
- Subtle glow effects on interactive elements
- Rounded corners (modern feel)
- Glass morphism on cards (backdrop blur)

---

## File Structure

```
landing/
├── index.html          # Main single-file landing page
└── assets/             # Optional local assets
    ├── favicon.ico     # Buffer logo/favicon
    └── screenshots/    # Optional screenshots
```

---

## External Dependencies (CDN)

```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- GSAP -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>

<!-- Motion (alternative/additional) -->
<script src="https://cdn.jsdelivr.net/npm/motion@latest/dist/motion.min.js"></script>
```

---

## Implementation Checklist

- [ ] Create `/landing/index.html` with base structure
- [ ] Add Tailwind configuration with custom theme
- [ ] Build hero section with animations
- [ ] Create features grid with scroll-triggered animations
- [ ] Add code examples with syntax highlighting and copy
- [ ] Build providers section with logo grid
- [ ] Create installation section
- [ ] Add desktop app preview section
- [ ] Build footer with links
- [ ] Implement all GSAP animations
- [ ] Add responsive design (mobile-friendly)
- [ ] Test in multiple browsers
- [ ] Optimize performance (lazy loading, etc.)

---

## Content to Include

### Key Stats/Badges
- Version: 0.52.10
- Node.js requirement: >= 20
- npm package: `buffer-agent`
- CLI binary: `buffer`
- ACP Protocol version: 1

### Links
- GitHub: (repo URL)
- npm: https://www.npmjs.com/package/buffer-agent
- Docs: ./docs folder
- Examples: ./examples folder

---

## Next Steps

1. ✅ Plan approved
2. Create `landing/index.html` with full implementation
3. Add screenshots from `docs/images/` if needed
4. Test and refine animations
5. Deploy (GitHub Pages, Vercel, etc.)
