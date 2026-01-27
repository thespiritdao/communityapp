# Forum Rich Text Formatting Guide

## Overview

The SpiritDAO forum now supports full HTML formatting with proper styling for paragraphs, lists, headings, and more.

## What Was Fixed

### Before:
- `<p>` tags didn't create paragraph breaks
- `<ol>` and `<ul>` lists displayed without bullets/numbers
- `<br>` tags weren't respected
- No spacing between elements

### After:
- All HTML elements now display with proper styling
- Lists show bullets (unordered) and numbers (ordered)
- Proper spacing between paragraphs and sections
- Headings styled with hierarchy
- Nested lists supported

---

## Supported HTML Elements

### Headings

```html
<h1>Main Heading</h1>
<h2>Section Heading</h2>
<h3>Subsection Heading</h3>
<h4>Minor Heading</h4>
```

**Styling:**
- Color: SpiritDAO green (#2F5D50)
- Proper font sizes (h1: 1.875rem → h4: 1.125rem)
- Top/bottom margins for spacing

---

### Paragraphs

```html
<p>This is a paragraph with proper spacing.</p>
<p>This is another paragraph. Each paragraph gets 1rem bottom margin.</p>
```

**Notes:**
- Automatic 1rem bottom margin (except last paragraph)
- Line height: 1.6 for readability
- No need for `<br>` between paragraphs

---

### Lists

#### Unordered Lists (Bullets)

```html
<ul>
  <li>First item</li>
  <li>Second item</li>
  <li>Third item</li>
</ul>
```

#### Ordered Lists (Numbers)

```html
<ol>
  <li>Step one</li>
  <li>Step two</li>
  <li>Step three</li>
</ol>
```

#### Nested Lists

```html
<ol>
  <li>Main item
    <ul>
      <li>Sub-item A</li>
      <li>Sub-item B</li>
    </ul>
  </li>
  <li>Another main item</li>
</ol>
```

**Styling:**
- Unordered: Disc bullets (circles for nested)
- Ordered: Decimal numbers (lower-alpha for nested)
- 2rem left padding for indentation
- 0.5rem margin between list items

---

### Text Formatting

```html
<strong>Bold text</strong>
<em>Italic text</em>
<a href="https://example.com">Link text</a>
<code>Inline code</code>
```

**Styling:**
- **Bold:** Font weight 600
- *Italic:* Font style italic
- Links: SpiritDAO green with underline
- Code: Monospace font with light gray background

---

### Blockquotes

```html
<blockquote>
  This is a quoted text or important callout.
</blockquote>
```

**Styling:**
- Left border: 4px solid green
- Background: Light green tint
- Italic text
- Padding for emphasis

---

### Code Blocks

```html
<pre><code>
function example() {
  return "Formatted code block";
}
</code></pre>
```

**Styling:**
- Monospace font
- Light background
- Preserves whitespace and line breaks
- Horizontal scroll for long lines

---

### Line Breaks

```html
<p>First line</p>
<p>Second line (preferred method)</p>

<!-- OR -->

First line<br>
Second line (inline break)
```

**Note:** Use `<p>` tags for paragraph separation (preferred) or `<br>` for inline breaks.

---

### Images

```html
<img src="https://example.com/image.jpg" alt="Description">
```

**Styling:**
- Max-width: 100% (responsive)
- Auto height (maintains aspect ratio)
- Border radius: 0.5rem
- 1rem top/bottom margin

---

### Horizontal Rules

```html
<hr>
```

**Styling:**
- 1px solid border
- 1.5rem top/bottom margin
- Subtle separator

---

## Best Practices

### 1. Use Semantic HTML

✅ **Good:**
```html
<h2>Section Title</h2>
<p>Introduction paragraph.</p>
<ul>
  <li>Point one</li>
  <li>Point two</li>
</ul>
```

❌ **Avoid:**
```html
<strong>Section Title</strong><br><br>
Introduction paragraph.<br>
- Point one<br>
- Point two<br>
```

### 2. Proper List Structure

✅ **Good:**
```html
<ol>
  <li>First step</li>
  <li>Second step</li>
</ol>
```

❌ **Avoid:**
```html
1. First step<br>
2. Second step<br>
```

### 3. Paragraph Spacing

✅ **Good:**
```html
<p>First paragraph.</p>
<p>Second paragraph.</p>
```

❌ **Avoid:**
```html
First paragraph.<br><br>
Second paragraph.<br><br>
```

### 4. Nested Lists

✅ **Good:**
```html
<ol>
  <li>Main item
    <ul>
      <li>Sub-item</li>
    </ul>
  </li>
</ol>
```

**Result:**
1. Main item
   - Sub-item

---

## Common Use Cases

### Bug Report Template

```html
<h2>🐛 Bug Report: [Title]</h2>

<h3>What Happened</h3>
<p>Describe the bug here.</p>

<h3>Steps to Reproduce</h3>
<ol>
  <li>Go to page X</li>
  <li>Click button Y</li>
  <li>Observe error Z</li>
</ol>

<h3>Expected Behavior</h3>
<p>What should have happened instead.</p>

<h3>Environment</h3>
<ul>
  <li><strong>Browser:</strong> Chrome 120</li>
  <li><strong>Device:</strong> Desktop</li>
  <li><strong>Wallet:</strong> Coinbase Wallet</li>
</ul>
```

---

### Feature Request Template

```html
<h2>💡 Feature Request: [Title]</h2>

<h3>Problem Statement</h3>
<p>What problem does this solve?</p>

<h3>Proposed Solution</h3>
<p>Describe your ideal solution.</p>

<h3>Benefits</h3>
<ul>
  <li>Benefit 1</li>
  <li>Benefit 2</li>
  <li>Benefit 3</li>
</ul>

<h3>Alternatives Considered</h3>
<p>Other approaches you thought about.</p>
```

---

### Tutorial/Guide Template

```html
<h2>📚 Guide: [Title]</h2>

<h3>Introduction</h3>
<p>Brief overview of what this guide covers.</p>

<h3>Prerequisites</h3>
<ul>
  <li>Requirement 1</li>
  <li>Requirement 2</li>
</ul>

<h3>Step-by-Step Instructions</h3>

<h4>Step 1: [Action]</h4>
<p>Detailed explanation.</p>

<h4>Step 2: [Action]</h4>
<p>Detailed explanation.</p>

<h3>Tips & Tricks</h3>
<blockquote>
  Pro tip: Important callout or helpful hint.
</blockquote>

<h3>Common Issues</h3>
<p>Solutions to problems users might encounter.</p>
```

---

### Announcement Template

```html
<h2>📢 [Announcement Title]</h2>

<p><strong>TL;DR:</strong> Quick summary in one sentence.</p>

<h3>What's New</h3>
<ul>
  <li>Feature A</li>
  <li>Feature B</li>
  <li>Feature C</li>
</ul>

<h3>Details</h3>
<p>Full explanation of the changes.</p>

<h3>What This Means for You</h3>
<ol>
  <li>Impact 1</li>
  <li>Impact 2</li>
</ol>

<h3>Next Steps</h3>
<p>Action items or things to try.</p>
```

---

## CSS Styling Reference

All styling is applied via `.contentText` class in Forum.module.css:

```css
/* Headings */
.contentText h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #2F5D50;
  margin: 1.5rem 0 1rem 0;
}

/* Lists */
.contentText ul {
  list-style-type: disc;
  margin: 1rem 0;
  padding-left: 2rem;
}

.contentText li {
  margin: 0.5rem 0;
  line-height: 1.6;
}

/* And more... */
```

---

## Testing Your Formatting

1. Write your post with HTML tags
2. Use the preview feature (if available)
3. Check spacing, lists, and headings render correctly
4. Look for proper paragraph breaks
5. Verify nested lists indent properly

---

## Migration Notes

### Old Posts Without Proper Formatting

If you have existing posts that need reformatting:

**Before:**
```
Bug Report

What happened: The button doesn't work
Steps:
- Click the button
- See the error
Priority: High
```

**After:**
```html
<h2>🐛 Bug Report</h2>

<h3>What Happened</h3>
<p>The button doesn't work</p>

<h3>Steps to Reproduce</h3>
<ul>
  <li>Click the button</li>
  <li>See the error</li>
</ul>

<p><strong>Priority:</strong> High</p>
```

---

## Support

If you encounter formatting issues:

1. Check this guide for proper HTML syntax
2. View page source to see how well-formatted posts are structured
3. Report persistent issues in the Bug Reports category
4. Ask questions in the General Discussion forum

---

## Examples in Production

See these forum threads for formatting examples:
- **Bug Reporting** - Template with all formatting features
- **Introduction to SpiritDAO** - Headings and lists
- **Feature Suggestions** - Mixed content formatting

---

*Last Updated: January 27, 2026*
*Related Fix: Forum.module.css rich text styling enhancement*
