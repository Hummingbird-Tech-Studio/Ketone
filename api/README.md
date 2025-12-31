# API Server

## Installation

Install dependencies:

```bash
bun install
```

## Development

Start the development server (port 3000):

```bash
bun run dev
```

## Testing

Run integration tests:

```bash
bun test:integration:auth
bun test:integration:cycle
```

## Useful Commands

### Stop the Development Server

If you need to manually stop the development server running on port 3000:

**Option 1 - Kill by port (simplest):**

```bash
lsof -ti:3000 | xargs kill -9
```

**Option 2 - Kill specific process:**

```bash
# Find the process ID
lsof -i:3000

# Kill using the PID
kill -9 <PID>
```

**Option 3 - Kill by process name:**

```bash
pkill -f "bun run dev"
```

---

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
