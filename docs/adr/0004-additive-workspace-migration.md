# ADR-0004: Additive workspace migration

Status: accepted

Wave 1 introduces workspace tables, backfills legacy graphs into an unreachable legacy workspace, then renames `Graph` to `LegacyGraph` after the API cutover. Content remains text for byte-preserving migration. Boot-time content upgrades live in application source so production images contain them.
