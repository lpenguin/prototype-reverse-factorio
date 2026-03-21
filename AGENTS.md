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

## Commit Message Style

Follow the Conventional Commits specification for all changes:

- **Format:**
  - **1st line:** `<type>: <short summary>`
  - **2nd line:** (empty)
  - **3-n lines:** Detailed description of the changes
- **Types:**
  - `feat`: A new feature
  - `fix`: A bug fix
  - `docs`: Documentation only changes
  - `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
  - `refactor`: A code change that neither fixes a bug nor adds a feature
  - `perf`: A code change that improves performance
  - `test`: Adding missing tests or correcting existing tests
  - `chore`: Changes to the build process or auxiliary tools and libraries

