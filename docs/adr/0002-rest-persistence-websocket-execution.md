# ADR-0002: REST persistence and WebSocket execution

Status: accepted

Workflow CRUD uses REST. Updates require `If-Match` and return `ETag`; atomic version predicates surface conflicts. Socket.IO carries graph execution and trace events with a workspace-scoped `workflowId`.
