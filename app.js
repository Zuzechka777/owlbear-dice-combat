import OBR from "https://esm.sh/@owlbear-rodeo/sdk@2.2.0";

const ID = "com.claude.dnd-combat";
const STATS_KEY = `${ID}/stats`; // { hp, maxHp, ac }
const DICE_CHANNEL = `${ID}/dice-roll`;

let myPlayerId = null;
let myPlayerName = "Player";

let tokens = []; // { id, name, hp, maxHp, ac }
let selectedTargetId = null;
let lastAttackWasHit = false;
let lastAttackWasCrit = false;

// ---------------------------------------------------------------------
// Dice helpers
// ---------------------------------------------------------------------
function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/** Parses notation like "2d6+3", "d20", "1d8-1", "5" */
function parseAndRoll(notation) {
  const clean = notation.trim().toLowerCase().replace(/\s+/g, "");
  const match = clean.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (match) {
    const count = match[1] ? parseInt(match[1], 10) : 1;
    const sides = parseInt(match[2], 10);
    const mod = match[3] ? parseInt(match[3], 10) : 0;
    if (count < 1 || count > 100 || sides < 2) return null;
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
    const total = rolls.reduce((a, b) => a + b, 0) + mod;
    return { notation: clean, rolls, mod, total, sides, count };
  }
  const flat = parseInt(clean, 10);
  if (!Number.isNaN(flat)) {
    return { notation: clean, rolls: [], mod: flat, total: flat, sides: 0, count: 0 };
  }
  return null;
}

function formatRollResult(res) {
  if (res.rolls.length === 0) return `${res.total}`;
  const rollsText = `[${res.rolls.join(", ")}]`;
  const modText = res.mod ? (res.mod > 0 ? ` + ${res.mod}` : ` - ${Math.abs(res.mod)}`) : "";
  return `${rollsText}${modText} = ${res.total}`;
}

function addLogEntry(html) {
  const log = document.getElementById("roll-log");
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.innerHTML = html;
  log.prepend(entry);
  while (log.children.length > 100) log.removeChild(log.lastChild);
}

async function broadcastRoll(text) {
  try {
    await OBR.broadcast.sendMessage(
      DICE_CHANNEL,
      { playerId: myPlayerId, playerName: myPlayerName, text, timestamp: Date.now() },
      { destination: "ALL" }
    );
  } catch (e) {
    console.error("Broadcast failed", e);
  }
}

async function rollAndLog(notation, label) {
  const res = parseAndRoll(notation);
  if (!res) {
    addLogEntry(`<span class="miss">Invalid dice notation: ${notation}</span>`);
    return null;
  }
  const text = `${label ? label + ": " : ""}${res.notation} → ${formatRollResult(res)}`;
  addLogEntry(`<span class="who">${myPlayerName}</span> ${text}`);
  await broadcastRoll(text);
  return res;
}

// ---------------------------------------------------------------------
// Combat tracker: reading / writing token stats
// ---------------------------------------------------------------------
function defaultStats() {
  return { hp: 10, maxHp: 10, ac: 10 };
}

async function loadTokens() {
  const items = await OBR.scene.items.getItems(
    (item) => item.layer === "CHARACTER" && item.type === "IMAGE"
  );
  tokens = items.map((item) => {
    const stats = item.metadata[STATS_KEY] || defaultStats();
    return {
      id: item.id,
      name: item.name || "Unnamed",
      hp: stats.hp,
      maxHp: stats.maxHp,
      ac: stats.ac,
    };
  });
  renderTokenList();
}

async function saveStats(tokenId, partialStats) {
  await OBR.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) {
      const current = item.metadata[STATS_KEY] || defaultStats();
      item.metadata[STATS_KEY] = { ...current, ...partialStats };
    }
  });
}

async function applyHpDelta(tokenId, delta) {
  let newHp = null;
  let maxHp = null;
  await OBR.scene.items.updateItems([tokenId], (items) => {
    for (const item of items) {
      const current = item.metadata[STATS_KEY] || defaultStats();
      const updated = Math.max(0, Math.min(current.maxHp, current.hp + delta));
      item.metadata[STATS_KEY] = { ...current, hp: updated };
      newHp = updated;
      maxHp = current.maxHp;
    }
  });
  return { newHp, maxHp };
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------
function renderTokenList() {
  const container = document.getElementById("token-list");
  if (tokens.length === 0) {
    container.innerHTML = `<p class="hint">No tokens found on the Character layer. Add tokens to the map, then hit ⟳.</p>`;
    return;
  }
  container.innerHTML = "";
  for (const t of tokens) {
    const row = document.createElement("div");
    row.className = "token-row" + (t.id === selectedTargetId ? " selected" : "");
    const pct = t.maxHp > 0 ? Math.max(0, Math.min(100, (t.hp / t.maxHp) * 100)) : 0;
    row.innerHTML = `
      <span class="token-name" title="${t.name}">${t.name}</span>
      <span class="hp-bar-wrap"><span class="hp-bar" style="width:${pct}%; background:${pct <= 25 ? "#dc2626" : pct <= 50 ? "#d97706" : "#16a34a"}"></span></span>
      <input class="stat-input hp-input" type="number" value="${t.hp}" title="Current HP" />
      <span>/</span>
      <input class="stat-input maxhp-input" type="number" value="${t.maxHp}" title="Max HP" />
      <span>AC</span>
      <input class="stat-input ac-input" type="number" value="${t.ac}" title="Armor Class" />
    `;

    row.querySelector(".token-name").addEventListener("click", () => selectTarget(t.id));
    row.querySelector(".hp-bar-wrap").addEventListener("click", () => selectTarget(t.id));

    const hpInput = row.querySelector(".hp-input");
    const maxInput = row.querySelector(".maxhp-input");
    const acInput = row.querySelector(".ac-input");
    [hpInput, maxInput, acInput].forEach((el) => el.addEventListener("click", (e) => e.stopPropagation()));

    hpInput.addEventListener("change", async () => {
      const val = clampInt(hpInput.value, 0, 9999);
      await saveStats(t.id, { hp: val });
      await loadTokens();
    });
    maxInput.addEventListener("change", async () => {
      const val = clampInt(maxInput.value, 1, 9999);
      await saveStats(t.id, { maxHp: val });
      await loadTokens();
    });
    acInput.addEventListener("change", async () => {
      const val = clampInt(acInput.value, 0, 99);
      await saveStats(t.id, { ac: val });
      await loadTokens();
    });

    container.appendChild(row);
  }
}

function clampInt(val, min, max) {
  let n = parseInt(val, 10);
  if (Number.isNaN(n)) n = min;
  return Math.max(min, Math.min(max, n));
}

function selectTarget(tokenId) {
  selectedTargetId = tokenId;
  lastAttackWasHit = false;
  lastAttackWasCrit = false;
  document.getElementById("roll-damage-btn").disabled = true;
  document.getElementById("roll-damage-btn").textContent = "Roll Damage & Apply";
  document.getElementById("attack-result").textContent = "";
  const t = tokens.find((tk) => tk.id === tokenId);
  document.getElementById("target-name").textContent = t ? `${t.name} (AC ${t.ac})` : "-";
  document.getElementById("target-panel").classList.remove("hidden");
  renderTokenList();
}

function getSelectedTarget() {
  return tokens.find((t) => t.id === selectedTargetId) || null;
}

// ---------------------------------------------------------------------
// Combat actions
// ---------------------------------------------------------------------
async function rollAttack() {
  const target = getSelectedTarget();
  if (!target) return;
  const mod = clampInt(document.getElementById("attack-mod").value, -99, 99);
  const d20 = rollDie(20);
  const total = d20 + mod;
  const isCritHit = d20 === 20;
  const isCritMiss = d20 === 1;
  const hit = isCritHit || (!isCritMiss && total >= target.ac);

  lastAttackWasHit = hit;
  lastAttackWasCrit = isCritHit;
  const damageBtn = document.getElementById("roll-damage-btn");
  damageBtn.disabled = !hit;
  damageBtn.textContent = isCritHit ? "Roll Damage & Apply (x2 CRIT)" : "Roll Damage & Apply";

  const resultEl = document.getElementById("attack-result");
  const label = hit
    ? `<span class="hit">HIT${isCritHit ? " (CRIT! x2 damage)" : ""}</span>`
    : `<span class="miss">MISS${isCritMiss ? " (fumble!)" : ""}</span>`;
  resultEl.innerHTML = `d20 (${d20}) + ${mod} = <strong>${total}</strong> vs AC ${target.ac} → ${label}`;

  const text = `attacks <strong>${target.name}</strong>: d20 (${d20}) + ${mod} = ${total} vs AC ${target.ac} → ${hit ? `<span class="hit">HIT${isCritHit ? " (CRIT!)" : ""}</span>` : '<span class="miss">MISS</span>'}`;
  addLogEntry(`<span class="who">${myPlayerName}</span> ${text}`);
  await broadcastRoll(text);
}

async function rollDamageAndApply() {
  const target = getSelectedTarget();
  if (!target || !lastAttackWasHit) return;
  const notation = document.getElementById("damage-notation").value || "1d6";
  const res = parseAndRoll(notation);
  if (!res) {
    addLogEntry(`<span class="miss">Invalid damage notation: ${notation}</span>`);
    return;
  }
  const wasCrit = lastAttackWasCrit;
  const finalDamage = wasCrit ? res.total * 2 : res.total;
  const { newHp, maxHp } = await applyHpDelta(target.id, -finalDamage);
  const critText = wasCrit ? ` <strong>CRIT x2!</strong> (${res.total} → ${finalDamage})` : "";
  const text = `deals <strong>${finalDamage}</strong> damage to <strong>${target.name}</strong>${critText} (${res.notation} → ${formatRollResult(res)}). HP: ${newHp}/${maxHp}`;
  addLogEntry(`<span class="who">${myPlayerName}</span> ${text}`);
  await broadcastRoll(text);
  document.getElementById("roll-damage-btn").disabled = true;
  document.getElementById("roll-damage-btn").textContent = "Roll Damage & Apply";
  lastAttackWasHit = false;
  lastAttackWasCrit = false;
  await loadTokens();
  selectTarget(target.id);
}

async function rollHealAndApply() {
  const target = getSelectedTarget();
  if (!target) return;
  const notation = document.getElementById("heal-notation").value || "1d8";
  const res = parseAndRoll(notation);
  if (!res) {
    addLogEntry(`<span class="miss">Invalid healing notation: ${notation}</span>`);
    return;
  }
  const { newHp, maxHp } = await applyHpDelta(target.id, res.total);
  const text = `heals <strong>${target.name}</strong> for <strong>${res.total}</strong> (${res.notation} → ${formatRollResult(res)}). HP: ${newHp}/${maxHp}`;
  addLogEntry(`<span class="who">${myPlayerName}</span> ${text}`);
  await broadcastRoll(text);
  await loadTokens();
  selectTarget(target.id);
}

async function manualHpAdjust() {
  const target = getSelectedTarget();
  if (!target) return;
  const delta = clampInt(document.getElementById("manual-hp").value, -9999, 9999);
  if (!delta) return;
  const { newHp, maxHp } = await applyHpDelta(target.id, delta);
  const text = `manually adjusts <strong>${target.name}</strong> HP by ${delta > 0 ? "+" : ""}${delta}. HP: ${newHp}/${maxHp}`;
  addLogEntry(`<span class="who">${myPlayerName}</span> ${text}`);
  await loadTokens();
  selectTarget(target.id);
}

// ---------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------
function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function setupDiceTab() {
  document.querySelectorAll(".die-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sides = btn.dataset.die;
      const mod = clampInt(document.getElementById("quick-mod").value, -99, 99);
      const notation = `1d${sides}${mod ? (mod > 0 ? `+${mod}` : mod) : ""}`;
      await rollAndLog(notation);
    });
  });

  document.getElementById("custom-roll-btn").addEventListener("click", async () => {
    const input = document.getElementById("custom-notation");
    if (!input.value.trim()) return;
    await rollAndLog(input.value);
  });
  document.getElementById("custom-notation").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("custom-roll-btn").click();
  });
}

function setupCombatTab() {
  document.getElementById("refresh-tokens-btn").addEventListener("click", loadTokens);
  document.getElementById("roll-attack-btn").addEventListener("click", rollAttack);
  document.getElementById("roll-damage-btn").addEventListener("click", rollDamageAndApply);
  document.getElementById("roll-heal-btn").addEventListener("click", rollHealAndApply);
  document.getElementById("manual-hp-btn").addEventListener("click", manualHpAdjust);
}

function setupBroadcastListener() {
  OBR.broadcast.onMessage(DICE_CHANNEL, (event) => {
    const data = event.data;
    if (!data || data.playerId === myPlayerId) return; // avoid echoing our own roll
    addLogEntry(`<span class="who">${data.playerName}</span> ${data.text}`);
  });
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------
OBR.onReady(async () => {
  myPlayerId = await OBR.player.getId();
  myPlayerName = await OBR.player.getName();

  setupTabs();
  setupDiceTab();
  setupCombatTab();
  setupBroadcastListener();

  const ready = await OBR.scene.isReady();
  if (ready) await loadTokens();

  OBR.scene.onReadyChange(async (isReady) => {
    if (isReady) await loadTokens();
  });

  OBR.scene.items.onChange(async () => {
    await loadTokens();
  });
});
