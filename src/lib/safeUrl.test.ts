import { describe, expect, it } from 'vitest'
import { safeUrlTransform } from './safeUrl'

describe('safeUrlTransform', () => {
  it('allows http(s) and mailto', () => {
    expect(safeUrlTransform('https://example.com/x')).toBe(
      'https://example.com/x',
    )
    expect(safeUrlTransform('http://example.com')).toBe('http://example.com')
    expect(safeUrlTransform('mailto:a@b.com')).toBe('mailto:a@b.com')
  })

  it('allows hash anchors', () => {
    expect(safeUrlTransform('#section')).toBe('#section')
  })

  it('blocks javascript and data URLs', () => {
    expect(safeUrlTransform('javascript:alert(1)')).toBe('')
    expect(safeUrlTransform('data:text/html,hi')).toBe('')
  })
})
