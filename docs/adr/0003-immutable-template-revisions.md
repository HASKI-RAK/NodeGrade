# ADR-0003: Immutable template revisions

Status: accepted

Template edits append immutable revisions. `Template.currentRevision` stores the latest revision number and increments transactionally. Workflows and workshops pin revision IDs, with restrictive foreign keys preserving reset and workshop reproducibility. Template deletion is soft.
