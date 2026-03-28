# Tech Stack

## Monorepo Structure
- `api/` — Node.js + Express + TypeScript (backend)
- `client/` — React Native + Expo + TypeScript (mobile/web frontend)
- Shared `tsconfig` base across workspaces

## Backend (`api/`)
- **Runtime**: Node.js
- **Framework**: Express
- **Language**: TypeScript
- **Database**: PostgreSQL (primary data store)
- **Cache**: Redis
- **Queue**: BullMQ (backed by Redis)
- **Real-time**: WebSocket (via Express)
- **Object Storage**: S3-compatible (photo reviews, CDN-served)
- **Push Notifications**: FCM (Android) + APNs (iOS)

## Frontend (`client/`)
- **Framework**: React Native + Expo (TypeScript template)
- **Navigation**: React Navigation (tab navigator)
- **HTTP Client**: Axios with JWT interceptor
- **WebSocket**: Custom client with exponential-backoff reconnect

## External Services
- **Weather**: OpenWeatherMap API (polled every 15 min)
- **Menu Data**: VT Dining Services (polled every 5 min)
- **Meal Plan**: Hokie Passport API (polled daily + on-demand)

## Testing
- **Property-based tests**: `fast-check` (≥100 iterations per property)
- **API tests**: `jest` + `supertest`
- **Client tests**: `jest` + `@testing-library/react-native`
- Property test tag format: `Feature: vt-dining-ranker, Property {N}: {description}`

## Common Commands

### API
```bash
# Install dependencies
cd api && npm install

# Run tests (single pass)
cd api && npx jest --runInBand

# Run a specific test file
cd api && npx jest src/path/to/test.spec.ts

# Run migrations
cd api && npm run migrate
```

### Client
```bash
# Install dependencies
cd client && npm install

# Run tests (single pass)
cd client && npx jest --runInBand

# Start Expo dev server (run manually)
cd client && npx expo start
```

### Root
```bash
# Install all workspaces
npm install
```

## Key Architectural Patterns
- Recency-weighted ranking via exponential decay: `decay(t) = exp(-λ * t_hours)`, `λ = ln(2)/6 ≈ 0.1155`
- Dietary filtering applied server-side as middleware before response serialization
- BullMQ workers handle async jobs: `recency.recompute`, `trending.refresh`, `notification.*`, `availability.predict`
- WebSocket channels: `rankings:{hall_id}`, `trending`, `social:{student_id}`, `photos:{item_id}`
- Redis cache TTLs: recency scores 30s, trending 60s, weather 15min, menu 5min, meal plan balance 24h
