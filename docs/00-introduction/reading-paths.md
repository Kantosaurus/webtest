# Reading Paths

A curated order in which to read the manual, by role. Each path ends with a
concrete next-action the reader can try against the running system.

## Reviewer / hiring manager — *"does this person know what they're doing?"*

1. [Executive Summary](./executive-summary.md) — one page.
2. [System Overview](../10-architecture/system-overview.md) — the narrative.
3. [Design Decisions](../10-architecture/design-decisions.md) — rationale log.
4. Spot-check: open one of the linked source files from the design decisions
   (e.g. `api/src/routes/scans.ts:20`) and verify the claim holds.

Estimated time: **15 minutes**.

## Backend engineer — *"I'm about to change the API"*

1. [System Overview](../10-architecture/system-overview.md)
2. [Components (C4 L3)](../10-architecture/components.md)
3. [Data Flow](../10-architecture/data-flow.md)
4. [API Reference → Conventions](../20-api-reference/conventions.md)
5. [API Reference → Scans / Events / Messages](../20-api-reference/README.md)
6. [Testing Strategy](../50-development/testing.md)

Concrete exercise: add a new error code to `api/src/lib/errors.ts`, wire it
through a route, and verify it surfaces through the error envelope with the
correct HTTP status.

## Frontend engineer — *"I'm about to change a component"*

1. [Frontend Architecture](../30-frontend/architecture.md)
2. [Component Inventory](../30-frontend/components.md)
3. [Design System](../30-frontend/design-system.md)
4. [Accessibility](../30-frontend/accessibility.md)
5. [API Reference → Scan Events](../20-api-reference/scan-events.md) and
   [Messages](../20-api-reference/messages.md) — so you understand the SSE
   wire format the client must consume

Concrete exercise: modify the verdict colour tokens in `app/globals.css`
following the OKLCH palette rules in [Design System](../30-frontend/design-system.md).

## SRE / operator — *"I'm on-call and something is wrong"*

1. [Executive Summary](./executive-summary.md) — just the diagram
2. [Deployment](../40-operations/deployment.md)
3. [Observability](../40-operations/observability.md)
4. [Runbooks](../40-operations/runbooks.md)
5. [Security](../40-operations/security.md) — so you know what the controls
   are meant to do
6. [Configuration Reference](../40-operations/configuration.md)

Concrete exercise: run `bash scripts/smoke.sh https://<your-host>` and confirm
each check passes.

## Contributor — *"I want to submit a PR"*

1. [Setup](../50-development/setup.md)
2. [Testing Strategy](../50-development/testing.md)
3. [Contributing](../50-development/contributing.md)
4. [Troubleshooting](../50-development/troubleshooting.md)

Concrete exercise: check out the repo, bring up the dev stack, and get the
e2e suite green locally before making any change.

## Security reviewer — *"I'm looking for attack surface"*

1. [System Overview](../10-architecture/system-overview.md) — know where the
   boundaries are
2. [Security](../40-operations/security.md) — the controls and the threat
   model
3. [API Reference → Rate Limits](../20-api-reference/rate-limits.md)
4. [Design Decisions → stream uploads / 409 recovery / stateless store](../10-architecture/design-decisions.md)

Concrete exercise: attempt to upload a 33 MB file and verify all four
defence layers reject it.
