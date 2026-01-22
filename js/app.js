// Bandor Pata Tapper — Farcaster Mini App (production static)
// Domain: https://tapgorila.vercel.app

import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";
import { Attribution } from "https://esm.sh/ox/erc8021";

const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;
const BASE_MAINNET_CHAIN_ID = "0x2105";
const BASE_SEPOLIA_CHAIN_ID = "0x14a34";

const RECIPIENT = "0x65576A499603259A7cD4F1FdF98A16048F09Bd07"; // checksummed (tip recipient)
const EARN_CONTRACT = "0xB331328F506f2D35125e367A190e914B1b6830cF"; // contract address (onchain earn)
const BUILDER_CODE = "bandor-pata-tapper"; // builder code for dataSuffix attribution

const dataSuffix = Attribution.toDataSuffix({
  codes: [BUILDER_CODE],
});

function isHexAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function isReadyToSend() {
  if (!isHexAddress(RECIPIENT)) return false;
  if (!BUILDER_CODE || BUILDER_CODE.includes("TODO_REPLACE")) return false;
  return true;
}

function toast(msg, ms = 2200) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("show"), ms);
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------- Local state ----------
const store = {
  getPata() {
    const v = localStorage.getItem("pata");
    const n = v ? Number(v) : 150;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 150;
  },
  setPata(n) {
    localStorage.setItem("pata", String(Math.max(0, Math.floor(n))));
  },
  getEnergy() {
    const v = localStorage.getItem("energy");
    const n = v ? Number(v) : 80;
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.floor(n))) : 80;
  },
  setEnergy(n) {
    localStorage.setItem("energy", String(Math.max(0, Math.min(100, Math.floor(n)))));
  },
  getStreak() {
    const v = localStorage.getItem("streak");
    const n = v ? Number(v) : 0;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  },
  setStreak(n) {
    localStorage.setItem("streak", String(Math.max(0, Math.floor(n))));
  },
  getLastPlayDay() {
    return localStorage.getItem("lastPlayDay") || "";
  },
  setLastPlayDay(d) {
    localStorage.setItem("lastPlayDay", d);
  },

  getMode() {
    const v = (localStorage.getItem("mode") || "offchain").toLowerCase();
    return v === "onchain" ? "onchain" : "offchain";
  },
  setMode(m) {
    const v = (m === "onchain") ? "onchain" : "offchain";
    localStorage.setItem("mode", v);
  },

};

// ---------- Game ----------
const MILESTONES = [
  { at: 500, label: "Nice! 🥳" },
  { at: 1000, label: "Big Pata Energy 😎" },
  { at: 2500, label: "Leaf Legend 🍃👑" },
];

let pata = store.getPata();
let energy = store.getEnergy();
let streak = store.getStreak();
let mode = store.getMode(); // 'offchain' | 'onchain'
let nextMilestoneIdx = 0;

function fmt(n) {
  try { return n.toLocaleString("en-US"); } catch { return String(n); }
}

function updateHud() {
  document.getElementById("pataText").textContent = `Pata: ${fmt(pata)}`;
  document.getElementById("energyText").textContent = (mode === "offchain") ? "∞" : `${energy}/100`;
  document.getElementById("streakText").textContent = String(streak);
}

function maybeUpdateStreak() {
  const today = todayKey();
  const last = store.getLastPlayDay();
  if (!last) {
    streak = 1;
    store.setStreak(streak);
    store.setLastPlayDay(today);
    return;
  }
  if (last === today) return;

  // if last was yesterday, continue streak; else reset
  const lastDate = new Date(last + "T00:00:00");
  const todayDate = new Date(today + "T00:00:00");
  const diffDays = Math.round((todayDate - lastDate) / 86400000);
  if (diffDays === 1) {
    streak += 1;
  } else {
    streak = 1;
  }
  store.setStreak(streak);
  store.setLastPlayDay(today);
}

function spawnPlus(x, y, text) {
  const el = document.createElement("div");
  el.className = "floatPlus";
  el.textContent = text;
  const area = document.getElementById("tapArea");
  const r = area.getBoundingClientRect();
  el.style.left = `${x - r.left}px`;
  el.style.top = `${y - r.top}px`;
  area.appendChild(el);
  window.setTimeout(() => el.remove(), 700);
}

function onTap(ev) {
  // Offchain mode: unlimited taps, no energy limits.
  if (mode !== "offchain") {
    if (energy <= 0) {
      toast("No energy ⚡ (wait a bit)");
      return;
    }
    energy -= 1;
    store.setEnergy(energy);
  }

  maybeUpdateStreak();

  const PER_TAP = 5;
  pata += PER_TAP;
  store.setPata(pata);

  updateHud();

  const point = ev.touches?.[0] || ev;
  spawnPlus(point.clientX, point.clientY, `+${PER_TAP}`);

  if (nextMilestoneIdx < MILESTONES.length) {
    const m = MILESTONES[nextMilestoneIdx];
    if (pata >= m.at) {
      toast(m.msg);
      nextMilestoneIdx += 1;
      store.setMilestoneIdx(nextMilestoneIdx);
    }
  }
}
}

let energyRegenTimer = null;

function startEnergyRegen() {
  // Energy only matters in onchain mode.
  if (mode === "offchain") return;

  if (energyRegenTimer) return;
  energyRegenTimer = window.setInterval(() => {
    const current = store.getEnergy();
    if (current < 100) {
      const next = Math.min(100, current + 1);
      store.setEnergy(next);
      energy = next;
      updateHud();
    }
  }, 5000);
}

function stopEnergyRegen() {
  if (energyRegenTimer) {
    window.clearInterval(energyRegenTimer);
    energyRegenTimer = null;
  }
}

}

// ---------- Navigation ----------
function showPanel(name) {
  const earn = document.getElementById("earnPanel");
  if (name === "earn") earn.classList.add("show");
  else earn.classList.remove("show");

  document.getElementById("navGame").classList.toggle("primary", name === "game");
  document.getElementById("navEarn").classList.toggle("primary", name === "earn");
  document.getElementById("navTip").classList.toggle("primary", name === "tip");
}

function openSheet() {
  const bd = document.getElementById("sheetBackdrop");
  bd.classList.add("show");
  bd.setAttribute("aria-hidden", "false");
}
function closeSheet() {
  const bd = document.getElementById("sheetBackdrop");
  bd.classList.remove("show");
  bd.setAttribute("aria-hidden", "true");
}

// ---------- USDC transfer encoding ----------
const TRANSFER_SELECTOR = "a9059cbb";

function pad32(hexNo0x) {
  return hexNo0x.padStart(64, "0");
}

function parseUsdcToBaseUnits(input) {
  const s = String(input || "").trim();
  if (!s) throw new Error("Enter an amount");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Invalid amount");
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  const units = BigInt(whole) * BigInt(10 ** USDC_DECIMALS) + BigInt(fracPadded || "0");
  if (units <= 0n) throw new Error("Amount must be > 0");
  return units;
}

function encodeErc20Transfer(to, units) {
  const addr = to.replace(/^0x/, "").toLowerCase();
  const amt = units.toString(16);
  return "0x" + TRANSFER_SELECTOR + pad32(addr) + pad32(amt);
}

// ---------- Wallet helpers ----------
async function getProvider() {
  // Prefer Mini App provider if present.
  if (sdk?.wallet?.ethProvider) return sdk.wallet.ethProvider;
  if (window.ethereum) return window.ethereum;
  throw new Error("No wallet provider found");
}

async function ensureBaseChain(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId === BASE_MAINNET_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID) return chainId;

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_MAINNET_CHAIN_ID }] });
  } catch (e) {
    throw new Error("Please switch to Base in your wallet");
  }

  const next = await provider.request({ method: "eth_chainId" });
  if (next !== BASE_MAINNET_CHAIN_ID && next !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error("Could not switch to Base");
  }
  return next;
}

async function walletSendCalls({ calls }) {
  if (!isReadyToSend()) {
    toast("Sending disabled: set BUILDER_CODE first");
    throw new Error("BUILDER_CODE not set");
  }

  const provider = await getProvider();

  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const from = accounts?.[0];
  if (!from) throw new Error("No account selected");

  const chainId = await ensureBaseChain(provider);

  const req = {
    version: "2.0.0",
    from,
    chainId,
    atomicRequired: true,
    calls,
    capabilities: {
      dataSuffix
    }
  };

  // EIP-5792
  return provider.request({ method: "wallet_sendCalls", params: [req] });
}

async function walletSendCallsUsdc({ usdString, recipient }) {
  if (!isHexAddress(recipient)) throw new Error("Invalid recipient address");

  const units = parseUsdcToBaseUnits(usdString);
  const data = encodeErc20Transfer(recipient, units);

  return walletSendCalls({
    calls: [{
      to: USDC_CONTRACT,
      value: "0x0",
      data
    }]
  });
}

async function walletSendCallsEarnContract() {
  if (!isHexAddress(EARN_CONTRACT)) throw new Error("Invalid earn contract address");

  // Minimal onchain touch: 0-value call with empty calldata.
  // If your contract requires calldata (e.g., earn()), replace data with that selector.
  return walletSendCalls({
    calls: [{
      to: EARN_CONTRACT,
      value: "0x0",
      data: "0x"
    }]
  });
}
// ---------- Tip modal state machine ----------
const tipState = {
  status: "idle", // idle | preparing | wallet | sending | done
  usd: ""
};

function setTipCta(text, disabled) {
  const btn = document.getElementById("tipCta");
  btn.textContent = text;
  btn.disabled = !!disabled;
}

function setPrepAnim(on) {
  document.getElementById("prepAnim").classList.toggle("show", !!on);
}

function resetTipUi() {
  tipState.status = "idle";
  setPrepAnim(false);
  setTipCta("Send USDC", !isReadyToSend());
}

async function runTipFlow(usdString) {
  tipState.usd = usdString;

  // Pre-transaction UX: animate 1–1.5s BEFORE wallet opens
  tipState.status = "preparing";
  setTipCta("Preparing tip…", true);
  setPrepAnim(true);
  await new Promise((r) => setTimeout(r, 1200));

  try {
    tipState.status = "wallet";
    setTipCta("Confirm in wallet", true);

    const res = await walletSendCallsUsdc({ usdString, recipient: RECIPIENT });

    tipState.status = "sending";
    setTipCta("Sending…", true);

    // If wallet returns immediately, we still show a short sending state.
    await new Promise((r) => setTimeout(r, 900));

    tipState.status = "done";
    setPrepAnim(false);
    setTipCta("Send again", false);

    toast("Tip sent ✅");
    return res;
  } catch (e) {
    // Handle user rejection / errors gracefully
    setPrepAnim(false);
    resetTipUi();

    const msg = String(e?.message || e || "Transaction failed");
    if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("rejected")) {
      toast("Cancelled");
    } else {
      toast(msg);
    }
    throw e;
  }
}

// ---------- Earn flow ----------
async function runEarnFlow() {
  // Offchain mode: unlimited earning, no wallet.
  if (mode === "offchain") {
    pata += 10000;
    store.setPata(pata);
    updateHud();
    toast("Offchain: +10,000 Pata ✅");
    return;
  }

  // Onchain mode: each click executes a transaction to the earn contract.
  setEarnButtonState("Preparing…", true);

  // Pre-transaction UX: animate 1–1.5s BEFORE wallet opens
  await new Promise((r) => setTimeout(r, 1200));

  try {
    setEarnButtonState("Confirm in wallet", true);
    await walletSendCallsEarnContract();

    setEarnButtonState("Earning…", true);
    await new Promise((r) => setTimeout(r, 900));

    // reward + refill
    pata += 10000;
    energy = 100;

    store.setPata(pata);
    store.setEnergy(energy);
    updateHud();

    toast("Onchain: +10,000 Pata ✅");
    setEarnButtonState("Earn Pata", false);
  } catch (e) {
    setEarnButtonState("Earn Pata", false);
  }
}function setEarnButtonState(text, disabled) {
  const btn = document.getElementById("earnBtn");
  btn.textContent = text;
  btn.disabled = !!disabled || (mode === "onchain" && !isReadyToSend());
}

// ---------- Boot ----------
function wireUi() {
  updateHud();
  // energy regen starts only in onchain mode


  // Mode toggle
  const modeOff = document.getElementById("modeOff");
  const modeOn = document.getElementById("modeOn");

  function renderMode() {
    modeOff.classList.toggle("active", mode === "offchain");
    modeOn.classList.toggle("active", mode === "onchain");
    // Energy only relevant in onchain mode
    if (mode === "offchain") {
      stopEnergyRegen();
      energy = 100;
      updateHud();
    } else {
      energy = store.getEnergy();
      updateHud();
      // energy regen starts only in onchain mode
    }
    setEarnButtonState("Earn Pata", false);
    resetTipUi();
  }

  modeOff.addEventListener("click", () => {
    mode = "offchain";
    store.setMode(mode);
    renderMode();
    toast("Mode: Offchain");
  });

  modeOn.addEventListener("click", () => {
    mode = "onchain";
    store.setMode(mode);
    renderMode();
    toast("Mode: Onchain");
  });

  renderMode();


  const tapArea = document.getElementById("tapArea");
  tapArea.addEventListener("pointerdown", onTap, { passive: true });
  tapArea.addEventListener("touchstart", onTap, { passive: true });

  document.getElementById("navGame").addEventListener("click", () => {
    showPanel("game");
    closeSheet();
  });
  document.getElementById("navEarn").addEventListener("click", () => {
    showPanel("earn");
    closeSheet();
  });
  document.getElementById("navTip").addEventListener("click", () => {
    showPanel("tip");
    openSheet();
  });

  document.getElementById("closeSheet").addEventListener("click", () => {
    closeSheet();
    showPanel("game");
  });
  document.getElementById("sheetBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "sheetBackdrop") {
      closeSheet();
      showPanel("game");
    }
  });

  // presets
  document.querySelectorAll(".preset").forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.getAttribute("data-usd") || "";
      document.getElementById("customUsd").value = v;
      resetTipUi();
    });
  });

  document.getElementById("tipCta").addEventListener("click", async () => {
    if (!isReadyToSend()) {
      toast("Sending disabled: set BUILDER_CODE");
      return;
    }
    const usd = document.getElementById("customUsd").value.trim();
    if (tipState.status === "done") {
      resetTipUi();
      return;
    }
    await runTipFlow(usd);
  });

  document.getElementById("earnBtn").addEventListener("click", async () => {
    if (mode === "onchain" && !isReadyToSend()) {
      toast("Onchain disabled: set BUILDER_CODE");
      return;
    }
    await runEarnFlow();
  });

  // init states
  resetTipUi();
  setEarnButtonState("Earn Pata", false);
  showPanel("game");
}

async function safeReady() {
  try {
    // MUST be called so Mini App splash disappears.
    await sdk.actions.ready({ disableNativeGestures: false });
  } catch {
    // If opened in a browser (not allowed), ignore.
  }
}

window.addEventListener("load", async () => {
  wireUi();
  // Call ready as soon as UI is stable.
  await safeReady();
});
