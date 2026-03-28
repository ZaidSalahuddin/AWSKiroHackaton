# Hack A Ton Project

This is why we hack

you are not the sigma

instagram is for uncs

you got this twih </3 </3

## Common Commands

```bash
# Run both API and client dev servers concurrently
npm run dev

# Run API tests
npm run test:api

# Run client tests
npm run test:client
```

## Environment Variables

`api/src/index.ts` loads `.env` automatically at startup via `dotenv/config`. Copy `.env` and fill in the required values before running the API:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign/verify JWT tokens |
| `PORT` | Port the Express server listens on (default `3000`) |
| `OPENWEATHER_API_KEY` | API key for OpenWeatherMap weather data |
| `VT_DINING_API_URL` | Base URL for the VT Dining Services menu feed |

## Auth Middleware

`api/src/middleware/auth.ts` exports `authMiddleware` — an Express middleware that validates JWT bearer tokens.

- Reads the `Authorization: Bearer <token>` header
- Verifies the token against `JWT_SECRET` (env var, falls back to `"secret"` in dev)
- Attaches the decoded `sub` claim to `req.studentId` for downstream handlers
- Returns `401 unauthorized` if the header is missing or the token is invalid

The `AuthRequest` interface extends Express `Request` with the optional `studentId: string` field.

## Dietary Filter Middleware

`api/src/middleware/dietaryFilter.ts` exports three functions for server-side dietary filtering.

- `dietaryFilterMiddleware` — Express middleware that fetches the student's `DietaryProfile` from the DB (via `studentId` on the request) and attaches it to `req.dietaryProfile`; non-fatal if the fetch fails
- `applyDietaryFilter(items, profile)` — pure function that removes items conflicting with the student's active restrictions/allergens; items with `allergen_data_complete: false` are excluded unless `profile.opt_in_incomplete === true`; returns items unfiltered when profile is null/inactive
- `injectAllergenWarning(item, profile)` — pure function that returns the item with `allergen_warning: true` when any item allergen overlaps with the student's profile; returns item unchanged when profile is null/inactive

Filtering is applied server-side before response serialization and is never done inline in route handlers.

## Recency Score Engine

`api/src/services/recencyScoreEngine.ts` exports `decay(t_hours)` and `recencyScore(ratings, now?)`.

- `decay(t)` — exponential decay: `exp(-λ * t)` where `λ = ln(2)/6 ≈ 0.1155`, giving a half-life of 6 hours
- `recencyScore(ratings)` — weighted average of star ratings: `Σ[stars_i * decay(t_i)] / Σ[decay(t_i)]`; returns `0` for empty input
- Satisfies Property 4 (decay ratio ≥ 2× at 6h) and Property 5 (ranked list invariants) from the design spec

Tests live in `api/src/__tests__/recencyScoreEngine.spec.ts` and cover unit cases plus property-based tests using `fast-check` (≥100 runs each).

## WebSocket Client

`client/src/websocket/wsClient.ts` exports a singleton `wsClient` — a `VTDiningWebSocketClient` instance connected to `$EXPO_PUBLIC_WS_URL/ws` (defaults to `ws://localhost:3000/ws`).

- `connect()` / `disconnect()` — open or intentionally close the connection
- `subscribe(channel)` / `unsubscribe(channel)` — manage channel subscriptions; on reconnect, all active subscriptions are automatically re-sent so the server can replay last known state
- `onMessage(handler)` — register a message handler; returns an unsubscribe function
- Reconnects automatically on unexpected close with exponential backoff: starts at 1 s, doubles each attempt, caps at 30 s
- Channels follow the server-defined naming convention: `rankings:{hall_id}`, `trending`, `social:{student_id}`, `photos:{item_id}`

## Menu Item Detail Screen

`client/src/screens/MenuItemDetailScreen.tsx` renders the full detail view for a single menu item.

- Displays name, description, allergen tags, and an allergen warning banner when the item matches the student's dietary profile
- Shows a health score badge (color-coded green/amber/red) and a full nutrition panel (calories, protein, carbs, fat, fiber, sodium); shows "Nutrition info unavailable" when data is missing
- Renders an availability trend bar chart grouped by day-of-week, built from the item's appearance history
- Shows the predicted next appearance (day + meal period) or "Not enough history to predict" when insufficient data exists
- Subscribe/unsubscribe button for availability push notifications (`POST /api/menu-items/:id/subscribe`, `DELETE /api/menu-items/:id/subscribe`)
- Photo reviews section displays CDN images with a report button; new photos pushed via the `photos:{item_id}` WebSocket channel are prepended with a fade-in animation within 30 s
- Pull-to-refresh reloads all data; all network calls use `Promise.allSettled` so a single failure doesn't block the rest of the screen
