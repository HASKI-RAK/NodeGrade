# Gexam evaluation service

Gexam owns exams, attempts, publication and the student/teacher views. NodeGrade runs
one versioned, ephemeral rubric graph per submitted answer and persists the resulting
evaluation for idempotent retrieval. This endpoint is for trusted backend traffic;
the browser must never call it.

## Minimal local runtime

The Gexam rubric graph uses text generation only. Start PostgreSQL and NodeGrade's
backend without the embedding worker:

```powershell
docker compose -f docker-compose.gexam.yml up --build --detach --wait
```

The backend listens on `http://localhost:5000` by default and health is at `/health`.
Use `docker compose -f docker-compose.gexam.yml down` to stop it. The separate
`gexam_db_data` volume preserves evaluations and encrypted provider credentials.
The normal `yarn dev:up` stack remains available for other NodeGrade workflows.

Set these values in an ignored local `.env` before first boot:

- `NODEGRADE_GEXAM_INTERNAL_API_KEY`: random secret of at least 32 characters;
  the Gexam backend sends the same value in `X-Internal-Api-Key`.
- `GEXAM_VLLM_BASE_URL`: OpenAI-compatible base URL, default
  `https://vllm.katalyst-education.de/v1`.
- `GEXAM_VLLM_API_KEY`: provider bearer token; falls back to `KATALYST_API_KEY`.
- `PROVIDER_ENCRYPTION_KEY`: NodeGrade's existing key for encrypting provider
  credentials at rest. Keep it stable across restarts.

The `gexam-vllm` provider is seeded on first database boot from those values. An
existing provider row is managed through NodeGrade's provider admin API/UI, so changing
its `.env` values later does not silently replace stored credentials or policy. The
Gexam graph requests the first model returned by `GET /models` at evaluation time.
There is no model ID in the Gexam request or code. If no model is returned, or the
provider policy blocks it, the evaluation ends in `FAILED` with a clear reason.
For OpenAI-compatible vLLM requests, this graph sets
`chat_template_kwargs.enable_thinking=false` and has a 4096-token output budget.

## API contract

Both routes require `X-Internal-Api-Key`. There is no browser cookie or workspace
authorization on this service surface. The NestJS global `/api` prefix applies.

`POST /api/internal/evaluations` also requires an `Idempotency-Key` header of 8–200
characters. It returns HTTP 202 and a `PENDING` record while NodeGrade evaluates in
the background. Replaying the same key and body returns the same record; reusing a key
with a different body returns HTTP 409.

```json
{
  "externalAttemptId": "attempt-123",
  "taskVersionId": "exam-v1:task-1",
  "workflowRevision": "gexam-rubric-v1",
  "question": "Explain how an adapter connects two incompatible interfaces.",
  "learningOutcome": "Apply the Adapter pattern to an incompatible interface.",
  "answer": "The adapter delegates to the old sensor and maps its output.",
  "referenceAnswer": "An adapter translates the interface and delegates.",
  "rubricCriteria": [
    {
      "id": "pattern", "description": "Recognizes the Adapter pattern", "maxPoints": 2,
      "levels": [
        { "points": 0, "description": "No suitable pattern" },
        { "points": 1, "description": "Adapter named without explanation" },
        { "points": 2, "description": "Adapter explained correctly" }
      ]
    },
    { "id": "mapping", "description": "Explains delegation and mapping", "maxPoints": 3 }
  ]
}
```

Poll `GET /api/internal/evaluations/{evaluationId}` with the same service credential.
`COMPLETED` includes `criterionResults` in rubric order, each with `criterionId`,
`maxPoints`, `proposedPoints`, `evidenceExcerpt`, `gap`, and `rationale`; also
`totalPoints`, `maxPoints`, `classification`, `feedback` (`strengths`, `nextSteps`),
`reviewFlag`, `reviewReason`, `runId`, `model` (`providerKey`, `modelId`), timestamps,
and the request correlation IDs. Totals are computed by NodeGrade from validated
criterion points. Quotes that do not occur in the answer are removed and flagged
for human review. Zero and perfect scores also get a deterministic review flag. The
model may award only point values listed in teacher-approved `levels` when supplied.
`runId` equals `evaluationId`: this graph run is stored in `GexamEvaluation`, not the
workspace `Run` table. `FAILED` includes `error.code` and `error.message` and is never
presented as a scored submission.

The table retains the exact request and result to survive process restarts. Pending
jobs resume on boot. Because this local prototype has no distributed queue or lease,
run one NodeGrade backend instance for the Gexam service. Gexam should retain its own
published rubric and evaluation snapshot as the source for its learner and teacher
views; NodeGrade stores a technical evaluation record.

With the backend running and the ignored `.env` configured, run
`corepack yarn workspace backend gexam:live`. It submits a largely correct, a partial,
and an incorrect synthetic answer through the real model. The script verifies per
criterion bounds and exact answer evidence, formative feedback, unauthenticated-read
rejection, same-key replay, and changed-body idempotency conflict. It prints only IDs,
model name, scores and classifications; credentials are never printed.
