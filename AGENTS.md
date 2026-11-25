# Repository Guidelines

## Project Structure & Module Organization

Stillroom is a browser based exam practice app built with React, Vite, and TypeScript. Application code lives in `src/`: `App.tsx` contains the screens and exam flows, `exam.ts` defines and validates the exam data format, `RichText.tsx` renders Markdown and math, and `styles.css` contains the visual system and responsive rules. `main.tsx` is the app entry point. Static assets belong in `public/`; product decisions and requirements are in `docs/product-brief.md`. There is no test directory or configured test framework.

## Build, Test, and Development Commands

- `npm install` installs dependencies from the lockfile.
- `npm run dev` starts the local Vite development server.
- `npm run build` runs TypeScript project checks, then creates the production bundle in `dist/`.
- `npm run preview` serves the built bundle locally for a production-style review.

No test or lint scripts are currently configured. For UI changes, verify the affected flow in the browser; for data format changes, check that valid and malformed exam JSON are handled clearly.

## Coding Style & Naming Conventions

Use TypeScript for application logic and React function components for UI. Follow existing formatting: two-space indentation, single quotes in TypeScript, semicolons omitted, and descriptive camelCase names for values and functions. Use PascalCase for React components and type names. Keep exam shape validation and parsing in `src/exam.ts`; keep rendering and interaction in `src/App.tsx` or focused components. Preserve keyboard access, responsive layouts, local autosave behavior, and Markdown/LaTeX rendering when changing the exam experience.

## Testing Guidelines

There is no automated test suite yet. Run `npm run build` before submitting changes to catch TypeScript errors and bundling issues. Manually review both feedback and washback modes, including multiple-choice and written/proof question flows when those areas change. Confirm imported JSON errors remain actionable and mathematical content displays correctly.

## Commit & Pull Request Guidelines

Git metadata and commit history are not present in this workspace, so no existing commit convention can be confirmed. Use short imperative commit subjects (for example, `Add proof question responses`). Pull requests should describe user-visible behavior, note relevant validation performed, link related issues when applicable, and include screenshots for visual changes.

## Security & Configuration Tips

Exam content and progress are stored in browser local storage. Do not add API keys, personal exam data, or generated user content to source control. Keep dependencies locked through `package-lock.json`.
