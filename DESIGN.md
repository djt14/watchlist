---
version: alpha
name: "Wan Shi Tong's Library"
description: "A daily television watchlist inside an illustrated, quietly animated Avatar library."
colors:
  background: "#0b0e14"
  surface: "#131824"
  surface-raised: "#1b2230"
  text: "#e9e7e0"
  muted: "#a5adbc"
  primary: "#e6c36b"
  focus: "#8fe8d8"
  danger: "#ffad9f"
typography:
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: "1.55"
  display:
    fontFamily: "Cinzel, Georgia, serif"
    fontWeight: 700
rounded:
  DEFAULT: "12px"
  control: "7px"
  card: "9px"
  dialog: "16px"
spacing:
  page-max: "1184px"
  card-gap: "18px"
  section-gap: "28px"
components:
  button:
    minHeight: "44px"
  card:
    width: "186px"
  dialog:
    maxWidth: "540px"
---

# Wan Shi Tong's Library

## Overview

This is a personal television tracking tool for everyday desktop and phone use. The approved direction is Wan Shi Tong's living library: vaulted stacks, lantern pools, drifting motes, and a watchful owl. The interface retains its existing Avatar name, four themed shelves, Cinzel headings, and sequential episode tracking.

English is the interface language. The character theme does not imply a Japanese locale or market. The immediate task is to find a show, see the next episode, and record progress. Reading and controls remain still while the illustration supplies atmosphere.

CSS custom properties in style.css are the canonical runtime tokens (mapping Model B); this file mirrors accepted values and explains their use. Scenery pigments are separately owned by library-scene.css and assets/library-interior.svg. They never supply semantic UI states.

## Colors

Midnight and ink anchor readable surfaces over the scenery. Gold marks primary actions and identity; spirit teal marks focus and successful synchronization. Muted text is lifted slightly from the inherited gray for legibility. The four shelves retain fire, air, water, and earth accents, with lighter shades for text contrast. State is always also expressed with words or shapes.

Mapping: background → --bg; surface → --surface; surface-raised → --surface-2; text → --text; muted → --dim; primary → --gold; focus → --spirit; danger → --danger. Button, field, card, dialog, toast and scrollbar selectors consume these shared variables. A token change must update both this mirror and the CSS.

## Typography

Cinzel supplies identity at 17–27px in the responsive header and 18–26px in sections/dialogs. Inter supplies 16px body/card titles and 14px essential metadata and controls. Minor labels and attribution may be smaller. Long show names wrap to three card lines, with the full name available through the labeled details button and detail heading. Body fallback is system sans; display fallback is Georgia. Variable Latin fonts are bundled locally with their OFL licenses; other scripts use the declared system fallbacks.

## Layout

The main collection is 1184px wide at most, inside an architectural scene. Desktop shows a compact header; below 1200px search has a full row. Shelves keep explicit horizontal scrolling and boundary-aware arrow buttons, with visible scrollbars. Cards are 186px desktop / 164px phone and retain separate open-details and watched actions. No transform enlarges cards into adjacent targets.

The document owns vertical scrolling. Native dialogs own internal scrolling and are bounded by the dynamic viewport. Controls remain reachable on small screens and enlarged text. Poster proportions reserve layout space. Empty and search-loading states have stable geometry.

## Elevation & Depth

The illustration sits at -2, its scrim at -1, and content above it inside an isolated document. Dense collection surfaces use nearly opaque ink. Dialogs occupy the native top layer with a restrained dimmed backdrop. Search uses a single anchored panel. Shadows add separation, not decorative floating effects.

## Shapes

Shelves use 12px corners; cards 9px; controls 7px; dialogs 16px. Pill shapes are reserved for motion, counts and sync status. The original inline outline utility icons and filled elemental insignia are retained.

## Components

- Buttons: gold/ink primary, ink/border secondary, explicit red-text danger. Targets have hover, focus, pressed, disabled and busy states. Readable labels accompany important actions.
- Cards: one details button, one independent progress button, visible title/up-next/count, and a decorative progress bar. No nested interactive controls or click-only containers.
- Dialogs: shared native dialog behavior, named title, initial focus, Escape where applicable, inert background, and focus restoration. Setup stays open until its required key is supplied.
- Forms: associated labels, masked credentials with reveal buttons, no native validation bubbles, text errors and correction hints. Optional sync is a native disclosure. Status uses a native select with platform-owned popup geometry.
- Search: transient add-to-library lookup, explicit action buttons, local clear, pending/no-results/error text, and stale-response cancellation. It does not pretend to search existing library metadata.
- Feedback: one toast system plus persistent errors. Storage failure must never be labeled as saved.
- Motion: all scene animation is namespaced. One saved pause setting controls decoration and slideshow. System reduced motion and hidden-document state stop work; system reduction takes priority. No sound, camera motion, card entrances, or ornamental button spins.
- Scrollbars: shared visible thumb/track/hover/active styling; forced-colors uses system defaults.

## Do's and Don'ts

- Do keep the Avatar illustration recognizable and the actual watchlist easy to read.
- Do use the same action labels, errors and focus behavior in cards and dialogs.
- Do preserve existing storage and sequential watched-through meaning.
- Don't hide progress or actions on hover, animate content headings, or use broad scene CSS class names.
- Don't imply reliable multi-device conflict merging; that is outside this visual/usability pass.
