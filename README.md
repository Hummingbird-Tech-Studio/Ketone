<p align="center">
  <img src=".github/Ketone Logo.svg" alt="Ketone Logo" width="200">
</p>

A 100% free, open-source fasting app for web, iOS, and Android.
No ads. No user tracking. No cookies. No AI. No subscriptions. No data sales. Ever.

Ketone helps you stay on top of your fasting without compromising your privacy.
A simple app to monitor your fasting cycles, log how you feel, and visualize your progress. Your data belongs to you, export it anytime or delete your account whenever you want.

## Features

- 100% free — all features, all users, forever
- Track fasting cycles progress and duration
- Log feelings and personal notes during your fasts
- View comprehensive statistics and analytics
- Export your data in JSON or CSV formats
- Cross-platform support: responsive web, iOS, and Android apps
- Complete data ownership and privacy

## Support

Ketone is funded entirely by donations.

Try it now at [ketone.dev](https://ketone.dev/)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.3.0
- PostgreSQL database

### Environment Setup

Create a `.env.local` file in the root directory:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```

### Installation

```bash
# Install all dependencies
bun install
```

### Database Setup

```bash
# Run migrations
cd api && bun run db:migrate
```

### Development

```bash
# Terminal 1 - API (http://localhost:3000)
bun run dev:api

# Terminal 2 - Web (http://localhost:5173)
bun run dev:web
```

## Build

```bash
# Build all projects
bun run build

# Build individual projects
bun run build:api
bun run build:web
```

## Mobile Development

### iOS

```bash
bun run build:mobile && cd mobile && bun run open:ios
```

Then run from Xcode.

### Android

Requirements: Android Studio, Java 21

```bash
# Start API first
bun run dev:api

# In another terminal - build and deploy to emulator
cd mobile && bun run dev:android
```

## Architecture

This monorepo contains three main packages:

- **API**: Bun runtime with Effect HTTP framework, PostgreSQL database via Drizzle ORM
- **Web**: Vue 3 with Vite, XState for state management, SCSS styling
- **Mobile**: Capacitor for iOS and Android native builds
- **Shared**: Common schemas, types, and constants shared between packages

## Project Structure

```
ketone/
├── api/          # Backend server
├── web/          # Frontend application
├── mobile/       # Mobile apps
├── shared/       # Shared code
└── .env.local    # Environment variables
```

## License

This project is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later).

Copyright (C) 2024-2026 Andres Perez Corona
