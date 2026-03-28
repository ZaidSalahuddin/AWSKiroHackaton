# Hack A Ton Project

This is why we hack

you are not the sigma

instagram is for uncs

you got this twih </3 </3

## Auth Middleware

`api/src/middleware/auth.ts` exports `authMiddleware` — an Express middleware that validates JWT bearer tokens.

- Reads the `Authorization: Bearer <token>` header
- Verifies the token against `JWT_SECRET` (env var, falls back to `"secret"` in dev)
- Attaches the decoded `sub` claim to `req.studentId` for downstream handlers
- Returns `401 unauthorized` if the header is missing or the token is invalid

The `AuthRequest` interface extends Express `Request` with the optional `studentId: string` field.

## Recency Score Engine

`api/src/services/recencyScoreEngine.ts` exports `decay(t_hours)` and `recencyScore(ratings, now?)`.

- `decay(t)` — exponential decay: `exp(-λ * t)` where `λ = ln(2)/6 ≈ 0.1155`, giving a half-life of 6 hours
- `recencyScore(ratings)` — weighted average of star ratings: `Σ[stars_i * decay(t_i)] / Σ[decay(t_i)]`; returns `0` for empty input
- Satisfies Property 4 (decay ratio ≥ 2× at 6h) and Property 5 (ranked list invariants) from the design spec

Tests live in `api/src/__tests__/recencyScoreEngine.spec.ts` and cover unit cases plus property-based tests using `fast-check` (≥100 runs each).