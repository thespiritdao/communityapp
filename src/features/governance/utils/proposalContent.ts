/**
 * Proposal body content normalization.
 *
 * Proposals natively speak MARKDOWN (composed in a textarea, rendered with
 * ReactMarkdown, and written on-chain as `# Title\n\nbody`). The forum speaks
 * TipTap HTML. When a proposal is populated from a forum thread, the HTML must
 * be converted to markdown — and legacy proposals that already stored raw HTML
 * must still display as rich text. One converter serves both:
 *
 *  - htmlToMarkdown(html)       — TipTap tag subset → markdown
 *  - normalizeProposalBody(s)   — auto-detect: HTML in → markdown out; markdown
 *                                 passes through untouched (use before ReactMarkdown)
 *  - proposalExcerpt(s, max)    — plain-text excerpt for display cards
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Does this string look like HTML markup (vs markdown/plain text)? */
export function looksLikeHtml(s: string): boolean {
  return /<\/?(p|h[1-6]|ul|ol|li|strong|em|b|i|u|s|a|br|blockquote|pre|code|span|div)\b[^>]*>/i.test(
    s,
  );
}

/**
 * Convert the TipTap-generated HTML subset our forum produces into markdown.
 * Intentionally small: handles the tags TipTap StarterKit emits. Unknown tags
 * are stripped, their text content kept.
 */
export function htmlToMarkdown(html: string): string {
  let s = html.replace(/\r\n/g, '\n');

  // Line-level structure first.
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, inner) => {
    return `\n${'#'.repeat(Number(lvl))} ${inner.trim()}\n\n`;
  });
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, inner) => {
    const text = inner
      .replace(/<\/?p[^>]*>/gi, '\n')
      .trim()
      .split('\n')
      .filter((l: string) => l.trim())
      .map((l: string) => `> ${l.trim()}`)
      .join('\n');
    return `\n${text}\n\n`;
  });
  s = s.replace(/<pre[^>]*>(?:<code[^>]*>)?([\s\S]*?)(?:<\/code>)?<\/pre>/gi, (_, inner) => {
    return `\n\`\`\`\n${decodeEntities(inner).trim()}\n\`\`\`\n\n`;
  });

  // Lists — ordered and unordered, single level (what TipTap StarterKit emits
  // for forum posts; nested lists degrade gracefully to flat items).
  s = s.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => {
    const ordered = tag.toLowerCase() === 'ol';
    let idx = 0;
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, li: string) => {
      idx++;
      const text = li.replace(/<\/?p[^>]*>/gi, ' ').trim();
      return `${ordered ? `${idx}.` : '-'} ${text}\n`;
    });
    return `\n${items}\n`;
  });

  // Inline marks.
  s = s.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');
  s = s.replace(/<(s|del|strike)[^>]*>([\s\S]*?)<\/\1>/gi, '~~$2~~');
  s = s.replace(/<u[^>]*>([\s\S]*?)<\/u>/gi, '$1'); // markdown has no underline
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Paragraphs → blank-line separated text.
  s = s.replace(/<p[^>]*>/gi, '');
  s = s.replace(/<\/p>/gi, '\n\n');

  // Strip anything left (spans, divs, mentions markup, etc.) keeping content.
  s = s.replace(/<[^>]+>/g, '');

  s = decodeEntities(s);

  // Collapse excess blank lines and trim.
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

/**
 * Normalize a proposal body for markdown rendering. Legacy rows (and any
 * still-HTML input) are converted; markdown/plain text passes through.
 */
export function normalizeProposalBody(body: string | null | undefined): string {
  if (!body) return '';
  return looksLikeHtml(body) ? htmlToMarkdown(body) : body;
}

/**
 * Plain-text excerpt for proposal display cards: normalize to markdown, then
 * strip markdown syntax down to readable text.
 */
export function proposalExcerpt(
  body: string | null | undefined,
  maxLength = 200,
): string {
  let text = normalizeProposalBody(body);
  text = text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/```[\s\S]*?```/g, ' ') // code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/(\*\*|__|~~)/g, '') // bold/strike marks
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2') // italics
    .replace(/^>\s?/gm, '') // blockquote marks
    .replace(/^[-*]\s+/gm, '') // list bullets
    .replace(/^\d+\.\s+/gm, '') // ordered bullets
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}
