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
   - **If there's no existing row for `<n>`** (a live bug report, a follow-up fix, or any other
     reactively-created ticket rather than a pre-planned phase — this became the normal case
     once the app went live, e.g. FDP-49 through FDP-62 were all created this way), that's fine:
     pick the branch description yourself from the actual work, and add the row to the phases
     table yourself as part of step 4 rather than looking one up. Write the description with the
     same level of detail as existing rows once the work is done — what broke/was missing, what
     changed, and why — not just a one-line title; this row is the durable record of what
     shipped and why, since `docs/ROADMAP.md` is this repo's source of truth over any memory
     summary.
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
   `<short-description>` is kebab-case, short (2-4 words) — matching the branch suffix already
   listed for that ticket in `docs/ROADMAP.md`'s phases table if one exists, otherwise one you
   pick yourself that reads naturally as that table's "Branch suffix" column once added.
4. Bump `docs/ROADMAP.md`'s "Next available ticket number". For a pre-planned phase you expect
   to span more than this session, also flip that row's Status to "🔄 In progress" now and flip
   it to "✅ Done" in the *next* branch's first commit once merged (ROADMAP.md is always edited
   from whichever branch is currently active, never retroactively on an already-merged one). For
   a reactive ticket you'll finish within this same branch (the common case for a bug report or
   follow-up fix — see step 1's note), skip the in-progress step entirely: just write the row
   already as "✅ Done" once the work is actually complete, in the same final commit as the code
   (matches how FDP-49 through FDP-62 were all done). Either way, commit the ROADMAP.md edit
   alongside real code, never as a separate throwaway commit.
5. Do the work for that phase.
6. Push the branch: `git push -u origin feature/FDP-<n>-<short-description>`.
7. Open a PR against `main` (`gh pr create`) summarizing the change and a test plan. Standing
   instruction as of 2026-08-17: merge it yourself right after (`gh pr merge --squash
   --delete-branch`) rather than leaving it for manual review — the user hit repeated trouble
   merging via the GitHub UI and asked Claude to handle it. Still tell the user what shipped
   and link the (now-merged) PR. Only skip the self-merge if the user has said to go back to
   manual review for this session. (`main` won't exist yet for the very first branch, FDP-1 —
   see docs/ENGINEERING_RULES.md for how that bootstrap was handled.)
