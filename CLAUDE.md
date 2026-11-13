# CLAUDE.md

Shared instructions for Claude Code. Hackathon team of 6, 48 hours. Speed and no broken `main`.

## Workflow rules
- Never commit to `main` directly. Work on a branch:
  `feat/<short-name>`, `fix/<short-name>`, `docs/<short-name>`
- Commit messages use Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`
- Pull early, push often. Keep PRs small: one task per PR.
- Before opening a PR, merge or rebase the latest `main` into the branch and resolve conflicts.
- Never force-push to `main`.
- Use `.github/pull_request_template.md` for PR descriptions.

## Code rules
- Only change files related to your current task.
- Never commit secrets or `.env` files. Add new variables to `.env.example` with empty values.
- Run the project's lint/test commands before committing (to be defined once the stack is chosen).
- Record significant tech or design decisions in `docs/decisions.md`.

## Project context
TBD. Fill in once the idea and stack are chosen: what we're building, stack, how to run, lint, and test.
