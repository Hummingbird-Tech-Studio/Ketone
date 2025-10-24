# Ketone

A monorepo containing three main projects: Web (Vue + Vite), API (Bun + Effect), and Sidecar (Orleans + .NET).

## Project Structure

```
ketone/                          (Root - Orchestrator)
├── package.json                 → Bun (coordinates all projects)
├── .env                         → Shared environment variables
│
├── api/                         (API - Bun Runtime)
│   ├── package.json             → Bun REQUIRED
│   └── src/index.ts             → Effect HTTP Server with Orleans integration
│
├── web/                         (Web - Vite/Vue)
│   ├── package.json             → Bun or Node (both work)
│   └── src/                     → Standard web application
│
└── sidecar/                     (Sidecar - .NET)
    ├── orleans.csproj           → .NET/C#
    └── Program.cs               → Orleans sidecar service
```

## Prerequisites

- **Bun** >= 1.0.0 - [Install Bun](https://bun.sh)
- **.NET SDK** >= 9.0 - [Install .NET](https://dotnet.microsoft.com/download)
- **PostgreSQL** - Neon or local instance

## Environment Setup

Create a `.env` file in the root directory with the following variables:

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

# Restore Sidecar dependencies
cd sidecar && dotnet restore && cd ..
```

## Development

### Run individual projects

```bash
# Run API only (port 3000)
bun run dev:api

# Run Web only (port 5173)
bun run dev:web

# Run Sidecar only (port 5174)
bun run dev:sidecar
```

### Run all projects concurrently

```bash
# Start all services at once
bun run dev
```

This will start:
- **API** on `http://localhost:3000`
- **Web** on `http://localhost:5173`
- **Sidecar** on `http://localhost:5174`

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

# Build Sidecar
bun run build:sidecar
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

## Package Manager

This monorepo uses **Bun** as the primary package manager for JavaScript/TypeScript projects:

- **Root**: Bun (orchestration)
- **API**: Bun (required - uses Bun-specific APIs)
- **Web**: Bun (recommended, but npm/pnpm also work)
- **Sidecar**: .NET CLI (dotnet)

### Why Bun?

- ⚡ **Faster** than npm/yarn/pnpm
- 🔄 **Compatible** with Node.js packages
- 🛠️ **Built-in** TypeScript support
- 📦 **Workspace** support for monorepos

## Architecture

### API (Bun + Effect)
- **Runtime**: Bun
- **Framework**: Effect HTTP Server
- **Database**: PostgreSQL with @effect/sql-pg
- **State Management**: Orleans integration via HTTP client

### Web (Vue + Vite)
- **Framework**: Vue 3 with Composition API
- **Build Tool**: Vite
- **Styling**: TailwindCSS (if configured)
- **Testing**: Vitest + Cypress

### Sidecar (Orleans + .NET)
- **Runtime**: .NET 9.0
- **Framework**: ASP.NET Core + Orleans
- **Purpose**: Distributed state management and actor model
- **Database**: PostgreSQL with ADO.NET persistence

## Git Ignore

The project uses a single `.gitignore` file at the root level that applies to all subprojects (api, web, sidecar). This centralizes ignore patterns and makes maintenance easier.

## Scripts Reference

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all services concurrently |
| `bun run dev:api` | Start API server with hot reload |
| `bun run dev:web` | Start web dev server |
| `bun run dev:sidecar` | Start Orleans sidecar |
| `bun run build` | Build all projects |
| `bun run build:api` | Build API |
| `bun run build:web` | Build web application |
| `bun run build:sidecar` | Build sidecar |
| `bun run typecheck` | Type check all TS projects |
| `bun run typecheck:api` | Type check API |
| `bun run typecheck:web` | Type check web |

## Troubleshooting

### DATABASE_URL not found

Make sure you have a `.env` file in the root directory with the `DATABASE_URL` variable set. The API loads environment variables from the root `.env` file using the `--env-file` flag.

### Port already in use

If you get a port conflict error, make sure no other services are running on:
- Port 3000 (API)
- Port 5173 (Web)
- Port 5174 (Sidecar)

### Bun command not found

Install Bun globally:
```bash
curl -fsSL https://bun.sh/install | bash
```

### .NET SDK not found

Install .NET SDK 9.0 or higher:
```bash
# macOS
brew install dotnet

# Or download from https://dotnet.microsoft.com/download
```

## License

Private project - All rights reserved
