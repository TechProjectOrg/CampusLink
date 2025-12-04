# Gemini Notes

This file provides guidance to me, Gemini, when working with code in this repository.

## Project Overview

CampusLink is a social networking platform for college students built with React, TypeScript, and Vite for the frontend, and a Node.js/Express backend. It enables students to connect, share opportunities, join clubs, and communicate with peers.

## Project Structure

The project is organized into a monorepo-like structure with separate `frontend` and `backend` directories.

- **`frontend/`**: Contains the React frontend application.
  - Source code is in `frontend/src/`.
  - The Vite config is `frontend/vite.config.ts`.
  - TailwindCSS config is `frontend/tailwind.config.js`.

- **`backend/`**: Contains the Node.js/Express backend application.
  - The backend code is in `backend/server/`.
  - The main server file is `backend/server/src/server.ts`.

- **`prisma/`**: Contains the Prisma schema and migrations for the database.

- **`package.json`**: The root `package.json` manages dependencies for both frontend and backend, and contains scripts to run them.

## Commands

### Development
- `npm run dev`: Starts the frontend development server (from the `frontend` directory).
- `npm run server:dev`: Starts the backend development server.

### Build
- `npm run build`: Builds the frontend for production.
- `npm run server:build`: Builds the backend for production.

### Starting Production Server
- `npm run server:start`: Starts the backend production server.

## Architecture

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, Radix UI.
- **Backend**: Node.js, Express, TypeScript, Prisma.
- **Database**: PostgreSQL (inferred from `pg` and `@prisma/adapter-pg`).

### Frontend Architecture
- **Single-Page Application (SPA)**: The frontend is a SPA with tab-based navigation managed in `App.tsx`.
- **State Management**: All application state is centralized in `frontend/src/App.tsx` and passed down via props.
- **Component Organization**:
  - Page components are in `frontend/src/components/`.
  - UI components are in `frontend/src/components/ui/`.
- **Mock Data**: The frontend currently uses mock data from `frontend/src/lib/mockData.ts`.

### Backend Architecture
- The backend is an Express application.
- It uses Prisma for database access.
- The main application logic is in `backend/server/src/app.ts`.

## Development Guidelines

### When Adding Features
- **Frontend**:
  - Add new pages to `frontend/src/components/`.
  - Update state management in `frontend/src/App.tsx`.
  - Update mock data in `frontend/src/lib/mockData.ts`.
- **Backend**:
  - Add new routes and logic to the Express application.
  - Update the Prisma schema in `prisma/schema.prisma` if the database model changes.

### Code Patterns to Follow
- Follow existing naming conventions (`handle[Action]`, `on[Action]`).
- Use immutable state updates.
- Use the `@` path alias which points to `frontend/src`.

### Styling
- Use Tailwind CSS utility classes.
- Follow the existing styling conventions (gradients, glass-morphism, etc.).