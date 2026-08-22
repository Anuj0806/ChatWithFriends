# Chat App — Frontend

React 19 + Vite. Talks to the `chatapp-backend` API over HTTP and
WebSocket (STOMP over SockJS).

## Configure the backend URL

```bash
cp .env.example .env
# edit .env if the backend isn't on localhost:2000
```

## Run with Docker

```bash
docker build -t chatapp-frontend .
docker run -p 3000:80 chatapp-frontend
```

(Requires a Vite build-time `.env`, or edit `src/private/constant/config.js`
directly, since the static build bakes the API host in at build time.)

## Run without Docker

```bash
npm install
npm run dev
```

Runs on `http://localhost:3000`. Make sure the backend's CORS
`ALLOWED_ORIGINS` (in `chatapp-backend`'s `SecurityConfig`) includes this
origin.

## Build for production

```bash
npm run build
```

Outputs static files to `dist/`, servable by any static host / nginx (see
the included `Dockerfile`).

## Structure

- `src/private/pages/` — route-level pages (Login, Signup, Home, Private
  Chat, Forgot Password)
- `src/private/services/api.js` — axios instance, auto-attaches the JWT
- `src/private/constant/config.js` — API host/port, WS URL, AES key
- `src/components/` — shared UI (inputs, social login button)
- `src/components/ui/` — shadcn-style primitives (Button, Input, Avatar,
  ScrollArea)

## Chat features

Public + private chat both support typing indicators, read receipts
(✓ / ✓✓), and emoji reactions (double-click a message, or hover for the
🙂 button). See `PrivateChat.jsx`.
