# Create New Branch

Create a new git branch for a feature or fix.

## Arguments

- `$ARGUMENTS` - Branch name or description (optional)

## Instructions

1. Ensure working directory is clean with `git status`
2. If there are uncommitted changes, ask what to do (stash, commit, or discard)
3. Fetch latest from remote: `git fetch origin`
4. Checkout main branch and pull latest: `git checkout main && git pull`
5. Create and checkout new branch:
   - If `$ARGUMENTS` is provided, use it as branch name (sanitize if needed)
   - If not provided, ask for a branch name
   - Use format: `feature/`, `fix/`, `refactor/`, etc. as appropriate
6. Confirm the new branch was created: `git branch --show-current`

Branch naming conventions:
- `feature/<name>` - New features
- `fix/<name>` - Bug fixes
- `refactor/<name>` - Code refactoring
- `docs/<name>` - Documentation changes
- `chore/<name>` - Maintenance tasks
