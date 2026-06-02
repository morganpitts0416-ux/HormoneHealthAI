---
name: Form Workflow Builder L1
description: All Layer 1 components are complete — schema, storage, routes, and builder UI. Layer 2 execution engine not yet built.
---

## Status
Layer 1 (schema + CRUD + builder UI) is fully implemented and wired up.

## What exists
- `shared/schema.ts` — 4 tables: `form_workflows`, `form_workflow_steps`, `form_workflow_runs` (stub), `form_workflow_step_states` (stub)
- `server/storage.ts` — All IStorage methods: listFormWorkflows, getFormWorkflow, createFormWorkflow, updateFormWorkflow, deleteFormWorkflow, listFormWorkflowSteps, replaceFormWorkflowSteps, plus Layer 2 stubs (createWorkflowRun, getWorkflowRun, etc.)
- `server/routes.ts` — CRUD routes under `/api/form-workflows` namespace (GET list, POST, GET/:id, PUT/:id, DELETE/:id, PUT/:id/steps, GET/:id/runs)
- `client/src/components/form-workflow-builder.tsx` — 1745-line builder with WorkflowList, WorkflowEditor, StepConfigPanel (all 10 step types), IfThenBranch (recursive sub-steps), FormWorkflowBuilderSection export
- `client/src/pages/account.tsx` — `formWorkflows` section registered as ownerOnly

## Layer 2 stub tables
`form_workflow_runs` and `form_workflow_step_states` exist in schema already — Layer 2 can add execution engine without a schema migration.

**Why:** JSONB-heavy design keeps schema simple; branch sub-steps stored inline in config as trueBranch/falseBranch arrays, avoiding self-referential FK.
