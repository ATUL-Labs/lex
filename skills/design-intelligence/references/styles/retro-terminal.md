---
style: retro-terminal
mood: nostalgic, technical, focused, hacker
fits: dev tools, CLI companion sites, changelogs, terminal emulators, hacker-culture brands
avoid-for: mainstream consumer apps, accessibility-critical UI, content needing warm approachability
---

# Retro Terminal

CRT phosphor glow rendered in CSS: monospace type, a single glowing hue on
near-black, scanlines, and a blinking block cursor. Reads like a 1980s green
screen, not a modern app wearing a green filter.

## Tokens

```css
:root {
  --rt-bg: #0a0a0a;
  --rt-green: #33ff66;         /* phosphor green */
  --rt-amber: #ffb000;         /* phosphor amber - pick ONE family per screen */
  --rt-green-dim: #2bcc55;     /* green at reduced emphasis, secondary text - 9.3:1 on --rt-bg */
  --rt-amber-dim: #cc8f00;     /* amber at reduced emphasis - 7.1:1 on --rt-bg */
  --rt-font: 'IBM Plex Mono', 'JetBrains Mono', monospace;
  --rt-measure: 70ch;          /* 60-80ch range */
  --rt-glow: 0 0 4px currentColor;
}
```

## Rules

- Palette: choose exactly one phosphor family per screen - green (#33ff66 on #0a0a0a) or amber (#ffb000 on #0a0a0a). Never mix both on the same screen; a dim variant of the same hue is the only allowed second tone.
- Glow: text-shadow: 0 0 4px currentColor, applied at 40% opacity of the base color (e.g. rgba(51,255,102,0.4)) - only on headings, prompts, and the cursor, never on full paragraphs of body text.
- Scanlines: repeating-linear-gradient overlay, horizontal lines every 2-4px, opacity 2-4% black, layered as a fixed-position pseudo-element over the whole viewport.
- Cursor: a solid block character or span, blinking via steps(2) timing function, 1s duration, infinite - a hard on/off blink, never a smooth fade.
- Type: monospace only, name exactly one of IBM Plex Mono or JetBrains Mono. Base size 15-16px, line-height 1.5-1.6 to keep long text blocks readable at fixed width.
- Content width: 60-80ch max, matching real terminal line-wrap behavior - never full-bleed text.
- Dividers: ASCII or box-drawing characters (─, ═, ├) rendered as literal text content, not CSS borders, to keep the terminal-authenticity.
- Contrast: the dim tokens (--rt-green-dim / --rt-amber-dim) are calibrated to clear 4.5:1 on --rt-bg, so body copy can use them for long passages without fatigue or failing accessibility; reserve full-brightness phosphor for prompts, links, and active state, and use dim for anything secondary (labels, metadata, dividers).

## Component recipes

```css
body {
  background: var(--rt-bg); color: var(--rt-green); font-family: var(--rt-font);
  font-size: 15px; line-height: 1.55; position: relative;
}
body::after {
  content: ''; position: fixed; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(to bottom, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 3px);
}
.rt-prompt { color: var(--rt-green); text-shadow: 0 0 4px rgba(51,255,102,0.4); }
.rt-body { color: var(--rt-green-dim); max-width: var(--rt-measure); margin: 0 auto; }
.rt-cursor {
  display: inline-block; width: 0.6em; height: 1.1em; background: var(--rt-green);
  animation: rt-blink 1s steps(2) infinite; vertical-align: text-bottom;
}
@keyframes rt-blink { 50% { opacity: 0; } }
.rt-divider { color: var(--rt-green-dim); letter-spacing: 0; white-space: pre; }
```

## Anti-patterns

- Glow applied to every element on the page: turns focused CRT emphasis into an unreadable haze.
- Mixing green and amber phosphor on one screen: real terminals were single-hue, mixing reads as a theme demo, not a terminal.
- Rounded corners, drop shadows, or card chrome on containers: modern UI chrome breaks the flat CRT illusion.
- Smooth fade-in/fade-out cursor blink: the cursor must hard-cut with steps(2), a smooth transition reads as a loading spinner instead.
- Body copy at full-brightness glow color for long passages: causes eye fatigue, use the dim variant for anything beyond a line or two.
- Dim tokens (#2bcc55, #cc8f00) are the accessibility floor - they clear 4.5:1 on #0a0a0a and are safe for body copy; do not darken them further or contrast will drop below that floor.
