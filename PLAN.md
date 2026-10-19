# BT Notes — Plan

A Markdown notes app with Bear's look and a few of Craft's features. It runs on Windows and Mac, has an iPhone app, and uses Apple Notes on the iPhone for quick capture.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Storage | Plain `.md` files in `My Drive/BT Notes/` | Readable by any app, no lock-in |
| Sync (Windows, Mac) | Google Drive for desktop syncs the folder; the app only reads and writes local files | The work laptop's proxy blocks Dropbox file transfer and Google's sign-in server for third-party apps. Google Drive for desktop is installed and works. |
| Sync (iPhone) | Google Drive API from inside the app | iOS has no background folder sync. The phone isn't on the corporate network, so the block doesn't apply. |
| Desktop shell | Electron | Tauri needs Rust plus the C++ build tools, which aren't installed here and need admin rights |
| iPhone shell | Capacitor | Runs the same web UI as the desktop app |
| UI | Svelte + TypeScript + Vite | Small, fast bundles; one codebase for both shells |
| Editor | CodeMirror 6 with live preview | Markdown symbols fade and text formats as you type, like Bear |
| Search | MiniSearch, an in-memory index written in pure JS | Native SQLite would also need the C++ build tools, and pure JS runs unchanged on the iPhone |
| Encryption | None for now | Can be added later |
| Apple Notes import | One-way. A Mac helper moves notes from the Notes folder **Capture** into `BT Notes/Inbox/`, then deletes them from Apple Notes | Captures don't stay in Apple Notes |

## Folder layout

```
My Drive/BT Notes/
  Notes/            all notes; a note with subpages gets a matching subfolder
    Project X.md
    Project X/
      Kickoff.md
  Daily/            one note per day: 2026-10-19.md
  Inbox/            new imports from Apple Notes, waiting to be filed
  Attachments/      images and files linked from notes
```

## Note format

```markdown
---
created: 2026-10-19T09:14:00
pinned: false
---
# Project X

Notes go here. Tags are inline: #work #work/meetings

> [!note] Callout
> Shown as a highlighted block.

<details><summary>Toggle</summary>
Hidden until expanded.
</details>

- [ ] Send the draft 📅 2026-10-21
- [x] Book the room

See also [[Kickoff]]. Subpage: [[Project X/Kickoff]]
```

- **Title:** the first `# heading`. The filename follows the title.
- **Tags:** nested with `/`, as in Bear. They come from the note text; no separate database.
- **Search index, backlinks and task list:** built on each device from the files and never synced, so they can't cause conflicts.

## Features

**Bear-style core**
- Three panes: sidebar (tags), note list, editor.
- Live-preview editor.
- Nested tags.
- Pinned notes.
- Instant search.
- Light and dark themes.

**Craft-style additions**
- Daily notes with a calendar.
- `[[Links]]` between notes, with a backlinks panel.
- Subpages shown as cards inside the parent note.
- Callouts and toggles.
- Tasks with due dates, plus a "Due" view across all notes.

## Phases

Each phase ends with a check that has to pass before the next one starts.

0. **Sync check.** ✅ Done. Dropbox, Google Drive and OneDrive endpoints were tested through the proxy. Google Drive for desktop works, and `BT Notes/sync-test.md` showed up on drive.google.com.
1. **Mac importer test.**
   - A script on the Mac reads one note (text and an image) from the Notes folder **Capture**.
   - It writes the note to `Inbox/` as Markdown.
   - It deletes the note from Apple Notes only after the file is written.
   - *Check:* the note appears in `G:\My Drive\BT Notes\Inbox` on Windows with its image.
2. **Desktop core (Windows + Mac).** Built and tested on Windows, 2026-10-19.
   - Open the folder.
   - Note list, editor, tags, search.
   - Pick up changes made on other devices.
   - *Check:* edit on Windows and the change appears on the Mac. ⏳ Needs the Mac.
   - *Check:* search across 5,000 generated notes takes under 50 ms. ✅ Unit test.
3. **Inbox.**
   - Show new imports.
   - Tag them, file them, skip duplicates.
   - The Mac helper runs every few minutes on its own.
   - *Check:* 10 notes captured on the phone are in the app within 10 minutes, and gone from Apple Notes.
4. **Craft features:** daily notes, backlinks, subpage cards, callouts, toggles, tasks.
5. **iPhone app (Capacitor).**
   - Reading first, then editing.
   - Until it's ready, the Google Drive iPhone app can open the `.md` files to read them.
6. **Polish:** a screen for merging conflicting copies, export to PDF and HTML, themes.

## Risks to check early

- **Google Drive "streaming" mode.** `G:` is a virtual drive. Changes made on other devices may not trigger file-change events, and files that aren't cached can be slow to open the first time.
  - Fix: mark `BT Notes` as "Available offline", and fall back to checking for changes on a timer.
- **Conflicting edits.** When the same note is edited on two devices, Google Drive for desktop may save a second copy (for example `Note (1).md`). The exact behavior needs testing. The app should detect these copies and offer to merge them.
- **Apple Notes images.** Apple's scripting for Notes gets text out reliably, but images and attachments may not come through.
- **Google sign-in on the iPhone.** The desktop app's files are created by Google Drive for desktop, so the iPhone app needs permission to see all of Drive, not just files it created itself. That permission level means the Google Cloud project has to be set up correctly for personal use, or sign-ins expire every 7 days.
- **Company policy.** Google Drive for desktop works on the work laptop today. If IT starts blocking it, the app keeps working on local files, and sync stops until another route is found.
