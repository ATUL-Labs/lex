---
style: editorial
mood: refined, literary, calm, authoritative
fits: long-form journalism, essays, magazines, thought-leadership blogs, book-adjacent products
avoid-for: dashboards, dense data tools, checkout flows, mobile-first quick-action apps
---

# Editorial

Print-magazine typography brought to the web: serif display, humanist sans
body, generous rhythm, restrained color. The type does the talking.

## Tokens

```css
:root {
  --ed-font-display: 'Playfair Display', 'Source Serif 4', 'Freight Display', serif;
  --ed-font-body: 'Source Sans 3', 'Inter', 'Freight Sans', sans-serif;
  --ed-ink: #1a1a1a;
  --ed-paper: #faf8f4;
  --ed-accent: #7b1e1e;      /* oxblood, or forest #1e3d2f - pick one */
  --ed-rule: 1px solid #1a1a1a;
  --ed-scale-ratio: 1.25;    /* minor third */
  --ed-h1: 39px; --ed-h2: 31px; --ed-h3: 25px;
  --ed-h4: 20px; --ed-body: 16px; --ed-small: 13px;
  --ed-measure: 70ch;        /* 65-75ch */
}
```

## Rules

- Type scale: minor third ratio (1.25) - px ladder 13/16/20/25/31/39, each step multiplies the previous by 1.25.
- Display font: name exactly one of Playfair Display, Source Serif 4, or a Freight-alike, used only for h1-h3 and pull quotes, never body copy.
- Body font: humanist sans (Source Sans 3, Inter) at 16px, line-height 1.65 (within 1.6-1.7 range).
- Measure: body text column 65-75ch wide, never full-bleed on desktop.
- Drop cap: first paragraph only, first letter set at 3 lines tall (font-size 3em, line-height 0.8, float left, margin-right 8px, display font).
- Rules: 1px solid hairlines separate sections - no thicker, no color, pure structural marker.
- Whitespace: section padding 96-128px top and bottom on desktop, scaling to 48-64px on mobile.
- Palette: ink + paper + exactly one deep accent (oxblood #7b1e1e or forest #1e3d2f) - accent used only for links, bylines, and pull-quote marks, under 5% of surface.
- Headings on serif: line-height 1.1-1.2, tighter than body - never apply body line-height to display type.

## Component recipes

```css
body {
  font-family: var(--ed-font-body); font-size: var(--ed-body); line-height: 1.65;
  color: var(--ed-ink); background: var(--ed-paper);
}
h1, h2, h3 { font-family: var(--ed-font-display); line-height: 1.15; font-weight: 700; }
h1 { font-size: var(--ed-h1); } h2 { font-size: var(--ed-h2); } h3 { font-size: var(--ed-h3); }
.ed-article { max-width: var(--ed-measure); margin: 0 auto; padding: 128px 24px; }
.ed-dropcap::first-letter {
  font-family: var(--ed-font-display); font-size: 3em; line-height: 0.8;
  float: left; margin-right: 8px; color: var(--ed-accent);
}
.ed-divider { border: none; border-top: var(--ed-rule); margin: 64px 0; }
a { color: var(--ed-accent); text-underline-offset: 3px; }
```

## Anti-patterns

- Wrapping content in cards: editorial layouts flow as continuous columns, not boxed widgets.
- Tight line-height (below 1.4) on serif display text: crushes the letterforms and kills legibility.
- More than one accent color: a second accent competes with the ink/paper/accent hierarchy.
- Full-width body text on desktop: measure beyond 75ch fatigues the eye, breaking the reading rhythm.
- Sans-serif for headlines: forfeits the literary voice the serif display provides.
