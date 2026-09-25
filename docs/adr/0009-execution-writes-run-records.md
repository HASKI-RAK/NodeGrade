# ADR-0009: Execution writes run records, REST reads them

Status: accepted

ADR-0002 keeps persistence on REST and execution on the socket. Run records are the one deliberate crossing: `GraphHandlerService` writes a `Run` row for every completed or failed execution — the answer, the sanitized outputs and the derived review flag, never the trace — and does so before it emits the terminal `runStateChanged`, so a client that refetches on that event finds the row. A failed write is logged and changes nothing the participant receives. REST (`/workflows/:id/runs`) only lists, reads and marks records reviewed, scoped by the bearer workspace, and refuses LTI launches under the published projection. Records cascade with their workspace and workflow and are trimmed to the newest 200 per workflow at write time.
