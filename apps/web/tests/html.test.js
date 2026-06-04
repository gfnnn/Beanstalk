// Tests for the shared HTML helpers (src/build/html.js). `esc()` is the site's
// only HTML-escaping guard — every renderer pipes data-file text through it
// before it lands in markup, so a regression here is an XSS / broken-markup
// hole. `HAS_EXT` decides whether an `img` value is a final web export served
// as-is or the no-extension base path the srcset convention derives from; the
// wrong answer ships broken <img> URLs sitewide.
import { describe, it, expect } from 'vitest'
import { esc, HAS_EXT } from '../src/build/html.js'

describe('esc', () => {
  it('escapes the five characters that break text content / quoted attributes', () => {
    expect(esc('&')).toBe('&amp;')
    expect(esc('<')).toBe('&lt;')
    expect(esc('>')).toBe('&gt;')
    expect(esc('"')).toBe('&quot;')
  })

  it('escapes & first so existing entities are not double-broken in the wrong order', () => {
    // A naive replace order could turn "<" into "&lt;" and then re-escape the "&".
    expect(esc('<script>')).toBe('&lt;script&gt;')
    expect(esc('Tom & Jerry < "best"')).toBe('Tom &amp; Jerry &lt; &quot;best&quot;')
  })

  it('neutralises a script-injection attempt in an attribute-style value', () => {
    const out = esc('" onload="alert(1)')
    expect(out).not.toContain('"')
    expect(out).toBe('&quot; onload=&quot;alert(1)')
  })

  it('coerces null / undefined to an empty string (no "null" / "undefined" in markup)', () => {
    expect(esc(null)).toBe('')
    expect(esc(undefined)).toBe('')
  })

  it('coerces non-string values via String()', () => {
    expect(esc(42)).toBe('42')
    expect(esc(0)).toBe('0')
    expect(esc(false)).toBe('false')
  })

  it('leaves single quotes untouched (renderers use double-quoted attributes)', () => {
    expect(esc("it's fine")).toBe("it's fine")
  })
})

describe('HAS_EXT', () => {
  it('matches a final web export carrying a known image extension', () => {
    for (const f of ['Koi.webp', 'a/b/Koi.avif', 'Koi.jpg', 'Koi.jpeg', 'Koi.png', 'Koi.PNG']) {
      expect(HAS_EXT.test(f), f).toBe(true)
    }
  })

  it('does not match a no-extension base path (the srcset convention input)', () => {
    expect(HAS_EXT.test('/images/tattoos/foxglove')).toBe(false)
  })

  it('only matches the extension at the end of the string', () => {
    // A ".webp" in the middle of a path is not a final export.
    expect(HAS_EXT.test('/images/webp-source/foxglove')).toBe(false)
  })
})
