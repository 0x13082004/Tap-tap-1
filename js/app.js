// Bandor Pata Tapper — Farcaster Mini App (production static)
// Domain: https://tapgorila.vercel.app

const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;
const BASE_MAINNET_CHAIN_ID = "0x2105";
const BASE_SEPOLIA_CHAIN_ID = "0x14a34";

// Tip recipient (USDC receiver)
const RECIPIENT = "0x65576A499603259A7cD4F1FdF98A16048F09Bd07";

// Onchain earn target contract (each Earn click sends a tx to this contract)
const EARN_CONTRACT = "0xB331328F506f2D35125e367A190e914B1b6830cF";

// Builder attribution code (replace with your registered builder code if you have one)
const BUILDER_CODE = "bandor-pata-tapper";

let _sdk = null;
let _ethProvider = null;

function isHexAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function toast(msg, ms = 2200) {
  const el = document.getElementById("toast");
  if (!el) return;
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

function loadState() {
  try {
    const raw = localStorage.getItem("bandor_state_v2");
    if (!raw) {
      return {
        pata: 0,
        energy: 100,
        energyMax: 100,
        lastEnergyTs: Date.now(),
        streak: 0,
        lastPlayedDay: "",
        mode: "offchain", // 'offchain' | 'onchain'
      };
    }
    const s = JSON.parse(raw);
    return {
      pata: Number(s.pata || 0),
      energy: Number(s.energy ?? 100),
      energyMax: Number(s.energyMax ?? 100),
      lastEnergyTs: Number(s.lastEnergyTs || Date.now()),
      streak: Number(s.streak || 0),
      lastPlayedDay: String(s.lastPlayedDay || ""),
      mode: s.mode === "onchain" ? "onchain" : "offchain",
    };
  } catch {
    return {
      pata: 0,
      energy: 100,
      energyMax: 100,
      lastEnergyTs: Date.now(),
      streak: 0,
      lastPlayedDay: "",
      mode: "offchain",
    };
  }
}

function saveState() {
  try {
    localStorage.setItem("bandor_state_v2", JSON.stringify(state));
  } catch {
    // ignore
  }
}

function updateStreak() {
  const k = todayKey();
  if (state.lastPlayedDay === k) return;

  // if played yesterday, increment; else reset to 1
  const d = new Date();
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yk = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  if (state.lastPlayedDay === yk) state.streak = Math.max(1, state.streak + 1);
  else state.streak = 1;

  state.lastPlayedDay = k;
  saveState();
}

function regenEnergy() {
  // Energy regen only applies to OFFCHAIN tapping (you asked: Offchain unlimited earn button; but tapping can remain energy-based)
  // We'll keep energy regen but *Earn button* in offchain is unlimited.
  const now = Date.now();
  const elapsed = Math.max(0, now - state.lastEnergyTs);
  // regen: 1 energy per 6 seconds (100 in 10 minutes)
  const regenPerMs = 1 / 6000;
  const gain = Math.floor(elapsed * regenPerMs);
  if (gain > 0) {
    state.energy = Math.min(state.energyMax, state.energy + gain);
    state.lastEnergyTs = now;
    saveState();
  }
}

function setMode(mode) {
  state.mode = mode;
  saveState();
  const off = document.getElementById("modeOff");
  const on = document.getElementById("modeOn");
  if (off && on) {
    off.classList.toggle("active", mode === "offchain");
    on.classList.toggle("active", mode === "onchain");
  }
  toast(mode === "onchain" ? "Onchain mode: Earn = transaction" : "Offchain mode: unlimited earn");
}

function render() {
  const pataText = document.getElementById("pataText");
  const energyText = document.getElementById("energyText");
  const streakText = document.getElementById("streakText");

  if (pataText) pataText.textContent = `Pata: ${Math.floor(state.pata)}`;

  // In your screenshot, you saw 0/0 because JS didn't run.
  // We'll always show a sane energy UI.
  regenEnergy();
  if (energyText) energyText.textContent = `${Math.floor(state.energy)}/${Math.floor(state.energyMax)}`;
  if (streakText) streakText.textContent = `${Math.floor(state.streak)}`;
}

function floatPlus(x, y, text) {
  const area = document.getElementById("tapArea");
  if (!area) return;
  const el = document.createElement("div");
  el.className = "floatPlus";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  area.appendChild(el);
  window.setTimeout(() => el.remove(), 700);
}

function showPanel(panel) {
  const earn = document.getElementById("earnPanel");
  const navGame = document.getElementById("navGame");
  const navEarn = document.getElementById("navEarn");
  const navTip = document.getElementById("navTip");

  if (panel === "earn") {
    earn?.classList.add("show");
    navGame?.classList.remove("primary");
    navEarn?.classList.add("primary");
    navTip?.classList.remove("primary");
  } else if (panel === "tip") {
    earn?.classList.remove("show");
    navGame?.classList.remove("primary");
    navEarn?.classList.remove("primary");
    navTip?.classList.add("primary");
    openSheet();
  } else {
    earn?.classList.remove("show");
    navGame?.classList.add("primary");
    navEarn?.classList.remove("primary");
    navTip?.classList.remove("primary");
  }
}

function openSheet() {
  const b = document.getElementById("sheetBackdrop");
  if (!b) return;
  b.classList.add("show");
  b.setAttribute("aria-hidden", "false");
}

function closeSheet() {
  const b = document.getElementById("sheetBackdrop");
  if (!b) return;
  b.classList.remove("show");
  b.setAttribute("aria-hidden", "true");
  resetTipUI();
}

function resetTipUI() {
  const cta = document.getElementById("tipCta");
  const prep = document.getElementById("prepAnim");
  if (cta) {
    cta.disabled = false;
    cta.textContent = "Send USDC";
  }
  prep?.classList.remove("show");
}

async function loadSdkIfPossible() {
  if (_sdk) return _sdk;
  try {
    // Dynamic import so the rest of the game still works even if the CDN is blocked.
    const mod = await import("https://esm.sh/@farcaster/miniapp-sdk");
    _sdk = mod.sdk;
    return _sdk;
  } catch {
    return null;
  }
}

async function getProvider() {
  if (_ethProvider) return _ethProvider;

  const sdk = await loadSdkIfPossible();
  if (sdk?.wallet?.ethProvider) {
    _ethProvider = sdk.wallet.ethProvider;
    return _ethProvider;
  }

  if (window.ethereum) {
    _ethProvider = window.ethereum;
    return _ethProvider;
  }

  return null;
}

async function callReady() {
  const sdk = await loadSdkIfPossible();
  try {
    await sdk?.actions?.ready?.({ disableNativeGestures: false });
  } catch {
    // ignore
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureBaseChain(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId === BASE_MAINNET_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID) {
    if (chainId !== BASE_MAINNET_CHAIN_ID) {
      // We only allow Base mainnet for USDC / onchain earn in this app.
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_MAINNET_CHAIN_ID }],
        });
      } catch (e) {
        throw new Error("Please switch to Base Mainnet (0x2105). ");
      }
    }
    return;
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_MAINNET_CHAIN_ID }],
    });
  } catch {
    throw new Error("Please switch to Base Mainnet (0x2105). ");
  }
}

function encodeErc20Transfer(to, amountBaseUnits) {
  // selector a9059cbb
  const selector = "a9059cbb";
  const toClean = to.toLowerCase().replace(/^0x/, "");
  const toPadded = toClean.padStart(64, "0");
  const amtHex = amountBaseUnits.toString(16);
  const amtPadded = amtHex.padStart(64, "0");
  return "0x" + selector + toPadded + amtPadded;
}

async function getDataSuffix() {
  // REQUIRED (as per your spec): keep the exact import line in js/erc8021_import.js, loaded lazily.
  try {
    const mod = await import("https://tapgorila.vercel.app/js/erc8021_import.js");
    return mod.toDataSuffix(BUILDER_CODE);
  } catch {
    return null;
  }
}

async function walletSendCalls({ to, data }) {
  const provider = await getProvider();
  if (!provider) throw new Error("Wallet provider not found in this environment.");

  if (!isHexAddress(to)) throw new Error("Invalid contract/recipient address.");

  if (!BUILDER_CODE || BUILDER_CODE.includes("TODO_REPLACE")) {
    throw new Error("Builder code missing. Set BUILDER_CODE in js/app.js");
  }

  await ensureBaseChain(provider);

  const [from] = await provider.request({ method: "eth_requestAccounts" });
  const chainId = await provider.request({ method: "eth_chainId" });

  const dataSuffix = await getDataSuffix();
  if (!dataSuffix) {
    // dataSuffix is a requirement in your spec; we must fail clearly if not available
    throw new Error("Failed to load dataSuffix attribution library.");
  }

  const params = {
    version: "2.0.0",
    from,
    chainId,
    atomicRequired: true,
    calls: [
      {
        to,
        value: "0x0",
        data,
      },
    ],
    capabilities: {
      dataSuffix,
    },
  };

  return await provider.request({ method: "wallet_sendCalls", params: [params] });
}

async function onTap(ev) {
  updateStreak();

  // tap earns are offchain and energy-based
  if (state.energy <= 0) {
    toast("Out of energy — wait a bit");
    return;
  }

  state.energy -= 1;
  state.pata += 1;
  saveState();
  render();

  const rect = document.getElementById("tapArea")?.getBoundingClientRect();
  if (rect) {
    const x = (ev?.clientX ?? (rect.left + rect.width / 2)) - rect.left;
    const y = (ev?.clientY ?? (rect.top + rect.height / 2)) - rect.top;
    floatPlus(x, y, "+1");
  }
}

async function onEarnClick() {
  // Offchain: unlimited (no energy limit)
  if (state.mode === "offchain") {
    state.pata += 10000;
    saveState();
    render();
    toast("Offchain Earn: +10,000 Pata");
    return;
  }

  // Onchain: unlimited transactions (each click triggers tx)
  toast("Preparing onchain earn…");
  await sleep(1200); // pre-wallet animation window

  try {
    await walletSendCalls({
      to: EARN_CONTRACT,
      data: "0x", // contract receive/fallback — replace with function calldata if your contract requires it
    });

    state.pata += 10000;
    saveState();
    render();
    toast("Onchain Earn sent! +10,000 Pata");
  } catch (e) {
    const msg = (e && (e.message || e.toString())) || "Transaction failed";
    // User rejection handling should be gentle
    if (/user rejected|rejected|denied/i.test(msg)) {
      toast("Cancelled");
      return;
    }
    toast(msg, 3200);
  }
}

async function onTipClickFlow(usd) {
  const cta = document.getElementById("tipCta");
  const prep = document.getElementById("prepAnim");

  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) {
    toast("Enter a valid amount");
    return;
  }

  if (!isHexAddress(RECIPIENT)) {
    toast("Recipient address invalid");
    return;
  }

  // State machine
  if (cta) {
    cta.disabled = true;
    cta.textContent = "Preparing tip…";
  }

  // pre-wallet UX animation
  prep?.classList.add("show");
  await sleep(1200);

  try {
    if (cta) cta.textContent = "Confirm in wallet";

    const amountBase = BigInt(Math.round(n * 10 ** USDC_DECIMALS));
    if (amountBase <= 0n) throw new Error("Invalid amount");

    const data = encodeErc20Transfer(RECIPIENT, amountBase);

    if (cta) cta.textContent = "Sending…";

    await walletSendCalls({ to: USDC_CONTRACT, data });

    if (cta) {
      cta.textContent = "Send again";
      cta.disabled = false;
    }

    toast("Tip sent ✅");
  } catch (e) {
    const msg = (e && (e.message || e.toString())) || "Tip failed";
    if (/user rejected|rejected|denied/i.test(msg)) {
      toast("Cancelled");
    } else {
      toast(msg, 3200);
    }
    resetTipUI();
  } finally {
    prep?.classList.remove("show");
  }
}

function bindUI() {
  // mode buttons
  document.getElementById("modeOff")?.addEventListener("click", () => setMode("offchain"));
  document.getElementById("modeOn")?.addEventListener("click", () => setMode("onchain"));

  // nav
  document.getElementById("navGame")?.addEventListener("click", () => showPanel("game"));
  document.getElementById("navEarn")?.addEventListener("click", () => showPanel("earn"));
  document.getElementById("navTip")?.addEventListener("click", () => showPanel("tip"));

  // tap
  document.getElementById("tapArea")?.addEventListener("click", onTap);

  // earn
  document.getElementById("earnBtn")?.addEventListener("click", onEarnClick);

  // sheet close
  document.getElementById("closeSheet")?.addEventListener("click", closeSheet);
  document.getElementById("sheetBackdrop")?.addEventListener("click", (e) => {
    if (e.target?.id === "sheetBackdrop") closeSheet();
  });

  // presets
  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const usd = btn.getAttribute("data-usd");
      const input = document.getElementById("customUsd");
      if (input) input.value = usd;
    });
  });

  // tip cta
  document.getElementById("tipCta")?.addEventListener("click", async () => {
    const input = document.getElementById("customUsd");
    const val = input?.value?.trim();
    await onTipClickFlow(val);
  });
}

let state = loadState();

window.addEventListener("load", async () => {
  // Ensure sane defaults visible even if SDK fails
  if (!Number.isFinite(state.energyMax) || state.energyMax <= 0) state.energyMax = 100;
  if (!Number.isFinite(state.energy) || state.energy < 0) state.energy = state.energyMax;

  bindUI();
  setMode(state.mode);
  render();

  // Try to call sdk.actions.ready() but don't break the app if SDK can't load
  await callReady();

  // Keep energy ticking
  setInterval(() => {
    regenEnergy();
    render();
  }, 1200);
});
