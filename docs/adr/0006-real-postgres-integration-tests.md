# ADR-0006: Real PostgreSQL integration tests

Status: accepted

Database constraints and atomic updates receive integration coverage against the debug PostgreSQL service on port 15432. `yarn test:int` reports a clear skip when that service is unavailable. Unit tests continue to use isolated service doubles.
