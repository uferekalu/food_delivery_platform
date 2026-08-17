---
name: new-feature-branch
description: This skill should be used when starting a new phase of work on the food_ordering_platform repo, or whenever the user asks to "start the next ticket", "create a feature branch", "begin FDP-N", or "move on to the next phase". Creates a correctly-named feature/FDP-<n>-<description> branch, off an up-to-date main, and bumps the ticket counter in docs/ROADMAP.md.
---

# New Feature Branch

This repo's non-negotiable rule (see root `CLAUDE.md` and `docs/ENGINEERING_RULES.md`): never
push directly to `main`/`master`. Every change goes on a branch named
`feature/FDP-<number>-<short-description>`.

## Steps

1. Read the "Next available ticket number" line at the top of `docs/ROADMAP.md` — that's `<n>`.
   Cross-check the phases table for the intended scope/description of that number if the user
   didn't specify one (e.g. FDP-4 → `auth`).
2. Make sure the local `main` is up to date before branching, if `main` exists yet:
   ```
   git fetch origin
   git checkout main
   git pull origin main
   ```
   (Skip this step if `main` doesn't exist yet — i.e. the very first branch, FDP-1, bootstraps
   the repo and is pushed with nothing to base off.)
3. Create the branch:
   ```
   git checkout -b feature/FDP-<n>-<short-description>
   ```
   `<short-description>` is kebab-case, short (2-4 words), matching the branch suffix already
   listed for that ticket in `docs/ROADMAP.md`'s phases table.
4. Bump `docs/ROADMAP.md`: increment "Next available ticket number", and flip that phase's
   Status column to "🔄 In progress". Commit this alongside the first real commit on the branch
   (not as a separate throwaway commit).
5. Do the work for that phase.
6. Push the branch: `git push -u origin feature/FDP-<n>-<short-description>`.
7. Open a PR against `main` (`gh pr create`) summarizing the change and a test plan. Standing
   instruction as of 2026-08-17: merge it yourself right after (`gh pr merge --squash
   --delete-branch`) rather than leaving it for manual review — the user hit repeated trouble
   merging via the GitHub UI and asked Claude to handle it. Still tell the user what shipped
   and link the (now-merged) PR. Only skip the self-merge if the user has said to go back to
   manual review for this session. (`main` won't exist yet for the very first branch, FDP-1 —
   see docs/ENGINEERING_RULES.md for how that bootstrap was handled.)
8. After merging, flip the Status column for that phase to "✅ Done" in the next branch's first
   commit (ROADMAP.md is always updated from whichever branch is currently active, not
   retroactively on the merged one).
