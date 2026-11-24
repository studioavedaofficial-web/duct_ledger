---
version: alpha
name: DuctLedger
colors:
  primary: "#06e902"
  ink: "#0a0a0a"
  surface: "#141414"
  foreground: "#f5f5f5"
typography:
  headline:
    fontFamily: Sora
    fontWeight: 700
  body:
    fontFamily: Sora
    fontWeight: 400
rounded:
  control: 4px
spacing:
  gutter: 5vw
components:
  launch-button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  hero:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
---

## Overview

DuctLedger serves mechanical estimators. Place a recognizable sheet-metal fitting beside the product name and lead directly into the local workspace or sample tender.

## Colors

Use charcoal and near-white for the main reading surface. Reserve vivid green for the primary action, the second half of the product wordmark and selected drawing details.

## Typography

Use the locally hosted Sora family on the marketing site. Keep the dimensional ledger legible on narrow screens.

## Layout

Anchor the hero copy at the lower left. Give the elbow its own space above the copy on phones. Keep the two workspace entry points usable when scripting or graphics acceleration is unavailable.

## Motion

Use the supplied Spline scene as the interactive background. Use its still frame for reduced motion and a WebGL fallback. Keep highlights and parallax behind the text.

## References

Google's DESIGN.md specification defines the token format. The restrained technical grid and high-contrast actions draw on the NVIDIA analysis in VoltAgent's collection. DuctLedger supplies its own type, content, model and palette.

- https://github.com/google-labs-code/design.md
- https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/nvidia/DESIGN.md
