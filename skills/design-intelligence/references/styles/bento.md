---
style: bento
mood: organized, modern, modular, scannable
fits: product landing pages, feature showcases, app marketing sites, portfolio overviews
avoid-for: linear reading content, single-task forms, deep data tables
---

# Bento

A grid of distinct tiles, each holding exactly one idea, sized by importance -
named after the compartmentalized Japanese lunchbox. Hierarchy comes from
tile size, not from color or type tricks.

## Tokens

```css
:root {
  --bt-gap: 16px;            /* one value, 12-16px, used everywhere - never mixed */
  --bt-radius: 16px;         /* 12-20px range, one value per screen */
  --bt-bg: #f4f4f2;
  --bt-tile-bg: #ffffff;
  --bt-ink: #14141a;
  --bt-muted: #6b6b76;
  --bt-accent: #4f46e5;
  --bt-shadow: 0 1px 2px rgba(0,0,0,0.04);
  --bt-shadow-hover: 0 8px 20px rgba(0,0,0,0.12);
  --bt-font: 'Inter', 'Satoshi', sans-serif;
}
```

## Rules

- Gap: exactly one value across the whole grid, 12-16px - row-gap and column-gap must match, never use different gaps in different regions.
- Tile size classes: 3 max - small (1x1), wide (2x1 or 1x2), hero (2x2). A screen uses at most one hero tile; more than one hero cancels the hierarchy.
- Grid definition: use CSS grid-template-areas with named regions so tile placement is explicit, not implicit auto-flow guessing.
- Content per tile: exactly one message - one stat, one feature, one image, or one short headline plus a one-line caption. Three or more content pieces in a tile means it should split into two tiles.
- Radius: one fixed value 12-20px on every tile, no exceptions.
- Hover: translateY(-2px to -4px) combined with shadow deepening from --bt-shadow to --bt-shadow-hover, transition 150-200ms ease-out.
- Tile background: each tile is a distinct surface (white or a single tint) against a slightly darker page background so the grid seams read clearly.
- Sizing ratio: hero tile occupies exactly 4x the area of a small tile (2x2 vs 1x1) - this 4:1 jump is what creates visible hierarchy versus a uniform card grid.

## Component recipes

```css
.bt-grid {
  display: grid; gap: var(--bt-gap);
  grid-template-columns: repeat(4, 1fr);
  grid-template-areas:
    "hero hero wide wide"
    "hero hero sm-a sm-b";
}
.bt-tile {
  background: var(--bt-tile-bg); border-radius: var(--bt-radius); box-shadow: var(--bt-shadow);
  padding: 24px; transition: transform 180ms ease-out, box-shadow 180ms ease-out;
}
.bt-tile:hover { transform: translateY(-3px); box-shadow: var(--bt-shadow-hover); }
.bt-hero { grid-area: hero; } .bt-wide { grid-area: wide; }
.bt-sm-a { grid-area: sm-a; } .bt-sm-b { grid-area: sm-b; }
.bt-tile h3 { font-size: 18px; font-weight: 700; color: var(--bt-ink); margin: 0 0 4px; }
.bt-tile p  { font-size: 14px; color: var(--bt-muted); margin: 0; }
```

## Anti-patterns

- Every tile the same size: that is a plain card grid, not bento - hierarchy requires at least one hero tile at 4x area.
- Three or more content pieces crammed into one tile: defeats the one-message-per-tile discipline.
- Mixed gap values (e.g. 12px between columns, 20px between rows): breaks the modular rhythm the grid depends on.
- Two or more hero tiles on one screen: hierarchy collapses back to visual noise.
- Auto-placed grid items without named areas: leads to unpredictable tile adjacency as content changes.
