# Contributing

Guidelines for changing the code. This is not a law — it is what the
project has settled on and what reviewers will expect.

## Before you start

- Skim the [Architecture](../10-architecture/README.md) tier so you
  understand what the moving parts are.
- For any non-trivial change, open an issue first or draft a PR and
  mark it WIP. That's the cheapest time to catch a direction mistake.

## Branch and PR hygiene

- Branches: short, kebab-case, no prefix. `vt-409-recovery`, not
  `feat/virustotal-409-recovery-ainsley`.
- PRs: one concern per PR. Split a refactor out of a feature into its
  own PR when possible.
- Keep PRs small. If the diff is > ~500 net lines, ask for early
  review before you go deeper.

## Commit style

Convention used in the repo:

```
<type>(<scope>): imperative subject

Short body if needed — the WHY, not the WHAT. Wrap at 72.
```

Seen types in `git log`:

- `feat(api|web|ops)` — new user-visible behaviour.
- `fix(api|web)` — bug fix. Include a reference to the symptom.
- `chore` — tooling, dependencies, renames.
- `test(api|web)` — test-only changes.
- `ci` — workflow changes.
- `refactor` — no-behaviour-change restructures.

No co-authored-by lines, no AI-attribution lines. Messages should
read like the author owns the change.

## Code standards

### TypeScript

- `strict: true` is on in both workspaces. Do not disable checks with
  `any` — prefer `unknown` plus a narrowing step.
- `tsc --noEmit` must pass before pushing.
- Prefer named exports over default exports.
- Avoid "manager" / "helper" / "utils" catch-all files. Files are
  named after the thing they model.

### Formatting

- Prettier is configured in both workspaces.
- Run `npm run format` before pushing, or let your editor's
  format-on-save handle it.

### Linting

- ESLint with `@typescript-eslint` in api; `eslint-config-next` in web.
- No `eslint-disable` without a comment explaining why.

### Error handling

- Use `Errors.*` factories in the API. Don't throw bare `Error`
  except deep in a library with a typed wrapper a layer up.
- Don't swallow errors silently. Either handle them or let them
  propagate to the middleware, which will log them.
- At system boundaries (user input, external APIs) — validate. Inside
  trusted code, trust.

### Comments

- Default to none. Names should do the explaining.
- Write a comment only when the *why* is non-obvious: a hidden
  constraint, a workaround for a specific bug, behaviour that would
  surprise a reader.
- Do not write `// used by X` or `// added for Y flow`. Those belong
  in the PR description.
- Inline comments are allowed — they can be informative, but they
  shouldn't narrate what the code already says.

### Tests

- A bug fix must include a test that fails against the unfixed code.
- Prefer integration over mocks-everywhere when the code spans more
  than one module.
- See [Testing Strategy](./testing.md) for the full approach.

### Scope discipline

- Don't ship a bug fix with incidental "cleanups" to adjacent code.
  Open a separate PR.
- Don't introduce abstractions for possible future requirements.
  Three similar lines is better than a premature abstraction.
- Don't ship half-implementations — no `// TODO: implement` stubs.

## Review checklist

Self-review before requesting review:

- [ ] `npm run lint && npm run typecheck && npm test` in both
      workspaces
- [ ] `npm run build` in web
- [ ] For UI changes: verified in a browser on both themes
- [ ] For API changes: a fresh integration test covers the path
- [ ] Diff contains nothing unrelated to the stated goal
- [ ] PR description explains the why, not the what
- [ ] No secrets, no `.env`, no sample data included

For the reviewer:

- [ ] Behaviour matches the PR description
- [ ] Tests actually exercise the claim
- [ ] No premature abstraction
- [ ] No backwards-compatibility shims that aren't load-bearing
- [ ] Documentation touched if the change moves a public-facing
      contract (API, env var, wire format)

## Dependency changes

- Lock files must be checked in. Neither `api/package-lock.json` nor
  `web/package-lock.json` is gitignored.
- Add a dependency only when its job can't be done by something we
  already depend on in under ~40 lines of our code.
- Check the license — MIT / ISC / Apache-2 / BSD are fine; others
  need review.
- Do not add dependencies for test-only behaviour to `dependencies`;
  they belong in `devDependencies`.

## Working with memory rules

The project has some memory rules the team has codified from past
incidents — see the `memory/` directory if you have access. The ones
most likely to catch a contributor are:

- **Don't hardcode vendor model names.** Use env-driven config (see
  [ADR-0006](../10-architecture/design-decisions.md#adr-0006--pin-gemini-model-via-environment-variable-not-code)).
- **Don't use `secure: true` on cookies over HTTP.** Use `'auto'`
  ([ADR-0009](../10-architecture/design-decisions.md#adr-0009--secure-auto-on-cookies-legacy-guard)).
- **VT 409 is not a failure.** Recover via hash lookup
  ([ADR-0007](../10-architecture/design-decisions.md#adr-0007-vt-409-is-a-signal-not-a-failure)).

Surface any new rule as an ADR — `docs/10-architecture/design-decisions.md` — so
it's durable and citable in code review.

## What to do if you're unsure

- If it's a design question, open an issue and propose two options
  with tradeoffs.
- If it's a code-level question, open the PR as WIP and ping someone;
  an early look is cheaper than re-work.
- If it's a security question, don't rush it — ask privately.
