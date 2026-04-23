# 40 · Operations

Everything needed to run the system in production: topology, pipelines,
monitoring, security posture, and on-call playbooks.

- [Deployment](./deployment.md) — infrastructure topology and the
  one-host compose stack
- [CI/CD](./ci-cd.md) — GitHub Actions pipelines and release flow
- [Observability](./observability.md) — logs, metrics, smoke checks
- [Security](./security.md) — controls in force and the threat model
- [Runbooks](./runbooks.md) — on-call procedures for the common incidents
- [Configuration Reference](./configuration.md) — every environment variable

The legacy deployment runbook at [`../deployment.md`](../deployment.md)
remains the canonical one-time host bootstrap reference; this tier
supplements it with wider operational material.
