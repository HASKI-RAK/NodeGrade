---
id: SPEC-0019
type: feature
title: Language model node accepts a plain string prompt
status: implemented
parent: SPEC-0001
priority: P1
created: 2026-09-22
updated: 2026-09-22
depends_on:
  - SPEC-0005
  - SPEC-0010
related:
  - SPEC-0003
  - SPEC-0006
---

# Language model node accepts a plain string prompt

## Intent

### Problem

The language-model node (`models/llm`, `packages/lib/src/nodes/LLMNode.ts`) has two message inputs: `message`, typed `message`, and `messages`, typed `*` because the `InOut` union in `types/NodeLinkMessage.ts` has no array-of-message member. `messages()` returns slot 0's value wrapped in a one-element array when it is set, else slot 1's value, else `[]`, and `onExecute()` passes that straight to `ModelCompletionRuntime.complete()`. Nothing inspects or normalises either value.

The only safe way to fill a message port is therefore a Prompt Message node (`basic/prompt-message`), whose sole job is to wrap a string in a role. In the common workshop case — "grade this answer" — a participant adds and configures a node purely to satisfy a wire type. Omit it, wire an answer or text node straight in, and a bare string reaches the provider as if it were a message list: the request is malformed and the error names neither node nor port.

### Desired outcome

A language-model node can be wired to any text-producing output. The node turns whatever arrives into a well-formed message list itself, at execution time, with the default role a Prompt Message node would have used. Prompt Message stays available and unchanged where an explicit role is wanted.

## Scope

### In scope

- Both message input ports of `models/llm` accept a string, a single message or an array of messages.
- The aggregate `messages` port additionally accepts an array of strings.
- The editor permits a link from a string-producing output into those ports.
- A bare string is normalised to `{ role: "user", content: <string> }` before the runtime is called.
- An array on the aggregate port is normalised element-wise, order preserved: each string element becomes a `user` message.
- Both message ports contribute to one message list, in slot order.
- An empty or whitespace-only prompt fails execution with an error naming the node.
- The normalised message list appears in the run trace.
- A port accepting several types still renders and loads with one recognisable style.

### Out of scope

- A role selector on the language-model node; roles stay the job of `basic/prompt-message`.
- Provider routing, model selection, model capability and generation parameters.
- Removing, renaming or editing `basic/prompt-message`.
- Multi-turn conversation state or history across runs.
- Any change to the `ModelCompletionRuntime` contract.

## Actors

- Participant: wires a question, answer or text field into a language model to get a grade, without learning what a message envelope is.
- Expert facilitator: builds template graphs, and wants the short path for simple prompts and the explicit path for role-controlled ones.

## User scenarios

### US-001 — Grade an answer with no prompt plumbing

As a participant,
I want to connect an Answer node straight into a language-model node and run it,
so that I can grade free text without adding a Prompt Message node.

Priority: P1

Independent value: removes the mandatory intermediate node from the most common workshop graph shape.

### US-002 — Mix a system message with a plain-text prompt

As a facilitator,
I want a role-based system message on one port and a raw string on the other,
so that I can keep the grader's persona while leaving the prompt body unwrapped.

Priority: P2

Independent value: keeps the explicit-role path working alongside the new shortcut.

## Functional requirements

### FR-001 — Message ports accept strings

The message input ports of the language-model node SHALL accept a plain string, a single message and an array of messages; the aggregate `messages` port SHALL additionally accept an array of strings, and the editor SHALL permit a link from an output that produces a string into either port.

### FR-002 — A bare string becomes a user message

WHEN a string arrives on a message input port,
the system SHALL wrap it as `{ role: "user", content: <the string> }` inside the node before the completion runtime is called, passing the unchanged model reference and parameters, so the request still satisfies SPEC-0010/FR-004.

### FR-003 — Arrays are normalised element-wise

WHEN an array arrives on the aggregate `messages` port, including an array consisting solely of strings,
the system SHALL normalise each element independently: a string element becomes a `user` message, a message object passes through unchanged, and the original element order is preserved.

### FR-004 — Prompt Message remains the only role source

The system SHALL keep `basic/prompt-message` in the component palette, unchanged and as described by its node metadata (SPEC-0005/FR-011), and it SHALL remain the only way to produce a `system`, `assistant` or `tool` message.

### FR-005 — Existing graphs execute unchanged

The system SHALL execute a workflow that connects a Prompt Message output or an aggregate message object into a language-model node exactly as it does today, and SHALL NOT require a migration of any stored workflow or template revision to gain this behaviour.

### FR-006 — An empty prompt fails legibly

WHEN the message list that would be sent contains a message whose content is empty or whitespace-only, or when no message content was supplied at all,
the system SHALL fail the run with an error that names the node, and SHALL NOT call the completion runtime.

### FR-007 — The effective prompt is observable

WHEN a language-model node executes,
the system SHALL record in the run trace the normalised message list actually sent to the provider, in the manner SPEC-0006 requires of node execution detail.

### FR-008 — Widened ports still render and load

A port that accepts several types SHALL render one recognisable colour and shape from the shared port style table, and WHEN a graph is loaded from storage the node SHALL present the widened acceptance rather than the narrower slot type it was serialized with.

### FR-009 — Both message ports contribute

WHEN both message input ports carry a value,
the system SHALL send the normalised contents of the singular `message` port followed by those of the aggregate `messages` port, as one message list; an unwired port SHALL contribute nothing, so a graph that wires one port alone sends exactly what it sent before.

## Acceptance criteria

### AC-001 — String output links into a message port

Traces to: FR-001

```gherkin
Given a workflow with a text-producing node and a language-model node
When the user drags a link from the text output to the message input
Then the link is accepted
And the workflow validates without an input type error
```

### AC-002 — A bare string, a string array and a mixed array are normalised

Traces to: FR-002, FR-003

```gherkin
Given a language-model node whose message input receives the string "Grade this answer"
When the workflow executes
Then the completion call carries one message with role "user" and that string as content
And given instead an array of strings on the aggregate port
Then the call carries one derived user message per element, in that order
And given instead an array of a string and a message object on the aggregate port
Then the call carries the derived user message then the message object, in that order
```

### AC-003 — Prompt Message is untouched and old graphs are unaffected

Traces to: FR-004, FR-005

```gherkin
Given a workflow stored before this change with a Prompt Message node feeding a language-model node
When the user opens and executes it
Then the message sent to the provider is identical to the one sent before the change
And Prompt Message is still listed in the AI category of the palette with a role selector
```

### AC-004 — Empty prompt names the failing node

Traces to: FR-006

```gherkin
Given a language-model node whose message input receives only spaces
When the workflow executes
Then the run fails with an error naming that node
And no completion request is sent to the provider
```

### AC-005 — The wrapped prompt appears in the trace

Traces to: FR-007

```gherkin
Given a workflow where a raw string is wired into a language-model node
When the run finishes
Then the trace for that node shows the derived role and content it sent
```

### AC-006 — A widened port looks like one type and loads widened

Traces to: FR-008

```gherkin
Given a workflow saved with a string link connected to a language-model message port
When the user opens it
Then the port is drawn in one colour and shape matching the other ports of that type
And the port still accepts a message object as well as the string
```

### AC-007 — A system message and a plain string compose

Traces to: FR-009

```gherkin
Given a language-model node whose message input receives a system message
And whose aggregate messages input receives the string "Grade this answer"
When the workflow executes
Then the call carries the system message followed by a user message holding that string
```

## Edge cases

- An array of strings on the aggregate `messages` port → one `user` message per element, order preserved.
- A plain string rather than an array on the aggregate `messages` port → treated as a single `user` message, never as a list of characters.
- A message object with a missing or empty `content` → FR-006 applies to it like any other message.
- An output typed as the wildcard `*` linked into a message port → normalised by the same rules, and a value that is neither string nor message object is reported against the node, not the provider.
- One string source feeding two language-model nodes → each node wraps its own copy, and neither run mutates the shared value.
- A provider that rejects a conversation holding only one user message → an ordinary provider error; the node does not invent a second message to work around it.
- An array containing a nested array → rejected against the node; nesting is not flattened.
- A null, undefined or numeric value on a message port → fails against the node under FR-006 rather than reaching the provider.
- Both ports wired → the singular `message` port's contents come first, the aggregate `messages` port's second. Before this change the aggregate port was silently dropped whenever the singular one was wired.

## Business rules

- An unwrapped string is always a `user` message; the node never guesses another role.
- Normalisation happens per node and per execution and is never written back into the stored graph.

## Constraints

- Normalisation lives in the node in `packages/lib`, which frontend and backend both import from `@haski/ta-lib`; no second implementation in either app.
- The `ModelCompletionRuntime.complete()` request shape is unchanged, and credentials still reach the node only through the injected runtime.
- Widening an input changes accepted link types, not stored content shape: no `ContentMigrationService` migration and no `contentSchema` stamp is required, and published template revisions stay immutable.
- `LLMNode.onConfigure` overrides the base implementation without calling it, so the shared base port restyling in the `LGraphNode` extension never runs for this node; FR-008 depends on fixing that.
- A new or retyped link is an ordinary graph mutation, captured by the existing editor history (SPEC-0005/FR-012) with no new history mechanism.

## Dependencies

- SPEC-0005 (editor shell: palette, inspector, canvas port styling, undo/redo).
- SPEC-0010 (multi-provider execution and the completion request the node builds).

## Assumptions

- A string reaching a message port is meant as prompt content, so `user` is the correct role.
- The outputs participants wire in (answer, text input, concatenated text, the node's own string output) all deliver a string at execution time.
- A node's trace payload can carry a message list without exposing credential or routing detail.

## Open questions

- Resolved: the language-model node gets no role selector. `basic/prompt-message` stays the only role source, as FR-004 requires.
- Resolved: the wrapped role is fixed at `user` and is not configurable per node.
- Resolved: a widened port keeps the single `message` colour and arrow shape; the accepted types are a link rule, not a visual one.
- Resolved: the trace shows the normalised list as one `Prompt sent` detail row and does not distinguish wrapped strings from explicit messages.

## Success criteria

- A participant wires a question, answer or text field into a language model node and gets a grade without ever adding a Prompt Message node.
- No template needs editing to benefit, and no existing workflow changes its provider request.
- A bad prompt produces an error that names its node.

## Change history

| Date       | Change                                                 |
| ---------- | ------------------------------------------------------ |
| 2026-09-22 | Initial specification created (draft, not implemented) |
| 2026-09-22 | Implemented: multi-type ports on `LGraphNode.addIn`/`addOut`, widened `models/llm` message ports, per-run normalisation in `packages/lib/src/nodes/promptMessages.ts`, node-named empty-prompt failure, `Prompt sent` trace detail through `LGraphNode.executionDetails`, and declared port types restored in `onConfigure`. Both message ports now contribute to the message list in slot order, so US-002 composes a role-carrying message with a plain string; a single wired port sends exactly what it sent before. |
