/** Allow only safe URL schemes in rendered markdown. */
export function safeUrlTransform(url: string): string {
  const trimmed = url.trim()
  if (!trimmed || trimmed.startsWith('#')) return trimmed

  try {
    const parsed = new URL(trimmed, 'https://example.invalid')
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:'
    ) {
      return trimmed
    }
  } catch {
    /* fall through */
  }
  return ''
}
