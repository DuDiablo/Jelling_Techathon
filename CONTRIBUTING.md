# Contributing

## Branches
Never work directly on `main`. Create a branch per task:
- `feat/<short-name>` — new feature
- `fix/<short-name>` — bug fix
- `docs/<short-name>` — docs, pitch, notes

## Commit messages
[Conventional Commits](https://www.conventionalcommits.org): `feat:` `fix:` `docs:` `chore:`
Example: `feat: add beacon scan screen`

## Workflow
- **Pull early, push often.** `git pull` before you start, push at least every hour.
- **Small PRs.** One task per PR. Easier to review, fewer conflicts.
- **Update before your PR:** `git pull origin main` (merge) on your branch, fix conflicts, then open the PR.
- **Never force-push to `main`.**

## Resolving a merge conflict
1. `git pull origin main` — Git lists files with conflicts.
2. Open each file and find the markers:
   ```
   <<<<<<< HEAD
   your version
   =======
   their version
   >>>>>>> main
   ```
3. Edit so the file looks right, then delete the three marker lines.
4. `git add <file>` for each fixed file.
5. `git commit` (keep the default message), then `git push`.

Unsure which version to keep? Ask the person who wrote the other change.
