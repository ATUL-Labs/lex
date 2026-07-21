# Lex — DESIGN.md

## Product Identity
Lex is an open-source CLI tool that indexes your codebase into SQLite, then gives you commands to search, reference, and remember everything — without opening files. It has memory, episodic sessions, error capture, guard for secrets, and a web viewer. It runs in your terminal.

## Core Message
"You're reading files. You should be searching them."

## Audience
Developers who might use lex + contributors who might star the repo.

## Tone
Technical and confident. Like a developer who found a better way and is telling you plainly. No hype. No "revolutionary." Just "this is faster, here's proof."

## Emotion
Curiosity → Recognition → Confidence

## Color Tokens

### Dark Theme (default)
--bg: #0d0b14
--surface: #16131f
--surface-2: #1e1a2a
--accent: #8b5cf6
--accent-2: #c4b5fd
--accent-dim: rgba(139,92,246,0.15)
--text: #e4e4e7
--muted: #9ca3af
--border: rgba(255,255,255,0.06)
--border-violet: rgba(139,92,246,0.2)
--red: #f87171
--green: #34d399

### Light Theme
--bg: #faf9fc
--surface: #ffffff
--surface-2: #f3f1f9
--accent: #7c3aed
--accent-2: #6d28d9
--accent-dim: rgba(124,58,237,0.08)
--text: #1a1722
--muted: #6b7280
--border: rgba(0,0,0,0.08)
--border-violet: rgba(124,58,237,0.2)
--red: #dc2626
--green: #059669

## Typography
Three fonts, each with a job:
- Space Grotesk: headings, display (geometric, modern, character)
- Inter: body, UI text (clean, readable, invisible)
- JetBrains Mono: terminal, code, commands (dev mono)

### Scale
- Display: 56px / weight 500 / letter-spacing -1.5px / Space Grotesk
- H2: 36px / weight 500 / -0.75px / Space Grotesk
- H3: 18px / weight 500 / Inter
- Body: 16px / weight 400 / line-height 1.6 / Inter
- Caption: 13px / weight 500 / uppercase / 0.04em tracking / JetBrains Mono
- Code: 14px / JetBrains Mono / line-height 1.5

## Spacing
- Base: 8px
- Section padding: 120px top/bottom
- Container: max-width 1080px, centered, 24px pad
- Card padding: 24px
- Terminal padding: 20px
- Default gap: 16px
- Section gap: 32px

## Borders — Per Frame
- Hero: no borders. Floats in darkspace.
- Problem: visible red-tinted borders on terminal.
- Lifecycle: violet borders on nodes and connections.
- Commands: visible border on terminal.
- Memory: invisible borders. Cards separated by space.
- Open source: no borders. Just logo and link.

## Radius
- 6px: small elements, tags
- 8px: buttons, inputs
- 12px: cards, terminals

## Elevation
- Dark: surface ladder (bg → surface → surface-2), no drop shadows
- Light: white surface + 1px border, minimal shadows
- Accent glow: rgba(139,92,246,0.15) behind key elements only

## Frames

### Frame 1 — Hero
Terminal types `lex search "auth"`, results appear line by line.
One line of copy: "Stop reading files. Start searching them."
Install command: `npm install -g @lex/cli`
GitHub star link.
No borders. Floats in darkspace.

### Frame 2 — Problem
The old way. Terminal shows: grep 47 files, cat 500 lines, scroll scroll, forget by Friday.
Red-tinted visible borders on terminal.
Slight red pulse on "2 hours later… still reading files."

### Frame 3 — Lifecycle (Centerpiece)
Scroll-driven animation. The knowledge graph is both identity and illustration.
As you scroll through these steps:
1. Index — nodes appear (files, symbols)
2. Search — connections draw between nodes
3. Error — a node flashes red
4. Fix — a green connection draws
5. Memory — pages stack (mistakes.md, patterns.md, design.md)
6. Recall — the whole graph lights up

Violet borders on nodes and connections. Each step builds on the last. The graph grows.

### Frame 4 — Commands
Interactive terminal. Fixed command set:
- `lex search <term>` → real search results
- `lex refs <symbol>` → real references
- `lex recall <term>` → real memory matches
- `lex errors` → captured errors
- `lex guard` → secret scan results

Visible border on terminal. Instant response, no animation.

### Frame 5 — Memory
Show .lex/pages/ contents — mistakes.md, patterns.md, design.md, episodic sessions.
Real entries, not placeholders.
"Six months from now, you'll remember what you learned today."
Invisible borders. Cards float, separated by space.

### Frame 6 — Open Source
GitHub link. Honest copy. No pricing. No enterprise.
"It's free. It's open source. Star it if it's useful."
No borders. GitHub mark draws itself in one stroke on scroll.

## Animation
| Frame | Animation | Trigger |
|---|---|---|
| Hero | Terminal types command, results appear line by line | On load |
| Problem | Terminal shows grep chaos, red pulse on "2 hours later" | Scroll into view |
| Lifecycle | Scroll-driven graph build: nodes → connections → error → fix → memory → recall | Scroll position |
| Commands | None. Instant response. | User input |
| Memory | Cards fade in, staggered | Scroll into view |
| Open source | GitHub mark draws in one stroke | Scroll into view |

## Do
- One accent color (violet), used scarcely
- Real lex command output as proof
- Space Grotesk for display headlines
- Terminal as the hero, not the copy
- Error capture script on every page

## Don't
- Pricing tables, fake testimonials, "trusted by" logos
- Gradients, glassmorphism, aurora blobs
- font-weight 700-800 on display
- Multi-layer box-shadows
- Rainbow icons
- Marketing fluff
- Generic SaaS bento grids
