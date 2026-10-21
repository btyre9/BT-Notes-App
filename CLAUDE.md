# BT Notes — notes for Claude

BT Notes is the user's own Milanote/Storyflow-style app: boards of notes, images and files on top of Markdown notes with Bear's look. Electron + Svelte 5 + CodeMirror 6. [README.md](README.md) explains how to use and run it; [PLAN.md](PLAN.md) has the decisions, phases and checks. Read both before changing anything.

## Where the code lives

- **This folder** (`/Volumes/1TB SanDisk/BT-Notes-App`, `D:\BT-Notes-App` on the Windows laptop) is the main working copy. Commit and push from here. GitHub: `btyre9/BT-Notes-App` (public).
- **`~/BT-Notes-App`** is a Mac clone used to run tests and the app, since `node_modules` on this drive holds Windows builds. After committing here, update it with `git fetch && git merge --ff-only origin/main`. To test uncommitted work, copy the changed files into it and `chmod 644` them.
- **The drive is exFAT:** macOS writes `._*` files next to anything edited here (gitignored). Delete them before copying files into the clone: `find . -name '._*' -not -path './node_modules/*' -not -path './.git/*' -delete`.
- **If `npm run dev` says "Electron uninstall":** run `node node_modules/electron/install.js` in the clone.
- **Run, test, check (in `~/BT-Notes-App`):** `npm run dev`, `npm test`, `npm run check`.

## Where things stand (2026-10-21)

- **Built:** phases 0–10 of PLAN.md, the board restyle (floating dock, minimap, zoom controls, hide-sidebar), and inline images in the note editor.
- **Notes folder:** `iCloud Drive/BT Notes` (`~/Library/Mobile Documents/com~apple~CloudDocs/BT Notes`). The user uses BT Notes mostly on the Mac and iPhone, and iCloud+ is their one paid storage service. Don't reopen the storage question; it took a long discussion to settle. The Windows work laptop uses a separate work folder, `C:\Users\ALIBI8I\OneDrive - Porsche Cars North America\BT Notes`, saved as its folder choice (2026-10-21). The user chose it for speed after trying iCloud for Windows the same day, whose sign-in had silently expired for six days. The old Dropbox copy and `~/BT-Notes-Test` are leftovers.
- **Apple Notes import:** a launchd job (`com.btyre.btnotes.import`) runs `mac/import-apple-notes.ts` every 5 minutes from `~/BT-Notes-App`, moving notes from the Notes folder **Capture** into `Inbox/`. Log: `~/Library/Logs/BT Notes/import.log`. It finds the notes folder through `src/shared/notesRoot.ts`, so it follows the app's folder.

## Waiting on the user

- In Finder, right-click `BT Notes` in iCloud Drive → **Keep Downloaded**.
- The phone test (PLAN phase 10 check): capture notes with photos in **Capture** on the iPhone and confirm they reach the Inbox within about 5 minutes.

## Next work the user is weighing

The user wants boards to feel interactive like Milanote, not like a FigJam picture. Proposed next, not yet approved:
1. **Clickable to-do checkboxes on board text cards,** without entering edit mode.
2. **Link cards with previews:** fetch the page title and preview image for `link` cards.

Comments and sharing were noted as gaps but are lower priority.

## Elsewhere

- **FigJam experiments,** in the user's Figma account (stu9121478234, which the user confirmed is theirs): "New Porsche WBT Module Process" (a flowchart) and "WBT Module Plan Board" (a Storyflow-style board whose three image slots are still grey; the user hasn't chosen between Figma AI images, which cost credits, and their own photos). The user's verdict: FigJam looks good but isn't interactive enough.
- **Commits:** the user approves each commit and push. End commit messages with the `Co-Authored-By` line from the current session's instructions.
