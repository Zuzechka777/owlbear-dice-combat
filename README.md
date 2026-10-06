# Dice & Combat Tracker — Owlbear Rodeo extension

A custom Owlbear Rodeo extension with:

- 🎲 **Dice roller** (d4–d100 + custom notation like `2d6+3`), with rolls shared with
  everyone in the room via a live log.
- ⚔️ **Combat tracker**: lists every token on the *Character* layer, lets you click one
  to mark it as your **target**, roll an attack against its AC (auto hit/miss, with
  natural 20 = always hit and natural 1 = always miss), then roll damage — which is
  **automatically subtracted from that token's HP**. Healing works the same way, adding
  HP back up to the max.

No build step needed — it's plain HTML/CSS/JS. The Owlbear SDK is loaded straight from
a CDN (`esm.sh`), so you don't need Node/npm to run it, only to host it.

## How it works

- Owlbear Rodeo extensions are **not** browser extensions — they're small websites
  loaded inside an iframe and controlled through Owlbear's SDK. So you need to host
  these files somewhere public (HTTPS) and give Owlbear Rodeo the link to `manifest.json`.
- Combat stats (current HP, max HP, AC) are stored in each token's `metadata`, under
  the key `com.claude.dnd-combat/stats`. That data is saved with the scene and synced
  to every connected player automatically — no extra server needed.

## 1. Host the files

Pick any static host. Two easy free options:

### Option A — GitHub Pages
1. Create a new GitHub repository and upload all the files in this folder
   (`manifest.json`, `index.html`, `style.css`, `app.js`, `icon.svg`).
2. In the repo settings, enable **GitHub Pages** for the main branch (root folder).
3. Your manifest URL will be:
   `https://<your-username>.github.io/<repo-name>/manifest.json`

### Option B — Netlify / Vercel drag-and-drop
1. Go to Netlify's "Deploy manually" page (or Vercel's dashboard) and drag this whole
   folder in.
2. Once deployed, your manifest URL will be:
   `https://<your-site-name>.netlify.app/manifest.json`

> Owlbear Rodeo requires the manifest (and the extension) to be served over **HTTPS** —
> both options above do this for you automatically.

## 2. Install it in Owlbear Rodeo

1. Open Owlbear Rodeo and click your profile icon → **Add Extension**.
2. Paste the manifest URL from step 1 above.
3. Open (or create) a room, open the room menu, and enable the extension.
4. A new dice icon will appear in the top-left action bar — click it to open the panel.

## 3. Using it

**Dice tab:** pick a die (with an optional modifier) or type a custom notation like
`3d8-2` and hit Roll. Every roll appears in everyone's log.

**Combat tab:**
1. Click ⟳ if your tokens don't show up (they must be on the *Character* layer).
2. Each row shows Current HP / Max HP / AC as editable boxes — set these once per
   token (defaults are 10/10/10).
3. Click a token's name to set it as your **target**.
4. Enter your attack bonus, click **Roll Attack** — it rolls d20 + bonus against the
   target's AC and tells you Hit or Miss.
5. If it's a hit, type a damage formula (e.g. `2d6+3`) and click **Roll Damage & Apply**
   — the target's HP drops automatically.
6. For healing, type a formula in the Healing box and click **Roll Healing & Apply** —
   HP goes up (capped at max).
7. "Manual HP adjust" is there for anything outside combat (e.g. applying a fixed
   penalty), positive or negative.

## Customizing

- Colors/fonts: edit `style.css` (`--purple` variable controls the accent color).
- Which layer counts as a token: edit the filter in `app.js`,
  `item.layer === "CHARACTER"` (e.g. add `"MOUNT"` if you use mounts).
- Crit rules, AC ties, etc.: see the `rollAttack()` function in `app.js`.

## Limits / notes

- The "target" you pick is local to your own extension window — each player targets
  independently, which matches how you'd normally play (each player rolls their own
  attacks). HP itself, however, **is shared** — everyone sees the same token HP live.
- This extension doesn't validate who "owns" a token, so any player with edit
  permissions on a token can change its HP. That matches Owlbear's normal permission
  model (GMs usually lock down what players can edit).
