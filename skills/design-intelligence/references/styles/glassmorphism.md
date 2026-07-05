---
style: glassmorphism
mood: airy, futuristic, layered, calm
fits: media players, dashboards over imagery, onboarding overlays, weather apps, macOS-style UI
avoid-for: text-dense reading surfaces, low-vision accessibility contexts, flat solid-color backgrounds
---

# Glassmorphism

Translucent frosted panels floating over a rich background. The blur and the
background do the work together - glass on flat white is not glassmorphism.

## Tokens

```css
:root {
  --gl-blur: 16px;                          /* 12-24px, never below 12 or above 24 */
  --gl-saturate: 1.4;                       /* boosts colors seen through the blur */
  --gl-surface-dark: rgba(255, 255, 255, 0.10);   /* 8-15% white alpha on dark ground */
  --gl-surface-light: rgba(255, 255, 255, 0.65);  /* 55-75% white alpha on light ground */
  --gl-border: 1px solid rgba(255, 255, 255, 0.30); /* inset white-alpha edge */
  --gl-shadow: 0 8px 32px rgba(0, 0, 0, 0.20);
  --gl-radius: 16px;                        /* 12-20px, soft not sharp */
  --gl-ink: #0f172a;
  --gl-ink-on-dark: #f8fafc;
}
```

## Rules

- Backdrop blur: `backdrop-filter: blur(var(--gl-blur)) saturate(var(--gl-saturate));` always pair blur with saturate(1.3-1.5), plain blur looks muddy.
- Surface fill: rgba white at 8-15% alpha over dark backgrounds, 55-75% alpha over light backgrounds. Never use a solid or opaque fill.
- Edge: 1px solid border at 25-35% white alpha, simulating light catching the glass rim. No dark borders.
- Background requirement: glass MUST sit over a gradient mesh, blurred photo, or colorful illustration. On flat single-color ground the effect disappears - this is mandatory, not optional.
- Stack depth: maximum 2 layers of glass-on-glass. A third layer reads as mud and tanks contrast.
- Shadow: one soft ambient shadow per panel, 20-32px blur, 15-25% black alpha, to lift it off the background.
- Contrast: body text on glass must hit 4.5:1 minimum against the busiest part of the background behind it - test over the brightest region, not the average.
- Fallback: `@supports not (backdrop-filter: blur(1px))` sets a near-opaque solid surface (92% alpha) so the panel stays legible without blur support.

## Component recipes

```css
.gl-panel {
  background: var(--gl-surface-dark);
  backdrop-filter: blur(var(--gl-blur)) saturate(var(--gl-saturate));
  -webkit-backdrop-filter: blur(var(--gl-blur)) saturate(var(--gl-saturate));
  border: var(--gl-border); border-radius: var(--gl-radius);
  box-shadow: var(--gl-shadow); padding: 24px;
}
@supports not (backdrop-filter: blur(1px)) {
  .gl-panel { background: rgba(15, 23, 42, 0.92); }
}
.gl-button {
  background: rgba(255, 255, 255, 0.18); border: var(--gl-border);
  border-radius: 10px; padding: 10px 20px; color: var(--gl-ink-on-dark);
  backdrop-filter: blur(12px);
}
.gl-input {
  background: rgba(255, 255, 255, 0.12); border: var(--gl-border);
  border-radius: 10px; padding: 10px 14px; color: var(--gl-ink-on-dark);
}
```

## Anti-patterns

- Glass panel on a flat white or single-color background: no depth cue, effect is invisible.
- Body text below 4.5:1 contrast on a glass surface: unreadable in bright regions of the backdrop.
- Blurring every element on the page: reserve blur for 1-2 focal panels, not nav, cards, and modals all at once.
- Stacking 3+ glass layers: contrast collapses into gray mud.
- Skipping the no-backdrop-filter fallback: panel becomes see-through and text disappears on unsupported browsers.
