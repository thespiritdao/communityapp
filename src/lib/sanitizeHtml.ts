// src/lib/sanitizeHtml.ts
//
// The single place member-authored HTML is cleaned before it reaches
// dangerouslySetInnerHTML. Forum posts come from the Tiptap editor and
// knowledge-base text from editors, but either can be written straight to the
// database through the API, so the renderer must not trust it.
//
// Allows ordinary rich-text markup (headings, lists, links, images, tables,
// code). Strips scripts, event handlers, iframes, forms, inline styles and
// javascript: URLs; data: URLs survive only on images (pasted images from
// the editor). Works on the server (jsdom) and in the browser.

import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sub', 'sup',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'width', 'height', 'colspan', 'rowspan', 'class', 'data-type', 'data-id', 'data-label'];

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  // External links open in a new tab (as the editor writes them) without
  // handing the opener to the target page.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    // Arbitrary inline CSS is not allowed (it can overlay the page). Images get
    // the one style existing content relies on.
    if (node.tagName === 'IMG') {
      node.setAttribute('style', 'max-width:100%;height:auto');
    }
  });
}

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return '';
  ensureHooks();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
}

/** An href that is safe to render: http(s), mailto, or site-relative. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  return /^(?:https?:|mailto:|\/(?!\/)|#)/i.test(trimmed) ? trimmed : undefined;
}
