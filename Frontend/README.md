# MindEase 🌿 - Frontend Architecture

This document outlines the frontend structure and critical UI/UX design patterns implemented in the MindEase React application.

---

# 📁 Project Structure

The frontend is built with React 18, TypeScript, and Vite, structured to separate global state, API communication, and presentation components.

```text
src/
├── api/                # Network communication layer
│   ├── auth.ts         # Google OAuth and refresh token rotation logic
│   ├── client.ts       # Axios instance with interceptors for auth headers
│   ├── messages.ts     # SSE (Server-Sent Events) fetch wrapper for real-time streaming
│   └── threads.ts      # Thread CRUD operations
│
├── components/         # Presentation and UI logic
│   ├── auth/           # Login screen and Google OAuth wrapper
│   │   ├── LoginPage    
│   ├── chat/           # Core messaging interface
│   │   ├── ChatArea
│   │   ├── MessageList
│   │   ├── Input
│   │   └── Bubbles
│   │
│   └── sidebar/        # Navigation, thread history, and user profile display
│   │   ├── Sidebar
│   │   ├── ThreadItem
│
├── store/              # Zustand global state management
│   ├── authStore.ts    # Session state, login, and silent refresh logic
│   └── chatStore.ts    # Thread tracking, message caching, and streaming state
│
├── types/              # Global TypeScript interfaces
│   └── index.ts        # Definitions for Thread, Message, User, and SSE tokens
│
├── App.tsx             # Root component handling auth routing and layout
├── index.css           # Tailwind directives and custom CSS animations
└── main.tsx            # Application entry point
```

---

# ✨ Critical UI/UX Implementations

MindEase is designed as a mental wellness tool, meaning the UI must feel calm, responsive, and completely seamless. The following critical patterns enforce this experience.

---

## 1. Lazy Thread Initialization (Zero Ghost Threads)

To keep the database and sidebar clean, clicking **"New Conversation"** does **not** instantly trigger an API call.

Instead:

- The frontend temporarily clears the `activeThreadId`
- A fresh empty chat window is rendered immediately
- The actual `createThread` backend request is deferred until the user sends their first message

This prevents the creation of empty or abandoned conversations ("ghost threads") in the database.

---

## 2. Optimistic Reordering & Timestamping

When a user sends a message in an older thread, that thread should instantly move to the top of the **Recents** list.

### Frontend Behavior

- The thread is optimistically removed from its current position
- It is immediately inserted at index `0`
- A temporary `Date.now()` timestamp is assigned for instant UI responsiveness

### Synchronization Step

After the AI finishes generating its response:

- The frontend silently refetches the actual `updated_at` timestamp from the backend
- The temporary timestamp is replaced without causing visual jumps or layout flickering

This creates a smooth, real-time messaging experience.

---

## 3. Thread-Isolated Streaming State

AI responses are streamed token-by-token using **Server-Sent Events (SSE)**.

Users may switch between conversations while a response is still generating, so streaming state must remain isolated to the originating thread.

### Store Design

The global Zustand store tracks:

```ts
streamingThreadId
streamingContent
```

### Rendering Logic

The UI only renders the streaming typing bubble when:

```ts
activeThreadId === streamingThreadId
```

This ensures partially streamed responses never appear inside the wrong conversation.

---

## 4. Therapeutic Visual Design

MindEase intentionally avoids harsh or overstimulating visual styles commonly found in traditional tech interfaces.

### Design Principles

- No pure black dark mode
- No neon accent colors
- Soft contrast and calming palettes
- Rounded, approachable components
- Subtle motion and low-stress animations

The overall goal is to maintain a grounded, anxiety-free user experience appropriate for a mental wellness platform.

---

# 🛠️ Core Frontend Stack

| Technology | Purpose |
|---|---|
| React 18 | UI rendering |
| TypeScript | Type safety |
| Vite | Fast development/build tooling |
| Tailwind CSS | Styling and design system |
| Zustand | Global state management |
| Axios | API communication |
| Server-Sent Events (SSE) | Real-time AI response streaming |

---

# 🌱 Architectural Philosophy

MindEase follows a frontend architecture centered around:

- **Low-friction interaction**
- **Optimistic UI updates**
- **Real-time responsiveness**
- **Thread-safe streaming**
- **Emotionally calming design**

The application prioritizes emotional comfort and seamless interaction as much as technical performance.