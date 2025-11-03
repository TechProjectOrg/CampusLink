# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

CampusLink is a social networking platform for college students built with React, TypeScript, and Vite. It enables students to connect, share opportunities, join clubs, and communicate with peers. The application features a comprehensive feed system, networking capabilities, real-time chat, and profile management.

Original design: https://www.figma.com/design/yZvdhlk5S5huZMnwcNqsJM/CampusLink-Platform-Development

## Commands

### Development
```powershell
npm i                    # Install dependencies
npm run dev             # Start development server (opens at http://localhost:3000)
```

### Build
```powershell
npm run build           # Build for production (output: build/)
```

## Architecture

### Technology Stack
- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite 6 with SWC for fast compilation
- **UI Components**: Radix UI primitives with shadcn/ui components
- **Styling**: Tailwind CSS with custom gradient and glass-morphism effects
- **Icons**: Lucide React
- **State Management**: React hooks (useState) - all state in App.tsx

### Application Structure

**Single-Page Application with Tab-Based Navigation:**
The entire application runs through `App.tsx` which manages all state and routing via a tab-based system. There is no traditional routing library - navigation is handled by changing the `activeTab` state.

**Core Pages (Tab Components):**
- `AuthPage`: Login/signup interface (shown when `!isAuthenticated`)
- `FeedPage`: Main feed with opportunities (internships, hackathons, events, contests, club activities)
- `ProfilePage`: User profile display and editing
- `SearchPage`: Student search with filters
- `NetworkPage`: Connection requests and network management
- `ChatPage`: Messaging interface
- `ClubsPage`: Club discovery and membership management
- `NotificationsPage`: Notification center

**State Management Pattern:**
All application state lives in `App.tsx` and is passed down via props. Handler functions defined in App.tsx are passed to child components for state mutations. This includes:
- Students list and connections
- Opportunities with likes, saves, comments
- Clubs and memberships
- Notifications
- Chat conversations (from mockData)

### Component Organization

```
src/
├── components/
│   ├── figma/           # Figma-generated base components
│   ├── ui/              # shadcn/ui components (accordion, button, card, dialog, etc.)
│   ├── [Page].tsx       # Page-level components (AuthPage, FeedPage, etc.)
│   ├── [Feature]Card.tsx # Feature cards (OpportunityCard, ProfileCard, etc.)
│   └── Navbar.tsx       # Main navigation component
├── lib/
│   └── mockData.ts      # Mock data for students, opportunities, clubs, conversations
├── types/
│   └── index.ts         # TypeScript interfaces for all entities
└── styles/              # Global styles and Tailwind configuration
```

### Key Types

Defined in `src/types/index.ts`:
- **Student**: User profiles with skills, projects, connections, pendingRequests
- **Opportunity**: Feed items (internship/hackathon/event/contest/club) with likes, comments, saved
- **Club**: Student organizations with members and admin
- **Comment**: Nested comments on opportunities
- **ChatConversation**: Chat metadata with unread counts
- **Notification**: System notifications with type-based routing

### Component Communication Pattern

```
App.tsx (State Owner)
    ├── Manages: students, opportunities, clubs, notifications
    ├── Handlers: handleLike, handleSave, handleConnect, handleJoinClub, etc.
    └── Props Flow: State + handlers → Page components → Feature cards
```

### Data Flow
1. User interaction in child component (e.g., OpportunityCard)
2. Handler function called (passed via props from App.tsx)
3. State updated in App.tsx via setState
4. Re-render cascades down to affected components

### Styling Conventions

**Tailwind + Custom Classes:**
- `gradient-primary`, `gradient-secondary`, `gradient-success`: Brand gradient backgrounds
- `glass-morphism`: Glassmorphism effect (backdrop blur + transparency)
- `hover-lift`: Hover animation with scale and shadow
- Extensive use of `backdrop-blur-xl`, rounded corners (`rounded-2xl`), and shadows

**Animation Classes:**
- `animate-fade-in`, `animate-slide-in-down`, `animate-slide-in-up`
- Staggered animations using inline `style={{ animationDelay: '...' }}`

**Responsive Design:**
- Mobile-first with bottom navigation bar
- Desktop navigation in top bar
- Hidden sidebars on mobile (`hidden xl:block`)
- Grid layouts: `lg:grid-cols-12` with adaptive column spans

### Mock Data

All data in `src/lib/mockData.ts` is currently static:
- 7 mock students including a "current" user
- Multiple opportunities with full comment threads
- Mock clubs, conversations, and notifications
- Data mutations are in-memory only (no persistence)

**Current User ID**: Always `'current'` - hardcoded throughout the application

## Development Guidelines

### When Adding Features

1. **New Pages**: Create `[Name]Page.tsx` in `src/components/`, add handler functions in `App.tsx`, extend the tab system in Navbar
2. **New Entity Types**: Define TypeScript interfaces in `src/types/index.ts` first
3. **State Management**: Always add state to `App.tsx`, never create isolated component state for shared data
4. **Mock Data**: Update `src/lib/mockData.ts` to include sample data for new features

### UI Component Usage

This project uses **shadcn/ui components** (MIT licensed). When adding UI elements:
- Import from `./components/ui/[component]`
- Available components: accordion, alert, avatar, badge, button, card, carousel, checkbox, dialog, dropdown-menu, form, input, label, select, separator, tabs, toast, tooltip, etc.
- Extend with Radix UI primitives if needed (already in dependencies)
- Use Lucide React for icons

### Code Patterns to Follow

**Handler Naming Convention:**
- `handle[Action]`: e.g., `handleLike`, `handleConnect`, `handleJoinClub`
- `on[Action]` for prop callbacks: e.g., `onLike`, `onConnect`, `onJoinClub`

**Component Props Interface:**
- Always define props interface with descriptive names
- Use optional props (`?`) for callbacks that might not be provided
- Include `currentUserId` when actions affect user-specific state

**State Updates:**
- Use `.map()` for updating items in arrays
- Return new objects with spread operator for immutability
- Filter arrays when removing items

Example:
```typescript
setOpportunities(opportunities.map(opp => 
  opp.id === opportunityId 
    ? { ...opp, likes: [...opp.likes, currentUserId] }
    : opp
));
```

### Path Aliases

Vite config includes `@` alias pointing to `./src`:
```typescript
import { Button } from '@/components/ui/button';
```

However, current codebase uses relative imports - be consistent with the existing pattern.

### Styling Guidelines

- Use Tailwind utility classes for styling
- Prefer gradient classes for primary actions
- Use `glass-morphism` for cards and overlays
- Add `hover-lift` for interactive elements
- Implement smooth transitions: `transition-all duration-300`
- Use responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`

### Browser Compatibility

Target modern browsers supporting:
- ESNext features (Vite build target)
- CSS backdrop-filter (for glass-morphism)
- Flexbox and Grid layouts
