import { apiClient, getAccessToken, API_BASE } from './client'
import type { Message, SSEToken } from '../types'

export const getMessages = (threadId: string) =>
  apiClient.get<Message[]>(`/threads/${threadId}/messages`).then((r) => r.data)

/**
 * Stream a message via SSE.
 *
 * @param threadId  Target thread
 * @param content   User message text
 * @param onToken   Called with each streamed token
 * @param onDone    Called when the stream closes normally
 * @param onError   Called on network / parse error
 * @returns abort() function to cancel the stream
 */
export function streamMessage(
  threadId: string,
  content: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: Error) => void
): () => void {
  const controller = new AbortController()

  ;(async () => {
    try {
      const response = await fetch(`${API_BASE}/threads/${threadId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Split on double-newline (SSE event boundary)
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data:')) continue

            const raw = line.slice(5).trim()
            if (!raw) continue

            try {
              const evt: SSEToken = JSON.parse(raw)
              if (evt.type === 'token') onToken(evt.content)
              else if (evt.type === 'done') onDone()
            } catch {
              // malformed chunk — skip
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError(err instanceof Error ? err : new Error('Stream error'))
      }
    }
  })()

  return () => controller.abort()
}
