Launches subagents to parallelize workflows.

{{#if asyncEnabled}}
- Use `read jobs://` to inspect state; `read jobs://<job_id>` for detail.
- Use the `poll` tool to wait until completion. You **MUST NOT** poll `read jobs://` in a loop.
{{/if}}

{{#if defaultMode}}
Current input mode: `default`. Custom task-call `schema` is available.
{{/if}}
{{#if schemaFreeMode}}
Current input mode: `schema-free`. Custom task-call `schema` is disabled. If structured output is required, rely on the selected agent definition or inherited session schema.
{{/if}}
{{#if independentMode}}
Current input mode: `independent`. Every task assignment must stand on its own.
{{/if}}

Subagents do not inherit your conversation history. Every decision, file path, requirement, and constraint they need **MUST** be explicit in each task `assignment`.

<parameters>
- `agent`: Agent type for all tasks.
  - `.id`: CamelCase, max 32 chars
  - `.description`: UI display only; the subagent never sees it
  - `.assignment`: Complete self-contained natural-language assignment. Describe the goal, target files or area, and constraints. Do not micromanage every command unless an exact command, snippet, or reference is the point.
{{#if customSchemaEnabled}}
- `schema`: JSON-encoded JTD schema for expected output. Format lives here and **MUST NOT** be duplicated in assignments.
{{/if}}
- `tasks`: Tasks to execute in parallel.
{{#if isolationEnabled}}
- `isolated`: Run in isolated environment; returns patches. Use when tasks edit overlapping files.
{{/if}}
</parameters>

<critical>
- Every `assignment` must include the constraints, reference paths, and acceptance criteria it needs. There is no shared `context` field.
- **MUST NOT** tell tasks to run project-wide build/test/lint. Parallel agents share the working tree; each task edits or investigates, then stops. Caller verifies after all complete.
- For large payloads (traces, JSON blobs), write to `local://<path>` and pass the path in the relevant `assignment`.
- Prefer task assignments that delegate outcomes, not keystrokes. Ask for what needs to be learned or changed. Do not turn the assignment into a shell transcript unless exact commands are necessary.
- Prefer `task` agents that investigate **and** edit in one pass. Only launch a dedicated read-only discovery step when the affected files are genuinely unknown and cannot be inferred from the task description.
</critical>

<scope>
Each task: **at most 3-5 files**. Globs in file paths, "update all", or package-wide scope are too broad. Enumerate files explicitly and fan out to a cluster of agents when needed.
</scope>

<parallelization>
**Test:** Can task B produce correct output without seeing A's result? Yes -> parallel. No -> sequential.

|Sequential first|Then|Reason|
|---|---|---|
|Types/interfaces|Consumers|Need contract|
|API exports|Callers|Need signatures|
|Core module|Dependents|Import dependency|
|Schema/migration|App logic|Schema dependency|
**Safe to parallelize:** independent modules, isolated file-scoped refactors, tests for existing code.
</parallelization>

<templates>
**assignment:**
```
Goal: what this task must accomplish
Target: exact file paths, symbols, or area to inspect/change
Constraints: requirements, non-goals, and existing behavior that must survive
Acceptance: observable result proving the task is done; no project-wide commands
```
</templates>

<checklist>
Before invoking:
- Every `assignment` includes its own goal, constraints, and acceptance criteria
- Every `assignment` is self-contained, specific, and outcome-oriented; avoid command-by-command babysitting
- Tasks are truly parallel; none depends on another's output
- File paths are explicit; no globs
{{#if customSchemaEnabled}}
- `schema` is set if you expect structured output
{{else}}
- Do not pass a custom task-call `schema` in this mode
{{/if}}
</checklist>

<example label="Rename exported symbol + update all call sites">
Two tasks with non-overlapping file sets. Neither depends on the other's edits.

<tasks>
  <task name="RenameExport">
    <description>Rename the export in parser.ts</description>
    <assignment>
Goal
Rename `parseConfig` to `loadConfig` in `src/config/parser.ts`.

Target
- File: `src/config/parser.ts`
- Symbol: exported function `parseConfig`

Constraints
- Preserve behavior and signature exactly; rename only
- If the function is overloaded, rename all overload signatures
- Internal helpers named `_parseConfigValue` or similar are different symbols; leave them alone
- Do not add a backwards-compat alias

Acceptance
- `src/config/parser.ts` exports `loadConfig`
- `parseConfig` no longer appears as a top-level export in that file
    </assignment>
  </task>
  <task name="UpdateCallers">
    <description>Update import and call sites in consuming modules</description>
    <assignment>
Goal
Update callers to use `loadConfig` instead of `parseConfig`.

Target
- Files: `src/cli/init.ts`, `src/server/bootstrap.ts`, `src/worker/index.ts`
- Do not touch `src/config/parser.ts`; that is handled by a sibling task

Constraints
- Replace both imports and direct call sites
- If a file uses `cfg.parseConfig(...)`, update the property access too
- Leave string literals and comments mentioning `parseConfig` alone
- If any file re-exports `parseConfig` at an external boundary, keep compatibility via `export { loadConfig as parseConfig }` and add a `// TODO: remove after next major` comment

Acceptance
- No bare identifier reference to `parseConfig` remains in the three target files
    </assignment>
  </task>
</tasks>
</example>

{{#list agents join="\n"}}
### Agent: {{name}}
**Tools:** {{default (join tools ", ") "All"}}
{{description}}
{{/list}}
