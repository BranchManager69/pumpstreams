# Technical Overview

This track is for engineers, SREs, and anyone with shell access to PumpStreams infrastructure. It documents how code ships, how services stay healthy, and why certain architectural decisions were made.

## What to read

- [Operations Playbook](operations.md) details alert flows, restart procedures, environment variables, and escalation paths for each subsystem.
- [Developer Guide](developer.md) outlines the local toolchain, branching model, testing expectations, and release cadence.
- [Architecture Notes](architecture.md) records system diagrams, data contracts, and the rationale behind tradeoffs we have already made.

## Using this section

- Confirm deploy or incident steps against the playbook before acting in production.
- Keep the developer guide open while pairing with new contributors to align on conventions.
- Update architecture notes whenever an integration changes; it is our single source of truth for future audits.

When you touch prod, assume this section is the latest word—if reality diverges, fix the docs alongside the code.
