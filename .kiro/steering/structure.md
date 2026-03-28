# Project Structure

## Root
```
/
├── api/                        # Node.js/Express/TypeScript backend
├── client/                     # React Native/Expo/TypeScript frontend
├── tsconfig.base.json          # Shared TypeScript config
└── package.json                # Root workspace config
```

## Backend (`api/`)
```
api/
├── src/
│   ├── types/                  # Shared TypeScript interfaces (Student, MenuItem, Rating, etc.)
│   ├── services/               # One file per service domain:
│   │   ├── menuService.ts
│   │   ├── ratingService.ts
│   │   ├── recencyScoreEngine.ts
│   │   ├── trendingFeedService.ts
│   │   ├── dietaryFilterService.ts
│   │   ├── healthScoreService.ts
│   │   ├── nutritionalTrackingService.ts
│   │   ├── waitTimeService.ts
│   │   ├── recommendationEngine.ts
│   │   ├── socialService.ts
│   │   ├── photoReviewService.ts
│   │   ├── gamificationService.ts
│   │   ├── mealPlanningService.ts
│   │   ├── hokiePassportService.ts
│   │   ├── eventSpecialsService.ts
│   │   ├── availabilityService.ts
│   │   └── notificationService.ts
│   ├── routes/                 # Express route handlers (mirrors service structure)
│   ├── middleware/             # Auth (JWT), dietary filter, role checks
│   ├── workers/                # BullMQ job workers
│   ├── db/                     # PostgreSQL client + migrations
│   ├── cache/                  # Redis client + cache helpers
│   └── websocket/              # WebSocket server + channel management
└── src/__tests__/              # Jest + supertest + fast-check tests
```

## Frontend (`client/`)
```
client/
├── src/
│   ├── screens/                # One file per screen:
│   │   ├── HomeScreen.tsx
│   │   ├── TrendingScreen.tsx
│   │   ├── RecommendationsScreen.tsx
│   │   ├── SocialScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   ├── MenuItemDetailScreen.tsx
│   │   ├── RatingSubmissionScreen.tsx
│   │   ├── DietaryProfileScreen.tsx
│   │   ├── NutritionalTrackingScreen.tsx
│   │   ├── MealPlanningScreen.tsx
│   │   ├── GamificationScreen.tsx
│   │   └── HokiePassportScreen.tsx
│   ├── components/             # Reusable UI components
│   ├── api/                    # Axios client + API call functions
│   ├── websocket/              # WebSocket client with reconnect logic
│   ├── navigation/             # React Navigation setup (tab navigator)
│   └── types/                  # Client-side TypeScript types
└── src/__tests__/              # Jest + @testing-library/react-native tests
```

## Spec Files (`.kiro/specs/vt-dining-ranker/`)
- `requirements.md` — user stories and acceptance criteria
- `design.md` — architecture, data models, API contracts, correctness properties
- `tasks.md` — ordered implementation task list with property-based test subtasks

## Conventions
- Each backend service has a corresponding route file and test file
- Property-based tests live alongside unit tests in `__tests__/`
- Optional tasks (marked `*` in tasks.md) are property tests — implement for correctness guarantees, skip for faster MVP
- All API routes follow REST conventions as defined in `design.md`
- Dietary filtering is always applied as middleware, never inline in route handlers
