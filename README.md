# Mindful — Frontend

React 18 + TypeScript + Tailwind chat interface for the Mindful mental-health backend.

## Stack
- **React 18** + **TypeScript**
- **Tailwind CSS** — warm cream / forest-green design system
- **Zustand** — `authStore` (login / refresh / logout) + `chatStore` (threads + messages)
- **@react-oauth/google** — Google One-Tap & OAuth button
- **Axios** — REST calls with automatic Bearer token + silent 401 refresh
- **fetch + ReadableStream** — SSE streaming for therapist responses

## Project structure

```
src/
├── api/
│   ├── client.ts        # Axios instance, token storage, refresh interceptor
│   ├── auth.ts          # loginWithGoogle, refreshToken, logout
│   ├── threads.ts       # getThreads, createThread, deleteThread
│   └── messages.ts      # getMessages, streamMessage (SSE)
├── store/
│   ├── authStore.ts     # Auth state + actions (Zustand)
│   └── chatStore.ts     # Threads + messages + streaming state (Zustand)
├── types/
│   └── index.ts         # Shared TS interfaces
├── components/
│   ├── auth/
│   │   └── LoginPage.tsx
│   ├── sidebar/
│   │   ├── Sidebar.tsx
│   │   └── ThreadItem.tsx
│   └── chat/
│       ├── ChatArea.tsx
│       ├── MessageList.tsx
│       ├── MessageBubble.tsx
│       ├── MessageInput.tsx
│       └── EmptyState.tsx
├── App.tsx
├── main.tsx
└── index.css
```

## Getting started

```bash
cp .env.example .env.local
# Fill in VITE_GOOGLE_CLIENT_ID and VITE_API_URL

npm install
npm run dev
```

## Key design decisions

**Silent refresh on load** — `App.tsx` calls `tryRefresh()` on mount. The browser sends the
HttpOnly `refresh_token` cookie automatically. If it succeeds the user is signed in without seeing
the login screen. If it fails, `LoginPage` is shown.

**SSE streaming** — `messages.ts#streamMessage` uses `fetch` + `ReadableStream` (not `EventSource`
or Axios). Tokens are buffered on `\n\n` boundaries, parsed as `{type, content}` JSON, and applied
to `chatStore.streamingContent`. On `type: done` the partial string is committed as a full
assistant message.

**Deduplication of refresh calls** — the Axios response interceptor guards parallel 401s with a
single shared `_refreshPromise` so the refresh endpoint is only hit once per expiry cycle.

**Thread cache** — loaded message history is kept in `chatStore.messages[threadId]` and is not
re-fetched unless the tab is refreshed.
