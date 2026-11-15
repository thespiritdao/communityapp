import { describe, it, expect } from 'vitest';
import { sanitizeHtml, safeHref } from '../sanitizeHtml';

describe('sanitizeHtml', () => {
  it('keeps ordinary editor markup', () => {
    const html = '<p>Hi <strong>there</strong></p><ul><li>one</li></ul><a href="/docs">x</a>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('removes scripts and event handlers', () => {
    const out = sanitizeHtml('<p onclick="x()">a</p><script>alert(1)</script><img src="https://e.org/a.png" onerror="alert(1)">');
    expect(out).not.toMatch(/script|onclick|onerror|alert/i);
    expect(out).toContain('<img src="https://e.org/a.png"');
  });

  it('drops javascript: links and iframes', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a><iframe src="https://e.org"></iframe>');
    expect(out).not.toMatch(/javascript|iframe/i);
  });

  it('replaces inline CSS: images get a fixed style, others none', () => {
    const out = sanitizeHtml('<div style="position:fixed;inset:0">x</div><img src="/a.png" style="width:9999px">');
    expect(out).not.toContain('position:fixed');
    expect(out).toContain('style="max-width:100%;height:auto"');
  });

  it('keeps pasted data: images', () => {
    expect(sanitizeHtml('<img src="data:image/png;base64,AAAA">')).toContain('data:image/png');
  });

  it('opens external links in a new tab with noopener', () => {
    expect(sanitizeHtml('<a href="https://e.org" target="_top" rel="opener">x</a>')).toContain('rel="noopener noreferrer"');
  });
});

describe('safeHref', () => {
  it('accepts http(s), mailto and site paths', () => {
    expect(safeHref('https://e.org/f.pdf')).toBe('https://e.org/f.pdf');
    expect(safeHref('/docs/a')).toBe('/docs/a');
  });
  it('rejects script and protocol-relative URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref(' JaVaScRiPt:alert(1)')).toBeUndefined();
    expect(safeHref('//evil.example')).toBeUndefined();
  });
});
