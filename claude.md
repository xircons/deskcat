# Claude Code Project Guidelines

These are the strict instructions and guidelines for working on the DeskCat project.

## Core Rules
- **No Comments in Code:** Do not add code comments when writing or refactoring code. Strip out any comments in new code blocks you generate.
- **No Emojis:** Do not use emojis in commit messages, pull requests, or conversational responses.
- **Never Edit `README.md` Automatically:** Do not modify `README.md` during regular coding tasks unless explicitly requested by the user.
- **Check `.claude` Folder First:** Before starting any coding tasks, always read the contents of the `.claude` folder to check for any active skills, agents, or commands that might be relevant to the task.

## Project Specific Guidelines (DeskCat)
- **Tech Stack:** Electron, TypeScript, HTML/CSS/SVG, `uiohook-napi` for global input tracking.
- **IPC Architecture:** Keep the separation between Main (`src/main/`) and Renderer (`src/renderer/`). Expose only what is absolutely necessary via the Context Bridge in `preload.ts`.
- **Performance:** The renderer runs a `requestAnimationFrame` loop to calculate spring-damper physics and modify SVG DOM attributes directly. Ensure any modifications to the animation loop (in `renderer.ts`) are extremely lightweight to avoid dropping frames or maxing out CPU.
- **Window Management:** The Electron window is frameless and transparent. It uses `setIgnoreMouseEvents` dynamically so it doesn't block the user from interacting with their desktop under the pet. Be careful not to break this behavior when editing window bounds or hover logic.
- **No Extra Dependencies:** Avoid adding heavy node modules or UI frameworks (e.g., React/Vue). The UI is built using vanilla TypeScript and DOM manipulation to keep the bundle small and fast.
