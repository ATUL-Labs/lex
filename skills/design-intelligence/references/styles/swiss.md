---
style: swiss
mood: precise, rational, confident, uncluttered
fits: design studios, typography-led portfolios, cultural institutions, editorial landing pages
avoid-for: playful consumer apps, dense dashboards, casual social products
---

# Swiss (International Typographic Style)

Grid discipline and type as the primary design material. Asymmetric
composition, large negative space, no ornament - the layout is the message.

## Tokens

```css
:root {
  --sw-font: 'Neue Haas Grotesk', 'Helvetica Now', 'Inter', Arial, sans-serif;
  --sw-ink: #111111;
  --sw-bg: #ffffff;
  --sw-red: #e0001b;          /* canonical accent */
  --sw-alt-1: #003dff;        /* alternate: cobalt */
  --sw-alt-2: #ffd400;        /* alternate: signal yellow */
  --sw-grid-cols: 12;
  --sw-gutter: 24px;
  --sw-14: 14px; --sw-20: 20px; --sw-32: 32px; --sw-56: 56px; --sw-90: 90px;
}
```

## Rules

- Grid: 12 columns, 24px gutter, fixed margin equal to one gutter (24px) on desktop. Every block spans a whole number of columns, never a fraction.
- Type scale: fixed steps 14/20/32/56/90px (roughly 1.43-1.6-1.75-1.6 progression, not a single ratio) - use only these five sizes, nothing in between.
- Font: name exactly one of Helvetica Now, Neue Haas Grotesk, or Inter - never mix a second sans in the same layout.
- Weight: maximum 2 weights per screen (e.g. regular 400 + bold 700). A third weight is a tell of an unpracticed hand.
- Alignment: flush-left, rag-right always. Never justify, never center a title or paragraph.
- Palette: red-black-white is canonical. May swap red for cobalt (#003dff) or signal yellow (#ffd400) as the single alternate - never use two accents at once.
- Composition: asymmetric - content occupies 5-8 of the 12 columns, the remainder is deliberate empty space, not filler.
- Photography: full-bleed (spans all 12 columns, bleeds to viewport edge) or absent entirely. Never inset with padding or framed in a card.
- Baseline: body copy sits on a consistent baseline grid, line-height set to a multiple of 8px (e.g. 20px text at 24px line-height).

## Component recipes

```css
.sw-grid {
  display: grid; grid-template-columns: repeat(var(--sw-grid-cols), 1fr);
  gap: var(--sw-gutter); max-width: 1200px; margin: 0 auto; padding: 0 24px;
}
.sw-headline {
  font-family: var(--sw-font); font-weight: 700; font-size: var(--sw-90);
  line-height: 0.95; color: var(--sw-ink); text-align: left; grid-column: 1 / span 7;
}
.sw-body {
  font-family: var(--sw-font); font-weight: 400; font-size: var(--sw-20);
  line-height: 1.4; text-align: left; grid-column: 1 / span 5;
}
.sw-label {
  font-family: var(--sw-font); font-weight: 700; font-size: var(--sw-14);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--sw-red);
}
.sw-image { grid-column: 1 / -1; width: 100%; display: block; }
```

## Anti-patterns

- Centered titles or centered layout blocks: Swiss composition is always asymmetric and flush-left.
- Decorative flourishes - drop shadows, gradients, rounded stickers: the grid and type carry all visual weight.
- More than 2 weights on one screen: a third weight signals the system was not internalized.
- Fractional column spans that break the 12-column math: every element must land on whole gutters.
- Inset or cropped-with-border photography: images must be full-bleed or absent, never framed.
