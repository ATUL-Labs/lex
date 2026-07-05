---
style: brutalism
mood: raw, austere, utilitarian, unapologetic
fits: text archives, art zines, protest sites, personal blogs, anti-corporate portfolios
avoid-for: e-commerce checkout, mainstream SaaS marketing, first-time-user onboarding
---

# Brutalism

The raw web: default browser typography, visible document structure, zero
decoration. Nothing is styled to look designed - that absence is the design.

## Tokens

```css
:root {
  --br-font-body: Times, 'Times New Roman', serif;   /* or system Arial stack */
  --br-font-mono: 'Courier New', monospace;
  --br-bg: #ffffff;
  --br-ink: #000000;
  --br-link: #0000ee;      /* default browser blue, unvisited */
  --br-link-visited: #551a8b;
  --br-accent: #ff0000;    /* one harsh accent max, used sparingly */
  --br-rule: 1px solid #000000;
  --br-radius: 0px;        /* always 0, no exceptions */
}
```

## Rules

- Fonts: system stack only - Times/Times New Roman or Arial/Helvetica for body, Courier New for code or meta text. No webfonts, no custom type.
- Links: default blue #0000ee unvisited, purple #551a8b visited, underlined always. If a single harsh accent color replaces blue, use it site-wide, not per-link.
- Shadows: none. Zero box-shadow anywhere on the page.
- Radius: 0px on every element, no exceptions ever.
- Structure: 1px solid black rules and table-like borders divide sections - the HTML structure itself is the visual hierarchy, not added chrome.
- Layout: dense, text-first, left-aligned. Line length 60-90ch, line-height 1.4-1.5.
- Images: functional only (diagrams, screenshots) - no decorative photography, no hero images, no stock art.
- Spacing: tight and utilitarian, 8-16px between blocks, no generous whitespace for its own sake.
- Headings: bold weight increase only, size steps via default browser h1-h6 ratios (roughly 2em/1.5em/1.17em), no custom scale.

## Component recipes

```css
body {
  font-family: var(--br-font-body); color: var(--br-ink); background: var(--br-bg);
  line-height: 1.45; max-width: 72ch; margin: 0 auto; padding: 16px;
}
a { color: var(--br-link); text-decoration: underline; }
a:visited { color: var(--br-link-visited); }
table { border-collapse: collapse; width: 100%; }
th, td { border: var(--br-rule); padding: 8px; text-align: left; }
.br-section { border-top: var(--br-rule); padding-top: 16px; margin-top: 16px; }
button {
  font-family: var(--br-font-mono); border: 1px solid #000; border-radius: 0;
  background: #fff; padding: 4px 10px; box-shadow: none;
}
```

## Anti-patterns

- Adding any box-shadow "to soften it": defeats the entire premise, remove it.
- Centering text or layout blocks: brutalism reads left-aligned and document-like, not centered like a poster.
- Decorative stock photography or hero banners: only functional images belong.
- Custom webfonts or variable type scales: system fonts and default h1-h6 sizes only.
- Rounded corners anywhere, even 2px: radius is always 0.
