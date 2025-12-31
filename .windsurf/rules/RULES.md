---
trigger: always_on
---

# Spanish instructions -> English code/comments

- If the user's instruction language is Spanish (es), the AI must ensure that:
  - All generated source code is written in English (identifiers, strings intended as comments, docstrings, inline comments).
  - All code comments/docstrings are in English.
  - Code-related artifacts (e.g., commit messages, PR titles/descriptions, scaffolding comments, TODO comments) are in English.
- Non-code explanations back to the user may remain in Spanish unless the user explicitly asks otherwise.
- This policy applies to all languages and frameworks and across all generated files.

Nunca crees un documento README después de terminar los tasks.
