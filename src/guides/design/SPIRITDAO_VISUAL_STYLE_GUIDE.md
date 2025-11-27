# 🎨 SpiritDAO Visual Style Guide

**Version:** 1.0
**Date:** November 23, 2025
**Status:** Official Design System

---

## 📖 Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color Palette](#color-palette)
3. [Button System](#button-system)
4. [Background Colors](#background-colors)
5. [Typography](#typography)
6. [Spacing & Layout](#spacing--layout)
7. [Component Patterns](#component-patterns)
8. [Usage Examples](#usage-examples)
9. [Accessibility](#accessibility)
10. [Migration Guide](#migration-guide)

---

## 🌿 Design Philosophy

### Sacred Minimalism

SpiritDAO's visual identity embodies **sacred minimalism** — a design approach that honors contemplation, ritual, and grounded intention.

**Core Principles:**

1. **Grounded**: Colors drawn from earth and nature (deep greens, warm off-whites, muted sages)
2. **Calm**: No aggressive neon, harsh contrasts, or visual noise
3. **Intentional**: Every color carries semantic meaning
4. **Accessible**: WCAG AA compliant (4.5:1 contrast minimum)
5. **Considered**: Buttons feel contemplative, not demanding

**Inspiration:**
- Ritual spaces and sacred architecture
- Natural earth tones and organic materials
- Temporal naturalism philosophy
- Contemplative design practices

---

## 🎨 Color Palette

### Primary Colors

#### Ritual Green (Primary Action)
```
HEX: #2F5D50
RGB: rgb(47, 93, 80)
Usage: Primary action buttons, key CTAs, sacred forward motion
Meaning: Trust, stability, grounded power, ritual intention
```

#### Ritual Green Hover
```
HEX: #254A40
RGB: rgb(37, 74, 64)
Usage: Hover state for primary buttons
```

---

### Secondary Colors

#### Muted Sage (Secondary Action)
```
HEX: #8FAAA1
RGB: rgb(143, 170, 161)
Usage: Secondary buttons, supportive actions (View, Edit, Back)
Meaning: Harmonious, non-dominant, supportive
```

#### Muted Sage Hover
```
HEX: #6F8F86
RGB: rgb(111, 143, 134)
Usage: Hover state for secondary buttons
```

#### Muted Sage Border
```
HEX: #6F8F86
RGB: rgb(111, 143, 134)
Usage: Border for secondary buttons
```

---

### Success Colors

#### Success Green (Completion States)
```
HEX: #3F7A5A
RGB: rgb(63, 122, 90)
Usage: Success buttons, completion indicators, milestone achievements
Meaning: Accomplishment, growth, fruition
```

#### Success Green Hover
```
HEX: #2F5A44
RGB: rgb(47, 90, 68)
Usage: Hover state for success buttons
```

---

### Warning Colors

#### Warning Amber (Caution States)
```
HEX: #C6933F
RGB: rgb(198, 147, 63)
Usage: Warning buttons, caution indicators
Meaning: Attention, deliberation required
```

#### Warning Amber Hover
```
HEX: #A67A2F
RGB: rgb(166, 122, 47)
Usage: Hover state for warning buttons
```

---

### Destructive Colors

#### Earthen Red (Destructive Actions)
```
HEX: #8B3A3A
RGB: rgb(139, 58, 58)
Usage: Delete, Remove, Revoke, Burn actions
Meaning: Serious but not violent, grounded destruction
```

#### Earthen Red Hover
```
HEX: #6F2C2C
RGB: rgb(111, 44, 44)
Usage: Hover state for destructive buttons
```

---

### Neutral/UI Colors

#### Neutral Warm (UI Elements)
```
HEX: #E8E4DC
RGB: rgb(232, 228, 220)
Usage: Toggles, chips, minor selectors, neutral backgrounds
```

#### Neutral Active
```
HEX: #BFB7A8
RGB: rgb(191, 183, 168)
Usage: Active state for neutral UI elements
```

---

### Background Colors

#### Warm Ritual Off-White (Primary Section Background)
```
HEX: #F0ECE6
RGB: rgb(240, 236, 230)
Usage: Main section containers (home page sections)
Meaning: Warm, contemplative space
```

#### Grounded Neutral (Secondary Section Background)
```
HEX: #E8E4DC
RGB: rgb(232, 228, 220)
Usage: Alternating section containers, neutral areas
Meaning: Earthy, grounded neutrality
```

#### Light Sage Info (Info Container Background)
```
HEX: #E8F1EE
RGB: rgb(232, 241, 238)
Usage: Info boxes, loading states, container backgrounds
Meaning: Calm information display, not demanding attention
```

#### Success Light (Success Container Background)
```
HEX: #D4E5DF
RGB: rgb(212, 229, 223)
Usage: Success state containers, approval messages
Meaning: Gentle celebration, accomplishment
```

---

### Text Colors

#### Primary Text
```
HEX: #3A3A3A
RGB: rgb(58, 58, 58)
Usage: Body text, descriptions, paragraph content
```

#### Heading Accent
```
HEX: #2F5D50
RGB: rgb(47, 93, 80)
Usage: Headings in info boxes, accented labels
```

#### Muted Text
```
HEX: #5F5A54
RGB: rgb(95, 90, 84)
Usage: Tertiary/ghost button text, subtle labels
```

#### Border Neutral
```
HEX: #D8D2C8
RGB: rgb(216, 210, 200)
Usage: Tertiary button borders, subtle dividers
```

#### Disabled Text
```
HEX: #8F8A84
RGB: rgb(143, 138, 132)
Usage: Disabled button text
```

#### Disabled Background
```
HEX: #D8D2C8
RGB: rgb(216, 210, 200)
Usage: Disabled button background
```

---

## 🔘 Button System

### Button Intent Types

#### PRIMARY (Affirmation, Sacred Forward Motion)
**Use for:** Submit, Continue, Confirm, Create, Join, Approve, Register, Mint

```tsx
// Inline Style
<Button style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}>
  Submit
</Button>

// Tailwind (custom)
<Button className="bg-[#2F5D50] text-white hover:bg-[#254A40]">
  Submit
</Button>

// Using Style Helper
import { getSpiritDAOButtonStyle } from '@/styles/spiritdao-buttons';
<Button style={getSpiritDAOButtonStyle('primary')}>
  Submit
</Button>
```

**Visual Specs:**
- Background: #2F5D50 (Ritual Green)
- Text: #FFFFFF (White)
- Hover: #254A40 (Darker Green)
- Border: None
- Contrast Ratio: 7.2:1 (AAA compliant)

---

#### SECONDARY (Supportive, Non-Destructive)
**Use for:** View, Edit, Back, Details, More Info, Learn

```tsx
// Inline Style
<Button style={{
  backgroundColor: '#8FAAA1',
  color: '#1F2D2A',
  border: '1px solid #6F8F86'
}}>
  View Details
</Button>

// Using Style Helper
<Button style={getSpiritDAOButtonStyle('secondary')}>
  View Details
</Button>
```

**Visual Specs:**
- Background: #8FAAA1 (Muted Sage)
- Text: #1F2D2A (Dark Text)
- Hover: #6F8F86 (Darker Sage)
- Border: 1px solid #6F8F86
- Contrast Ratio: 5.1:1 (AA compliant)

---

#### TERTIARY/GHOST (Minimal, Passive)
**Use for:** Cancel, Later, Dismiss, Close, Skip

```tsx
// Inline Style
<Button style={{
  backgroundColor: 'transparent',
  color: '#5F5A54',
  border: '1px solid #D8D2C8'
}}>
  Cancel
</Button>

// Using Style Helper
<Button style={getSpiritDAOButtonStyle('tertiary')}>
  Cancel
</Button>
```

**Visual Specs:**
- Background: Transparent
- Text: #5F5A54 (Muted Text)
- Hover: #F0ECE6 (Warm Off-White)
- Border: 1px solid #D8D2C8
- Contrast Ratio: 4.6:1 (AA compliant)

---

#### SUCCESS (Completion States)
**Use for:** Complete, Finish, Done, milestone releases

```tsx
// Inline Style
<Button style={{ backgroundColor: '#3F7A5A', color: '#FFFFFF' }}>
  Release Milestone Payment
</Button>

// Using Style Helper
<Button style={getSpiritDAOButtonStyle('success')}>
  Complete
</Button>
```

**Visual Specs:**
- Background: #3F7A5A (Success Green)
- Text: #FFFFFF (White)
- Hover: #2F5A44 (Darker Success Green)
- Border: None
- Contrast Ratio: 6.8:1 (AAA compliant)

---

#### DESTRUCTIVE (Delete, Remove, Revoke)
**Use for:** Delete, Remove, Revoke, Burn, Reject

```tsx
// Inline Style
<Button style={{ backgroundColor: '#8B3A3A', color: '#FFFFFF' }}>
  Delete Pod
</Button>

// Using Style Helper
<Button style={getSpiritDAOButtonStyle('destructive')}>
  Delete
</Button>
```

**Visual Specs:**
- Background: #8B3A3A (Earthen Red)
- Text: #FFFFFF (White)
- Hover: #6F2C2C (Darker Red)
- Border: None
- Contrast Ratio: 7.5:1 (AAA compliant)

---

#### NEUTRAL (Toggles, Chips, Selectors)
**Use for:** Filter chips, toggle buttons, minor selectors

```tsx
// Inline Style
<Button style={{
  backgroundColor: '#E8E4DC',
  color: '#3A3A3A'
}}>
  Filter
</Button>

// Using Style Helper
<Button style={getSpiritDAOButtonStyle('neutral')}>
  Filter
</Button>
```

**Visual Specs:**
- Background: #E8E4DC (Neutral Warm)
- Active: #BFB7A8 (Neutral Active)
- Text: #3A3A3A (Primary Text)
- Border: None
- Contrast Ratio: 5.4:1 (AA compliant)

---

## 📦 Background Colors

### Container Patterns

#### Info Boxes (General Information)
```tsx
<div className="bg-[#E8F1EE] border border-[#2F5D50] rounded-lg p-4">
  <p className="text-[#2F5D50]">🔄 Loading pods...</p>
</div>
```

**Visual Specs:**
- Background: #E8F1EE (Light Sage)
- Border: #2F5D50 (Ritual Green)
- Text: #2F5D50 or #3A3A3A
- Use: Loading states, info messages, non-critical alerts

---

#### Success Containers
```tsx
<div className="bg-[#D4E5DF] border border-[#3F7A5A] rounded-lg p-4">
  <p className="text-[#2F5D50]">✅ Application approved!</p>
</div>
```

**Visual Specs:**
- Background: #D4E5DF (Success Light)
- Border: #3F7A5A (Success Green)
- Text: #2F5D50 or #3A3A3A
- Use: Success messages, completion states, approval notifications

---

#### Section Backgrounds (Page Sections)
```tsx
{/* Primary Section */}
<section className="bg-[#F0ECE6] rounded-lg p-6">
  <h2>User Modules</h2>
</section>

{/* Secondary Section */}
<section className="bg-[#E8E4DC] rounded-lg p-6">
  <h2>SpiritDAO Modules</h2>
</section>
```

**Visual Specs:**
- Primary Section: #F0ECE6 (Warm Ritual Off-White)
- Secondary Section: #E8E4DC (Grounded Neutral)
- Use: Alternating sections on home page, major content areas

---

## ✏️ Typography

### Font Stack
```css
font-family: Arial, sans-serif;
```

**Why Arial?**
- Universal availability across all platforms
- Clean, readable, professional
- Supports sacred minimalism (no decorative flourishes)
- Excellent screen readability

### Button Typography Defaults

```css
.spiritdao-button {
  font-weight: 500;         /* Medium weight */
  letter-spacing: 0.02em;   /* Subtle spacing for clarity */
  border-radius: 12px;      /* Soft, approachable corners */
  padding: 10px 18px;       /* Balanced padding */
  text-transform: none;     /* No all-caps aggression */
  transition: all 0.2s ease-in-out;
}
```

**Typography Scale:**
- **Button Text**: 14-16px, font-weight: 500
- **Headings (H1)**: 28-32px, font-weight: 700
- **Headings (H2)**: 20-24px, font-weight: 600
- **Headings (H3)**: 16-18px, font-weight: 600
- **Body Text**: 14-16px, font-weight: 400
- **Small Text**: 12-14px, font-weight: 400

---

## 📐 Spacing & Layout

### Border Radius
```css
/* Buttons, Cards, Containers */
border-radius: 12px;  /* Primary radius - soft and approachable */

/* Small Elements (Chips, Badges) */
border-radius: 8px;

/* Large Containers */
border-radius: 16px;
```

### Spacing Scale
```css
/* Tight */
gap: 8px;
padding: 8px 12px;

/* Default */
gap: 12px;
padding: 10px 18px;

/* Comfortable */
gap: 16px;
padding: 16px 24px;

/* Spacious */
gap: 24px;
padding: 24px 32px;
```

### Container Shadows
```css
/* Subtle Elevation */
box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);

/* Medium Elevation (Cards) */
box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);

/* Strong Elevation (Modals) */
box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
```

---

## 🧩 Component Patterns

### Card Pattern
```tsx
<div className="bg-white rounded-xl p-6 shadow-md border border-gray-100">
  <h3 className="text-lg font-semibold mb-4">Card Title</h3>
  <p className="text-gray-600 mb-4">Card content goes here.</p>
  <Button style={getSpiritDAOButtonStyle('primary')}>
    Action
  </Button>
</div>
```

---

### Info Box Pattern
```tsx
<div className="bg-[#E8F1EE] border border-[#2F5D50] rounded-lg p-4">
  <h4 className="font-medium text-[#2F5D50] mb-2">
    ℹ️ Information
  </h4>
  <p className="text-[#3A3A3A] text-sm">
    Helpful information for the user.
  </p>
</div>
```

---

### Success Message Pattern
```tsx
<div className="bg-[#D4E5DF] border border-[#3F7A5A] rounded-lg p-4">
  <div className="flex items-center gap-3">
    <CheckCircle className="h-6 w-6 text-[#3F7A5A]" />
    <div>
      <p className="font-medium text-[#2F5D50]">Success!</p>
      <p className="text-sm text-[#3A3A3A]">
        Your action was completed successfully.
      </p>
    </div>
  </div>
</div>
```

---

### Button Group Pattern
```tsx
<div className="flex gap-3">
  <Button style={getSpiritDAOButtonStyle('secondary')}>
    Cancel
  </Button>
  <Button style={getSpiritDAOButtonStyle('primary')}>
    Confirm
  </Button>
</div>
```

---

## 💡 Usage Examples

### Example 1: Bounty Creation Form

```tsx
import { getSpiritDAOButtonStyle } from '@/styles/spiritdao-buttons';

function BountyForm() {
  return (
    <form className="space-y-6">
      <div className="bg-[#E8F1EE] border border-[#2F5D50] rounded-lg p-4">
        <p className="text-[#2F5D50]">
          💡 Tip: Provide clear bounty requirements.
        </p>
      </div>

      {/* Form fields */}
      <input type="text" placeholder="Bounty Title" />
      <textarea placeholder="Description" />

      {/* Button group */}
      <div className="flex gap-3">
        <button
          type="button"
          style={getSpiritDAOButtonStyle('tertiary')}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={getSpiritDAOButtonStyle('primary')}
        >
          Create Bounty
        </button>
      </div>
    </form>
  );
}
```

---

### Example 2: TransactionButton with SpiritDAO Colors

```tsx
import { TransactionButton } from '@coinbase/onchainkit/transaction';

<Transaction
  address={address}
  chainId={8453}
  calls={[/* ... */]}
  isSponsored={true}
>
  <TransactionButton
    text="Submit Proposal"
    style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
  />
  <TransactionSponsor />
  <TransactionStatus>
    <TransactionStatusLabel />
    <TransactionStatusAction />
  </TransactionStatus>
</Transaction>
```

---

### Example 3: Approval Workflow States

```tsx
function ApprovalStates({ status }) {
  if (status === 'approved') {
    return (
      <div className="bg-[#D4E5DF] border border-[#3F7A5A] rounded-lg p-4">
        <p className="text-[#2F5D50] font-medium">✅ Approved</p>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="bg-[#E8F1EE] border border-[#2F5D50] rounded-lg p-4">
        <p className="text-[#2F5D50]">⏳ Pending Review</p>
      </div>
    );
  }

  return null;
}
```

---

## ♿ Accessibility

### WCAG AA Compliance

All SpiritDAO colors meet **WCAG AA standards** (4.5:1 contrast minimum) for normal text.

**Contrast Ratios:**

| Foreground | Background | Ratio | WCAG Level |
|-----------|-----------|-------|-----------|
| #FFFFFF (White) | #2F5D50 (Primary) | 7.2:1 | AAA |
| #1F2D2A (Dark) | #8FAAA1 (Secondary) | 5.1:1 | AA |
| #5F5A54 (Muted) | #FFFFFF (White) | 4.6:1 | AA |
| #FFFFFF (White) | #3F7A5A (Success) | 6.8:1 | AAA |
| #FFFFFF (White) | #8B3A3A (Destructive) | 7.5:1 | AAA |
| #3A3A3A (Text) | #E8E4DC (Neutral) | 5.4:1 | AA |

### Accessibility Best Practices

1. **Always provide focus states:**
   ```css
   button:focus {
     outline: 2px solid #2F5D50;
     outline-offset: 2px;
   }
   ```

2. **Use semantic HTML:**
   ```tsx
   <button type="submit">Submit</button>  /* ✅ Good */
   <div onClick={handleClick}>Submit</div> /* ❌ Bad */
   ```

3. **Provide alt text for icons:**
   ```tsx
   <CheckCircle className="h-5 w-5" aria-label="Success" />
   ```

4. **Use ARIA labels for complex interactions:**
   ```tsx
   <button aria-label="Delete pod: Development Team">
     <Trash className="h-4 w-4" />
   </button>
   ```

---

## 🔄 Migration Guide

### From Legacy Colors to SpiritDAO Palette

#### Button Color Migration

| Old Color | Legacy Context | New Color | SpiritDAO Intent |
|-----------|---------------|-----------|-----------------|
| `#e8fcff` | Coinbase blue (primary) | `#2F5D50` | PRIMARY |
| `#0052FF` | Coinbase brand blue | `#2F5D50` | PRIMARY |
| `#bfe7c6` | Light green (submit) | `#2F5D50` | PRIMARY |
| `#75e79f` | Bright green (create) | `#2F5D50` | PRIMARY |
| `#dcfce7` | Very light green (milestone) | `#3F7A5A` | SUCCESS |
| `#10b981` | Emerald green | `#3F7A5A` | SUCCESS |
| `bg-blue-600` | Tailwind blue | `#2F5D50` or `#8FAAA1` | PRIMARY or SECONDARY |
| `bg-green-600` | Tailwind green | `#3F7A5A` | SUCCESS |

#### Background Migration

| Old Background | Legacy Use | New Background | SpiritDAO Use |
|----------------|-----------|----------------|--------------|
| `#e8fcff` | Section background | `#F0ECE6` | Warm section |
| `#e9f9ec` | Alternate section | `#E8E4DC` | Neutral section |
| `bg-blue-50` | Info container | `bg-[#E8F1EE]` | Info box |
| `bg-green-50` | Success container | `bg-[#D4E5DF]` | Success box |

#### Quick Find & Replace

**For TypeScript/TSX files:**
```bash
# Primary buttons
find: backgroundColor: '#e8fcff'
replace: backgroundColor: '#2F5D50', color: '#FFFFFF'

find: backgroundColor: '#bfe7c6'
replace: backgroundColor: '#2F5D50', color: '#FFFFFF'

# Success buttons/containers
find: backgroundColor: '#dcfce7'
replace: backgroundColor: '#3F7A5A', color: '#FFFFFF'

find: bg-green-50
replace: bg-[#D4E5DF]

# Info containers
find: bg-blue-50
replace: bg-[#E8F1EE]
```

**For CSS files:**
```bash
find: background-color: #e8fcff
replace: background-color: #2F5D50

find: background-color: #e9f9ec
replace: background-color: #E8E4DC
```

---

## 🛠️ Developer Resources

### Style Helper Functions

Import the centralized helper:
```tsx
import {
  getSpiritDAOButtonStyle,
  getSpiritDAOButtonHoverStyle,
  getSpiritDAOButtonClasses,
  detectButtonIntent,
  SPIRITDAO_COLORS
} from '@/styles/spiritdao-buttons';
```

**Usage Examples:**

```tsx
// Inline styles (React)
<button style={getSpiritDAOButtonStyle('primary')}>
  Submit
</button>

// Tailwind classes
<button className={getSpiritDAOButtonClasses('primary')}>
  Submit
</button>

// Semantic intent detection
const intent = detectButtonIntent('Delete Pod', 'delete');
// Returns: 'destructive'
<button style={getSpiritDAOButtonStyle(intent)}>
  Delete Pod
</button>

// Direct color access
const primaryColor = SPIRITDAO_COLORS.primary.background;
// Returns: '#2F5D50'
```

---

## 📚 Quick Reference Card

### Button Quick Reference

```
PRIMARY (#2F5D50, white text)
→ Submit, Create, Confirm, Join, Approve

SECONDARY (#8FAAA1, dark text)
→ View, Edit, Back, Details

TERTIARY (transparent, muted text)
→ Cancel, Dismiss, Close, Skip

SUCCESS (#3F7A5A, white text)
→ Complete, Finish, Done, Milestone Release

WARNING (#C6933F, white text)
→ Caution, Warning

DESTRUCTIVE (#8B3A3A, white text)
→ Delete, Remove, Revoke, Burn

NEUTRAL (#E8E4DC, primary text)
→ Filters, Toggles, Chips
```

### Background Quick Reference

```
WARM SECTION → #F0ECE6
NEUTRAL SECTION → #E8E4DC
INFO BOX → #E8F1EE (border: #2F5D50)
SUCCESS BOX → #D4E5DF (border: #3F7A5A)
```

---

## 🎓 Design Principles Summary

1. **Grounded over Flashy**: Earthy tones instead of bright neon
2. **Calm over Aggressive**: Muted sage instead of harsh blue
3. **Intentional over Arbitrary**: Each color has semantic meaning
4. **Accessible over Aesthetic**: Always WCAG AA minimum
5. **Considered over Demanding**: Buttons invite, not pressure

---

## 📞 Support & Questions

**For design questions:**
- Reference this guide first
- Check `CSS_AUDIT.sql` for additional context
- Review `spiritdao-buttons.ts` for implementation details

**For accessibility concerns:**
- All colors are WCAG AA compliant
- Use contrast checker: https://webaim.org/resources/contrastchecker/

**For custom colors:**
- Consult design team before deviating from palette
- Use `meetsWCAGAA()` function to validate contrast
- Document new colors in this guide

---

*This style guide is a living document. Last updated: November 23, 2025*

**SpiritDAO Design System v1.0**
**Sacred Minimalism • Grounded Intention • Accessible Design**

🌿 *Forward in grounded motion.*
