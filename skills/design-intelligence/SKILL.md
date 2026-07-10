---
name: design-intelligence
description: Design intelligence for UI and frontend work. Never boring, never template-looking. Use when building any visual component, page, or layout. Forces intentional, distinctive design.
---

# Design Intelligence

Every UI you build should look like a human designer made deliberate choices. Not like an AI generated a template.

## The Test

Before shipping any UI, ask: "Could I tell this was AI-generated?" If yes, redo it.

Signs of AI-generated UI:
- Perfectly symmetrical grids with identical cards
- Generic gradient backgrounds
- "Hero section + features grid + testimonials + CTA" formula
- Rounded corners on everything at the same radius
- Generic stock-photo-style placeholder content
- Every section looks like it came from a different template

<HARD-GATE>
UI that fails the anti-generic test does not ship - it gets redone. Symmetric
card grids with identical cards, the hero/features/testimonials/CTA formula,
uniform radius on everything, gradient-on-white defaults: redo, not polish.
This gate is the same enforcement class as TDD's no-code-before-test.
</HARD-GATE>

## Project Design Identity (mandatory)

On a project's FIRST UI task:
1. Read the brief and audience. Propose ONE direction: a style (from
   references/styles/), a palette (from references/palettes.md), and a type
   pair (from references/font-pairings.md). One sentence each on why.
2. Get explicit user approval before writing any UI code.
3. Write the approved identity to `.lex/pages/design.md`: style name, the
   token block, palette hexes, font pair, and any project-specific overrides.

Every LATER UI task: load `.lex/pages/design.md` FIRST. The project identity
overrides the library. Never propose a new direction mid-project unless the
user asks for a redesign.

Brownfield projects (existing UI): do not propose a new direction - derive design.md
from the current interface (its actual tokens, type, spacing) and confirm it with the
user. If the user is unreachable (autonomous runs), write the proposal to design.md
marked `status: provisional` and flag it for approval instead of stalling.

## Loading Rule

Load at most: project design.md + ONE style page + the palette and font
entries you picked, + motion.md when the task involves animation or
transitions. Never bulk-load the references directory. Style pages live in
references/styles/ (neobrutalism, glassmorphism, brutalism, editorial,
swiss, claymorphism, bento, retro-terminal); palettes, font-pairings, and
motion are single files beside it.

## Principles

- **Hierarchy**: one thing is clearly most important on every screen
- **Restraint**: 2-3 colors, 1-2 fonts, one consistent radius
- **Density**: dense where it matters (dashboards, tables), roomy where it matters (landing pages, forms)
- **Consistency**: same component, same spacing, same shadow, same hover state everywhere
- Use the project's existing design system and match existing page patterns
- Motion communicates state change, not decoration
- Tables for tabular data, cards for entity summaries, lists for sequential items
- Dark mode and responsiveness: match what the project already has, do not add either speculatively
- Never add a UI library the project doesn't already use without asking
