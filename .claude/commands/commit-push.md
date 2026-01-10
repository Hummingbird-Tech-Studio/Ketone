# Commit and Push

Commit all changes and push to the remote repository.

## Instructions

1. Run `git status` to see all untracked and modified files
2. Run `git diff` to see the actual changes
3. Run `git log -3 --oneline` to see recent commit style
4. Stage all relevant changes with `git add`
5. Create a commit with a clear message that:
   - Summarizes the nature of changes (feat, fix, refactor, etc.)
   - Focuses on "why" rather than "what"
   - Ends with: `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`
6. Push to remote: `git push`
7. If the branch has no upstream, use: `git push -u origin <branch-name>`

Use HEREDOC format for commit messages to ensure proper formatting.

Do NOT commit files that may contain secrets (.env, credentials.json, etc.).
