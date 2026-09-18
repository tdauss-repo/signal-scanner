/** Shared bounded server transport; the existing audit retains its fallback/error policy. */
export async function fetchPage(url: URL, method: 'GET' | 'HEAD', headers: Record<string, string>, signal: AbortSignal, maxBytes = 1_000_000, redirect: 'follow' | 'manual' = 'follow') {
  const response = await fetch(url, { method, redirect, signal, headers })
  if (method === 'HEAD' || !response.body) return { response, body: '' }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel()
      throw new RangeError('Homepage HTML is larger than the 1 MB audit limit.')
    }
    chunks.push(value)
  }
  const combined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength }
  return { response, body: new TextDecoder().decode(combined) }
}
