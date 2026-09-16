# ADR-0008: Server-side model policy enforcement

Status: accepted

Each provider carries one deployment-global `ModelPolicy` with an explicit mode: `DENY_ALL`, `ALLOWLIST` or `ALLOW_ALL`. `ProviderRuntimeService` applies it twice — the catalog omits models the policy excludes, and `complete()` refuses an excluded `ModelRef` before contacting the provider. Editor-side filtering is presentation only. `mode` is null until chosen, which blocks enabling a cloud provider rather than granting an implicit allow.
