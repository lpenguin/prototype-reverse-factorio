# Agent Rules and Workflows

This document defines the constraints and workflows for AI agents working on the **Reverse Factorio Prototype** codebase.

## Code Style

- **Strict TypeScript:** Always adhere to the project's TypeScript configuration.
- **Type Safety:** 
  - No `any` or `unknown` types are allowed unless absolutely necessary for external interop.
  - Prefer strong, explicit interfaces and types for all data structures

## Workflow

Follow this sequence for any code modification:

1.  **Code:** Implement the requested change or fix.
2.  **Lint:** Run the linter to ensure style consistency.
    ```bash
    npm run lint
    ```
3.  **Compile:** Verify that there are no TypeScript errors.
    ```bash
    npm run compile
    ```
4.  **Test:** Run the test suite to ensure no regressions.
    ```bash
    npm run test
    ```

