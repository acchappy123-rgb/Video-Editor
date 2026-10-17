# Atelier – free, open-source design studio

Atelier is a desktop design app for posters, social posts, presentations, documents, whiteboards, videos, websites and simple spreadsheets. It is **free**, has **no accounts, ads or tracking**, and keeps everything **on your device**.

It runs as a desktop app on Windows, macOS and Linux. It also runs in any modern browser, where it can be installed as an app on phones and tablets.

## Download

Go to the repository's **Releases** page and download the installer for your system:

| System  | File |
|---------|------|
| Windows | `Atelier-Setup-x.y.z.exe` (installer) or `Atelier-x.y.z.exe` (portable) |
| macOS   | `Atelier-x.y.z.dmg` |
| Linux   | `Atelier-x.y.z.AppImage` or `.deb` |

The builds are not code-signed, so your system may warn you the first time:
- **Windows:** click "More info", then "Run anyway".
- **macOS:** right-click the app, choose Open, then Open again.

## Features

- **Home:** create button, search across your designs and templates (or ask AI), quick buttons for each design type, recent designs.
- **Design types:** Docs, Whiteboards (stickies, timer, voting, grows as you work), Presentations, Social media sizes, Videos, Print (A4, posters, business cards…), Websites, Sheets, and any custom size in px, in, cm or mm.
- **Editor:** pages with titles, plus hide, lock, duplicate, reorder and delete. Includes a timeline for videos and presentations, undo/redo, autosave and version history.
- **Selecting and moving:** corner/side/rotate handles, smart pink guides with spacing labels, alt-drag to copy, multi-select, groups, a floating mini menu, a right-click menu, rulers and guides.
- **Context toolbar** for text, shapes, images, lines, charts and tables. Also a Position panel (arrange, align, distribute, exact sizes, layers list).
- **Elements:** 24 shapes, lines and arrows, connectors that snap to shapes, graphics, stickers, frames, photo grids, device mockups, charts (bar, line, area, pie, donut), tables with formulas (`=SUM(B2:B6)`, `AVERAGE`, `MIN`, `MAX`, `COUNT`, arithmetic) and sticky notes.
- **Text:** heading, subheading and body presets, font pairings, lists, letter and line spacing. Effects: Shadow, Lift, Hollow, Splice, Echo, Glitch, Neon, Background and Curve. You can upload your own fonts.
- **Photos:** 12 filters with intensity, 14 adjustments, duotone, vignette, crop with ratios, flip and rounded corners. Background remover, magic eraser, expand and 2× upscale all run on-device.
- **Animation:** enter, emphasis and exit animations; page animations; transitions; motion paths you record by dragging; a soundtrack.
- **Present:** fullscreen, transitions, autoplay, presenter view with notes, next slide and timer, and recording yourself (camera bubble and microphone).
- **Brand Kit:** logos, colour palettes, heading/subheading/body fonts, photos, icons and brand voice. Brand colours appear at the top of every colour picker.
- **Sharing and teamwork:** comments with @mentions, replies and resolve; version history; shareable design files; save as template; content planner with reminders.
- **Export:** PNG (with transparency), JPG, PDF Standard, PDF Print (300 dpi, bleed, crop marks), SVG, MP4/WebM video, animated GIF, PowerPoint (.pptx), single-file website (HTML) and design files. Multi-page exports come as a ZIP.
- **Keyboard shortcuts:** `T` text, `R` rectangle, `C` circle, `L` line, `/` quick actions, `Ctrl/⌘+D` duplicate, `Ctrl/⌘+G` group, arrows to nudge, and more (see the Help button on the home screen).
- **Mobile:** the side rail becomes a bottom bar, panels slide up as sheets, and the toolbar scrolls sideways.

### Optional AI

The AI tools are off unless you add **your own** Anthropic API key in *Settings → AI*. They are: write and rewrite, generate a design, generate a vector graphic, translate a whole design, a chat assistant that edits the page, and a mini-app builder.

The key is stored only on your device. It is sent only to `api.anthropic.com` and is never included in exports or backups. You pay Anthropic directly for what you use.

## Privacy

- No accounts, servers, analytics or telemetry.
- Designs, uploads and settings live in the app's local database (IndexedDB) on your device.
- The app's Content-Security-Policy only allows network requests to `api.anthropic.com`, and only for the optional AI features.
- Use *Settings → Data → Back up everything* to make a backup file, and *Restore backup* to load it.

Collaborating works by sending files: *Share → Design file* exports a `.atelier.json` that anyone with Atelier can open, edit and send back.

## Run from source

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start            # desktop app (Electron)
npm run web          # browser version at http://localhost:8080
npm test             # automated smoke test (needs Playwright installed globally)
```

Build installers locally:

```bash
npm run dist:win     # or dist:mac / dist:linux
```

## Publishing on GitHub

1. Create a new repository and push this folder to it.
2. **Desktop installers:** push a version tag, and GitHub Actions builds Windows, macOS and Linux installers and attaches them to a Release:
   ```bash
   git tag v1.0.0 && git push origin v1.0.0
   ```
3. **Web / phone version (optional):** in *Settings → Pages*, set *Source* to **GitHub Actions**. Every push to `main` publishes the app. On a phone, open the page and choose "Add to Home Screen".

## Project layout

```
main.js              Electron entry point (desktop window, safe link handling)
app/index.html       App shell (no build step, plain JavaScript)
app/js/util.js       DOM helpers, dialogs, menus, icons
app/js/store.js      IndexedDB storage, backups, design files
app/js/model.js      Design types, fonts, element factories, libraries
app/js/render.js     Model → SVG renderer (editor, thumbnails, exports, video)
app/js/templates.js  Built-in templates
app/js/export.js     PNG/JPG/SVG/PDF/GIF/video/PPTX/HTML/ZIP writers
app/js/imagetools.js On-device photo tools
app/js/ai.js         Optional AI features (bring your own key)
app/js/editor*.js    Editor core and UI
app/js/panels.js     Side panels
app/js/present.js    Present mode and animation preview
app/js/home.js       Home, projects, templates, brand, planner, settings
```

## Known limitations

- PDF, PowerPoint and GIF exports contain flattened page images, so text in them is not selectable or editable.
- Importing PDF/PowerPoint files as editable designs, and video clips on the timeline, are not supported yet.
- Real-time co-editing needs a server, so it isn't included. Share design files instead.
- Fonts are system fonts plus any you upload. Exact appearance can vary a little between operating systems.

## License

MIT – see [LICENSE](LICENSE).
