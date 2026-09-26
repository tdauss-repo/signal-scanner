export interface CopyTextDependencies {
  clipboard?: { writeText(text: string): Promise<void> }
  legacyCopy(text: string): boolean
}

export type CopyTextResult =
  | { copied: true; method: 'clipboard' | 'legacy' }
  | { copied: false; method: 'manual' }

/** Compatibility path for HTTP/LAN contexts and browsers without Clipboard API access. */
export function legacyBrowserCopy(text: string, doc: Document = document): boolean {
  if (!doc.body || typeof doc.execCommand !== 'function') return false
  const activeElement = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
  const textarea = doc.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  doc.body.appendChild(textarea)
  try {
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return doc.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea.remove()
    activeElement?.focus()
  }
}

const browserDependencies = (): CopyTextDependencies => ({
  clipboard: typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
    ? navigator.clipboard : undefined,
  legacyCopy: (text) => typeof document !== 'undefined' && legacyBrowserCopy(text, document),
})

/** Clipboard API first, selected-text compatibility copy second, manual selection last. */
export async function copyText(text: string, dependencies: CopyTextDependencies = browserDependencies()): Promise<CopyTextResult> {
  if (dependencies.clipboard) {
    try {
      await dependencies.clipboard.writeText(text)
      return { copied: true, method: 'clipboard' }
    } catch {
      // Permission denial and insecure-context rejection continue to the compatibility path.
    }
  }
  try {
    if (dependencies.legacyCopy(text)) return { copied: true, method: 'legacy' }
  } catch {
    // The exact content is returned to the caller for manual selection.
  }
  return { copied: false, method: 'manual' }
}
