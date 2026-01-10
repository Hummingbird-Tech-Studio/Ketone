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
├── mobile/                      (Mobile - Capacitor)
│   ├── package.json             → Capacitor configuration
│   ├── ios/                     → iOS native project (Xcode)
│   └── android/                 → Android native project (Android Studio)
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

## Mobile Development (Capacitor)

The project includes a mobile package using Capacitor for iOS and Android.

### Prerequisites

- **Xcode** (for iOS development)
- **Android Studio** (for Android development)
- **Java 21** (for Android builds) - Install via SDKMAN: `sdk install java 21.0.9-tem`
- API running on `http://localhost:3000`

### Android Development

#### 1. Start the API

```bash
bun run dev:api
```

#### 2. Start the Android emulator

From Android Studio or via command line:

```bash
~/Library/Android/sdk/emulator/emulator -avd Pixel_7a &
```

#### 3. Build and run the app

```bash
cd mobile && bun run dev:android
```

This command automatically:

- Builds the web app
- Syncs with Capacitor
- Configures `adb reverse` for port 3000
- Installs and runs the app on the emulator

#### Quick commands

| Scenario                            | Command                             |
| ----------------------------------- | ----------------------------------- |
| Full build + deploy                 | `cd mobile && bun run dev:android`  |
| Reinstall only (build already done) | `cd mobile && bun run run:android`  |
| Open in Android Studio              | `cd mobile && bun run open:android` |

#### Wireless debugging (physical device via WiFi)

To run the app on a physical Android device without a USB cable:

1. On your phone, go to **Settings > Developer options > Wireless debugging** and enable it

2. Tap **Pair device with pairing code** and run:

   ```bash
   ~/Library/Android/sdk/platform-tools/adb pair <IP:PAIRING_PORT>
   # Enter the pairing code when prompted
   ```

3. Connect to the device (the port is different from the pairing port - check the main Wireless debugging screen):

   ```bash
   ~/Library/Android/sdk/platform-tools/adb connect <IP:PORT>
   ```

4. Verify the connection:

   ```bash
   ~/Library/Android/sdk/platform-tools/adb devices
   ```

5. Run the app:

   ```bash
   cd mobile && bun run dev:android
   ```

> **Note:** The IP stays the same while connected to the same WiFi network, but the port changes frequently (when toggling wireless debugging, after sleep, etc.). You may need to reconnect with a new port.

### iOS Development

```bash
# Build web + sync with Capacitor, then open Xcode
bun run build:mobile && cd mobile && bun run open:ios
```

### Quick Reference

| Command                             | Description                                       |
| ----------------------------------- | ------------------------------------------------- |
| `bun run build:mobile`              | Build web + sync with Capacitor (from root)       |
| `bun run dev:android` (in /mobile)  | Full build + sync + deploy to Android emulator    |
| `bun run run:android` (in /mobile)  | Deploy to Android emulator (includes adb reverse) |
| `bun run open:android` (in /mobile) | Open Android project in Android Studio            |
| `bun run open:ios` (in /mobile)     | Open iOS project in Xcode                         |

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

| Command                 | Description                      |
| ----------------------- | -------------------------------- |
| `bun run dev:api`       | Start API server with hot reload |
| `bun run dev:web`       | Start web dev server             |
| `bun run build`         | Build all projects               |
| `bun run build:api`     | Build API                        |
| `bun run build:web`     | Build web application            |
| `bun run build:mobile`  | Build web + sync with Capacitor  |
| `bun run typecheck`     | Type check all TS projects       |
| `bun run typecheck:api` | Type check API                   |
| `bun run typecheck:web` | Type check web                   |

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
