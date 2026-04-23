# Webtest — Technical Documentation

> VirusTotal × Gemini file scanner. A production-shaped web application that
> streams file uploads through VirusTotal and explains the verdict through a
> Gemini-powered assistant — all over Server-Sent Events, with zero persistence.

This directory is the authoritative technical reference for the webtest
application. It is organised as a progressively-deepening manual, opening with
a one-page executive summary for stakeholders and ending with implementation
minutiae for on-call engineers.

---

## How to read this manual

The manual is numbered in the order a new engineer would naturally read it.
Nothing here is mandatory front-to-back — jump to the tier that matches your
role:

| If you are … | Start here |
|---|---|
| A reviewer or stakeholder | [00 Introduction → Executive Summary](./00-introduction/executive-summary.md) |
| A backend engineer | [10 Architecture → System Overview](./10-architecture/system-overview.md) then [20 API Reference](./20-api-reference/README.md) |
| A frontend engineer | [30 Frontend → Architecture](./30-frontend/architecture.md) |
| An SRE / operator | [40 Operations](./40-operations/README.md) |
| A contributor | [50 Development → Setup](./50-development/setup.md) |

A matrix of suggested reading paths lives at
[00-introduction/reading-paths.md](./00-introduction/reading-paths.md).

---

## Table of contents

### 00 — Introduction
- [Executive Summary](./00-introduction/executive-summary.md) — one-page overview for stakeholders
- [Reading Paths](./00-introduction/reading-paths.md) — role-based entry points
- [Glossary](./00-introduction/glossary.md) — terminology index

### 10 — Architecture
- [System Overview](./10-architecture/system-overview.md) — the 10,000-foot view
- [Context & Containers (C4 L1–L2)](./10-architecture/context-and-containers.md) — actors, systems, processes
- [Components (C4 L3)](./10-architecture/components.md) — modules inside each container
- [Data Flow](./10-architecture/data-flow.md) — sequence diagrams for the golden flows
- [Design Decisions](./10-architecture/design-decisions.md) — ADR-style rationale log

### 20 — API Reference
- [Overview](./20-api-reference/README.md)
- [Conventions](./20-api-reference/conventions.md) — headers, IDs, errors, content types
- [Scans](./20-api-reference/scans.md) — upload and read
- [Scan Events (SSE)](./20-api-reference/scan-events.md) — status stream
- [Messages (Chat)](./20-api-reference/messages.md) — LLM conversation over SSE
- [Health & Metrics](./20-api-reference/health-and-metrics.md)
- [Errors](./20-api-reference/errors.md) — error envelope and codes
- [Rate Limits](./20-api-reference/rate-limits.md) — buckets and headers
- [Data Models](./20-api-reference/data-models.md) — shared schemas

### 30 — Frontend
- [Overview](./30-frontend/README.md)
- [Architecture](./30-frontend/architecture.md) — Next 15 App Router, state, rewrites
- [Components](./30-frontend/components.md) — component inventory & contracts
- [Design System](./30-frontend/design-system.md) — typography, OKLCH palette, motion
- [Accessibility](./30-frontend/accessibility.md)

### 40 — Operations
- [Overview](./40-operations/README.md)
- [Deployment](./40-operations/deployment.md) — infrastructure topology
- [CI/CD](./40-operations/ci-cd.md) — GitHub Actions pipelines
- [Observability](./40-operations/observability.md) — logs, metrics, SSE telemetry
- [Security](./40-operations/security.md) — controls, headers, threat model
- [Runbooks](./40-operations/runbooks.md) — on-call procedures
- [Configuration Reference](./40-operations/configuration.md) — every environment variable

### 50 — Development
- [Overview](./50-development/README.md)
- [Setup](./50-development/setup.md) — getting a local dev environment running
- [Testing Strategy](./50-development/testing.md) — unit, integration, e2e, smoke
- [Contributing](./50-development/contributing.md) — coding standards, review checklist
- [Troubleshooting](./50-development/troubleshooting.md)

### Historical artefacts
- [`assignment.md`](./assignment.md) — the original take-home prompt
- [`deployment.md`](./deployment.md) — legacy deployment runbook (pre-split)
- [`superpowers/`](./superpowers) — design specs and execution plans from the build

---

## Conventions used in this manual

- **Paths** are given relative to the repository root, e.g. `api/src/app.ts:14`.
- **Code excerpts** preserve line numbers where referenced.
- **Diagrams** are authored in Mermaid so they render natively on GitHub and
  in most Markdown viewers.
- **Normative language** — *must*, *must not*, *should* — uses RFC 2119
  conventions where it appears.
- **Date format** is ISO-8601 (`YYYY-MM-DD`).

## Status

This manual reflects the state of the `main` branch as of the most recent
commit. Each document dates its content in its frontmatter when the content is
load-bearing on time (for example, rate-limit budgets that depend on the
VirusTotal free-tier terms).

If a document contradicts the code, the code is authoritative — please open a
PR against the document.
