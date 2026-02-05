---
name: review-comments
description: Process code review comments - apply valid suggestions or explain why they're incorrect
---

# Review Comments

Process code review comments and either apply the suggested changes or explain why they are not applicable.

## Instructions

You will receive code review comments. For each comment:

### 1. Analyze the comment

- Understand what the reviewer is suggesting
- Identify the file(s) and code section(s) involved
- Evaluate if the suggestion is technically correct

### 2. Validate against repository standards

- Check CLAUDE.md for project guidelines and best practices
- Review existing patterns in the codebase for consistency
- Verify the suggestion aligns with the project's conventions

### 3. Take action based on validity

**If the comment is valid and correct:**

- Apply the suggested change following repository best practices
- Show the diff of what was changed
- Briefly explain why the change improves the code

**If the comment is incorrect or not applicable:**

- Explain clearly why the suggestion doesn't apply
- Reference specific guidelines, patterns, or technical reasons
- Suggest an alternative if appropriate

## Input format

Provide the review comments in any of these formats:

- Direct text with the comment
- GitHub PR comment URL
- File path + line number + comment

## Example usage

```
/review-comments
Comment 1: "This function should use Effect.gen instead of pipe chains"
File: api/src/features/auth/services/auth-service.ts
Line: 45
```
