🎨 SpiritDAO Button Color System — LLM Implementation Prompt

Use the following system to detect UI intent and apply consistent, sacred, grounded styling throughout the application.

GLOBAL CONTEXT

App background: soft warm off-white with subtle circular motifs

Containers: primarily white with gentle shadow

Design tone: calm, intentional, ritual, grounded, trustworthy

Buttons should feel considered, not aggressive.

FUNCTION → COLOR MAPPING
PRIMARY ACTION (affirmation, continuation, sacred forward motion)

Used for:

"Submit"

"Continue"

"Enter"

"Mint"

"Confirm"

"Join"

{
  "role": "primary-action",
  "background": "#2F5D50",
  "hover": "#254A40",
  "text": "#FFFFFF",
  "border": "none"
}


Dark ritual green — conveys trust, grounded power, direction.

SECONDARY ACTION (supportive, non-destructive)

Used for:

"Back"

"Edit"

"View"

"More Info"

"Manage"

"Settings"

{
  "role": "secondary-action",
  "background": "#8FAAA1",
  "hover": "#6F8F86",
  "text": "#FFFFFF",
  "border": "none"
}


Muted sage with white text — maintains harmony without drawing dominance. White text ensures WCAG AA contrast compliance.

TERTIARY / GHOST ACTION (minimal, passive)

Used for:

"Cancel"

"Later"

"Dismiss"

{
  "role": "tertiary-action",
  "background": "transparent",
  "hover": "#F0ECE6",
  "text": "#5F5A54",
  "border": "1px solid #D8D2C8"
}


Respectful neutrality.

STATE FEEDBACK COLORS
SUCCESS / COMPLETION
{
  "role": "success",
  "background": "#3F7A5A",
  "text": "#FFFFFF"
}

WARNING / CAUTION
{
  "role": "warning",
  "background": "#C6933F",
  "text": "#FFFFFF"
}

DESTRUCTIVE / DANGER

Used for:

"Delete"

"Remove"

"Revoke"

"Burn"

{
  "role": "destructive",
  "background": "#8B3A3A",
  "hover": "#6F2C2C",
  "text": "#FFFFFF"
}


Deep earthen red — serious but not violent.

NEUTRAL INTERACTIVE ELEMENTS

For toggles, chips, minor selectors:

{
  "role": "neutral-ui",
  "background": "#E8E4DC",
  "active": "#BFB7A8",
  "text": "#3A3A3A"
}

TYPOGRAPHIC GUIDANCE

Buttons should default to:

{
  "font-weight": "500",
  "letter-spacing": "0.02em",
  "border-radius": "12px",
  "padding": "10px 18px",
  "text-transform": "none"
}