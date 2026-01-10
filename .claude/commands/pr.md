# Create Pull Request

Create a pull request for the current branch.

## Instructions

1. Check current branch and ensure it's not main/master
2. Run `git status` to see all changes (staged and unstaged)
3. Run `git diff main...HEAD` to understand all commits that will be in the PR
4. If there are uncommitted changes, ask if I should commit them first
5. Push the branch to remote if not already pushed: `git push -u origin <branch-name>`
6. Create PR using `gh pr create` with:
   - A clear, descriptive title based on the changes
   - Body with:
     - `## Summary` - 1-3 bullet points describing the changes
     - `## Test plan` - Checklist of testing steps
     - Footer: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
7. Return the PR URL

Use HEREDOC format for the PR body to ensure proper formatting.
