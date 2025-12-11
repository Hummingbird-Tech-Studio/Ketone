# Ketone

A monorepo containing three main packages: Web (Vue + Vite), API (Bun + Effect), and Shared (common schemas and types).

## Project Structure

```
ketone/                          (Root - Orchestrator)
├── package.json                 → Bun (coordinates all projects)
├── .env.local                   → Environment variables for development
│
├── api/                         (API - Bun Runtime)
│   ├── package.json             → Bun REQUIRED
│   └── src/                     → Effect HTTP Server
│
├── web/                         (Web - Vite/Vue)
│   ├── package.json             → Bun or Node (both work)
│   └── src/                     → Vue 3 application
│
└── shared/                      (Shared - Common Code)
    ├── package.json             → Shared schemas and types
    └── src/                     → @ketone/shared package
```

## Prerequisites

- **Bun** >= 1.3.0 - [Install Bun](https://bun.sh)
- **PostgreSQL** - Neon or local instance

## Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Add other environment variables as needed
```

## Installation

### Install all dependencies

```bash
# Install root dependencies (orchestration tools)
bun install

# Install API dependencies
cd api && bun install && cd ..

# Install Web dependencies
cd web && bun install && cd ..

# Install Shared dependencies
cd shared && bun install && cd ..
```

## Development

### Run individual projects

```bash
# Run API only (port 3000)
bun run dev:api

# Run Web only (port 5173)
bun run dev:web
```

### Run both projects

Run each command in a separate terminal:

```bash
# Terminal 1 - API
bun run dev:api

# Terminal 2 - Web
bun run dev:web
```

This will start:
- **API** on `http://localhost:3000`
- **Web** on `http://localhost:5173`

## Build

### Build all projects

```bash
bun run build
```

### Build individual projects

```bash
# Build API
bun run build:api

# Build Web
bun run build:web
```

## Type Checking

```bash
# Type check all TypeScript projects
bun run typecheck

# Type check API only
bun run typecheck:api

# Type check Web only
bun run typecheck:web
```

## Database Commands

```bash
# Generate Drizzle migrations
cd api && bun run db:generate

# Run migrations
cd api && bun run db:migrate

# Open Drizzle Studio
cd api && bun run db:studio
```

## Testing

```bash
# Run API integration tests
cd api && bun run test:integration

# Run Web unit tests
cd web && bun run test:unit
```

## Package Manager

This monorepo uses **Bun** as the primary package manager for all JavaScript/TypeScript projects:

- **Root**: Bun (orchestration)
- **API**: Bun (required - uses Bun-specific APIs)
- **Web**: Bun (recommended, but npm/pnpm also work)
- **Shared**: Bun

## Architecture

### API (Bun + Effect)
- **Runtime**: Bun
- **Framework**: Effect HTTP Server
- **Database**: PostgreSQL with Drizzle ORM and @effect/sql-pg
- **Authentication**: JWT with jose

### Web (Vue + Vite)
- **Framework**: Vue 3 with Composition API
- **Build Tool**: Vite
- **UI Library**: PrimeVue
- **State Management**: XState
- **Styling**: SCSS with BEM naming

### Shared (@ketone/shared)
- **Purpose**: Common code shared between API and Web
- **Contains**: Schemas (Email, Password, Response), Constants, Types

## Scripts Reference

| Command | Description |
|---------|-------------|
| `bun run dev:api` | Start API server with hot reload |
| `bun run dev:web` | Start web dev server |
| `bun run build` | Build all projects |
| `bun run build:api` | Build API |
| `bun run build:web` | Build web application |
| `bun run typecheck` | Type check all TS projects |
| `bun run typecheck:api` | Type check API |
| `bun run typecheck:web` | Type check web |

## Troubleshooting

### DATABASE_URL not found

Make sure you have a `.env.local` file in the root directory with the `DATABASE_URL` variable set. The API loads environment variables from the root `.env.local` file using the `--env-file` flag.

### Port already in use

If you get a port conflict error, make sure no other services are running on:
- Port 3000 (API)
- Port 5173 (Web)

### Kill port 3000

```bash
lsof -ti :3000 | xargs kill -9
```

### Bun command not found

Install Bun globally:
```bash
curl -fsSL https://bun.sh/install | bash
```

## License

Private project - All rights reserved
