// Bandor Pata Tapper — Farcaster Mini App (static)
// Domain: https://tapgorila.vercel.app/

// =========================
// Constants
// =========================
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const BASE_MAINNET_CHAIN_ID = "0x2105";
const BASE_SEPOLIA_CHAIN_ID = "0x14a34";

// Tip recipient (USDC receiver)
const RECIPIENT = "0x65576A499603259A7cD4F1FdF98A16048F09Bd07";

// Onchain earn target contract (each onchain tap sends a tx to this contract)
const EARN_CONTRACT = "0xB331328F506f2D35125e367A190e914B1b6830cF";

// Builder attribution code (required by your spec). Keep as TODO if you don't have it.
const BUILDER_CODE = "TODO_REPLACE_BUILDER_CODE";

// =========================
// Tiny helpers
// =========================
let _sdk = null;
let _provider = null;

function isHexAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(addr || ""));
}

function toast(msg, ms = 2200) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = String(msg);
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), ms);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getBuilderCode() {
  return BUILDER_CODE;
}


// =========================
// State
// =========================
const STATE_KEY = "bandor_state_v3";

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      return { pata: 0, streak: 0, lastPlayedDay: "", mode: "offchain" };
    }
    const s = JSON.parse(raw);
    return {
      pata: Number(s.pata || 0),
      streak: Number(s.streak || 0),
      lastPlayedDay: String(s.lastPlayedDay || ""),
      mode: s.mode === "onchain" ? "onchain" : "offchain",
    };
  } catch {
    return { pata: 0, streak: 0, lastPlayedDay: "", mode: "offchain" };
  }
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {}
}

function updateStreakOnPlay() {
  const k = todayKey();
  if (state.lastPlayedDay === k) return;

  const d = new Date();
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yk = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  state.streak = state.lastPlayedDay === yk ? Math.max(1, state.streak + 1) : 1;
  state.lastPlayedDay = k;
  saveState();
}

let state = loadState();

// =========================
// Render
// =========================
function render() {
  const pataText = document.getElementById("pataText");
  const energyText = document.getElementById("energyText");
  const streakText = document.getElementById("streakText");

  if (pataText) pataText.textContent = `Pata: ${Math.floor(state.pata)}`;
  // Your new requirement: OFFCHAIN unlimited + ONCHAIN unlimited (no energy system)
  if (energyText) energyText.textContent = "∞";
  if (streakText) streakText.textContent = `${Math.floor(state.streak)}`;

  const off = document.getElementById("modeOff");
  const on = document.getElementById("modeOn");
  off?.classList.toggle("active", state.mode === "offchain");
  on?.classList.toggle("active", state.mode === "onchain");
}

function setMode(mode) {
  state.mode = mode === "onchain" ? "onchain" : "offchain";
  saveState();
  render();
  toast(state.mode === "onchain" ? "Onchain mode: tap = transaction" : "Offchain mode: tap = instant");
}

function floatPlus(clientX, clientY, text) {
  const area = document.getElementById("tapArea");
  if (!area) return;
  const rect = area.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const el = document.createElement("div");
  el.className = "floatPlus";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  area.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

// =========================
// Panels + sheet
// =========================
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

// =========================
// Mini App SDK + Wallet (lazy)
// =========================
async function loadSdkIfPossible() {
  if (_sdk) return _sdk;
  try {
    const mod = await import("https://esm.sh/@farcaster/miniapp-sdk");
    _sdk = mod.sdk;
    return _sdk;
  } catch {
    return null;
  }
}

async function callReady() {
  // required: sdk.actions.ready()
  try {
    const sdk = await loadSdkIfPossible();
    await sdk?.actions?.ready?.({ disableNativeGestures: false });
  } catch {
    // ignore
  }
}

async function getProvider() {
  if (_provider) return _provider;

  // Prefer Farcaster Mini App injected provider (correct API)
  const sdk = await loadSdkIfPossible();
  try {
    if (sdk?.wallet?.getEthereumProvider) {
      _provider = await sdk.wallet.getEthereumProvider();
      if (_provider) return _provider;
    }
  } catch {
    // ignore and fall back
  }

  // Last resort fallback (may not support wallet_sendCalls)
  if (window.ethereum) {
    _provider = window.ethereum;
    return _provider;
  }
  return null;
}

async function ensureBaseChain(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });

  // allow sepolia only for switching logic; final should be mainnet
  if (chainId === BASE_MAINNET_CHAIN_ID) return;

  // if currently sepolia, still switch to mainnet
  if (chainId === BASE_SEPOLIA_CHAIN_ID || chainId !== BASE_MAINNET_CHAIN_ID) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_MAINNET_CHAIN_ID }],
      });
    } catch {
      throw new Error("Please switch to Base Mainnet (0x2105). ");
    }
  }
}


async function getWalletCapabilities(provider, account) {
  try {
    // Per EIP-5792, params: [account, [chainIds]]
    const res = await provider.request({
      method: "wallet_getCapabilities",
      params: [account, [BASE_MAINNET_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID]],
    });
    return res || null;
  } catch {
    return null;
  }
}

function walletSupportsCapability(caps, chainId, capName) {
  try {
    const c = caps?.[chainId]?.[capName];
    if (!c) return false;
    // Some wallets return { supported: true }, some return { status: "supported" }
    if (c.supported === true) return true;
    if (typeof c.status === "string" && c.status.toLowerCase() === "supported") return true;
    return true; // presence is a good signal
  } catch {
    return false;
  }
}

function pad32(hexNo0x) {
  return hexNo0x.padStart(64, "0");
}
function strip0x(h){return String(h||"").replace(/^0x/,"");}

function encodeLogActionCalldata(fromAddr, pataValue) {
  // logAction(bytes32,bytes) selector
  const selector = "2d9bc1fb";

  // bytes32 action = "TAP" (0x544150) padded right with zeros
  const actionHex = ("544150" + "0".repeat(64 - 6)); // 32 bytes

  // bytes payload = packed(address (20 bytes) + uint256 pata (32 bytes))
  const addr = strip0x(fromAddr).toLowerCase();
  const pata = BigInt(pataValue);
  const pataHex = pata.toString(16).padStart(64, "0");
  const payload = addr.padStart(40, "0") + pataHex; // 20 + 32 bytes => 52 bytes (0x34)

  const offset = pad32("40"); // head is 2 slots => 0x40
  const len = pad32("34");    // 52 bytes

  // payload padded to 32-byte boundary: 52 bytes => 64 bytes (12 bytes padding)
  const payloadPadded = payload + "0".repeat((64 - (payload.length % 64)) % 64);

  return "0x" + selector + actionHex + offset + len + payloadPadded;
}

async function detectEarnCalldata(provider, from) {
  // For your contract 0xB331... we call logAction(bytes32,bytes) every time.
  // This avoids revert/gas estimation failures that look like "not enough funds".
  return encodeLogActionCalldata(from, state?.pata ?? 0);
}

async function ensureEnoughGas(provider, from) {
(provider, from) {
  // Any onchain tx requires ETH for gas on Base.
  // If wallet blocks balance reads, we don't hard-fail.
  try {
    const balHex = await provider.request({ method: "eth_getBalance", params: [from, "latest"] });
    const bal = BigInt(balHex || "0x0");
    if (bal === 0n) throw new Error("No Base ETH for gas");
  } catch (e) {
    const m = String(e?.message || e || "");
    if (/No Base ETH for gas/i.test(m)) throw e;
  }
}

function encodeErc20Transfer(to, amountBaseUnits) {
  // selector a9059cbb
  const selector = "a9059cbb";
  const toClean = String(to).toLowerCase().replace(/^0x/, "");
  const toPadded = toClean.padStart(64, "0");
  const amtHex = amountBaseUnits.toString(16);
  const amtPadded = amtHex.padStart(64, "0");
  return "0x" + selector + toPadded + amtPadded;
}

async function getDataSuffix() {
  // REQUIRED: import EXACT line lives in js/erc8021_import.js and is loaded lazily.
  try {
    const mod = await import("https://tapgorila.vercel.app/js/erc8021_import.js");
    const suffix = mod.toDataSuffix(getBuilderCode());
    // Must be 0x-prefixed hex string
    if (typeof suffix !== "string" || !/^0x[0-9a-fA-F]*$/.test(suffix)) return null;
    return suffix;
  } catch {
    return null;
  }
}

async function walletSendCalls({ to, data }) {
  const provider = await getProvider();
  if (!provider) throw new Error("Wallet provider not found in this environment.");
  if (!isHexAddress(to)) throw new Error("Invalid to address.");

  await ensureBaseChain(provider);

  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const from = Array.isArray(accounts) ? accounts[0] : accounts;
  const chainId = await provider.request({ method: "eth_chainId" });

  // Build dataSuffix attribution.
  // IMPORTANT: builder code is set in code, NOT by the user.
  // If you haven't set it yet, we still send the tx, but mark capability as optional with value "0x".
  let dataSuffixValue = "0x";
  let hasBuilderCode = false;

  const effectiveBuilder = String(getBuilderCode() || "");
  if (effectiveBuilder && !effectiveBuilder.includes("TODO_REPLACE")) {
    hasBuilderCode = true;
    const maybe = await getDataSuffix();
    if (maybe) dataSuffixValue = maybe;
  }

  // Capability handling per EIP-5792: wallets MUST reject unsupported capabilities unless optional=true.
  const caps = await getWalletCapabilities(provider, from);
  const supportsDataSuffix = walletSupportsCapability(caps, chainId, "dataSuffix");

  const params = {
    version: "2.0.0",
    from,
    chainId,
    atomicRequired: true,
    calls: [{ to, value: "0x0", data }],
    capabilities: {
      dataSuffix: (supportsDataSuffix && hasBuilderCode)
        ? { value: dataSuffixValue }
        : { value: dataSuffixValue, optional: true }
    }
  };

  return provider.request({ method: "wallet_sendCalls", params: [params] });
}

// =========================
// Game tap logic (THIS is what you asked)
 (THIS is what you asked)
// =========================
let tapPending = false;

async function handleTap(ev) {
  const tapArea = document.getElementById("tapArea");
  if (!tapArea) return;

  const point = (ev && ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
  const cx = Number(point?.clientX || 0);
  const cy = Number(point?.clientY || 0);

  updateStreakOnPlay();

  if (state.mode === "offchain") {
    state.pata += 1;
    saveState();
    render();
    if (cx && cy) floatPlus(cx, cy, "+1");
    return;
  }

  // onchain
  if (tapPending) return;
  tapPending = true;

  try {
    // pre-wallet animation
    tapArea.classList.add("charging");
    toast("Preparing onchain tap…");
    await sleep(450);
    tapArea.classList.remove("charging");

    const provider = await getProvider();
    if (!provider) throw new Error("Wallet provider not found.");

    await ensureBaseChain(provider);
    const [from] = await provider.request({ method: "eth_requestAccounts" });
    await ensureEnoughGas(provider, from);

    // Send tx to your contract (value=0, data=0x) => only gas fee
    const data = await detectEarnCalldata(provider, from);
    await walletSendCalls({ to: EARN_CONTRACT, data });

    // local reward after sending
    state.pata += 1;
    saveState();
    render();
    if (cx && cy) floatPlus(cx, cy, "+1");
    toast("Onchain tap sent ✅");
  } catch (e) {
    const msg = String(e?.message || e || "Transaction failed");
    if (/user rejected|rejected|denied/i.test(msg)) toast("Cancelled");
    else if (/No Base ETH for gas/i.test(msg)) toast("Gas er jonno Base ETH dorkar. USDC diye gas hoy na.", 3600);
    else toast(msg, 3600);
  } finally {
    tapArea.classList.remove("charging");
    tapPending = false;
  }
}

// =========================
// Tip flow
// =========================
function parseUsdInput() {
  const custom = document.getElementById("customUsd");
  const raw = String(custom?.value || "").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

async function sendTipUSDC(usd) {
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

  // state machine
  if (cta) {
    cta.disabled = true;
    cta.textContent = "Preparing tip…";
  }

  prep?.classList.add("show");
  await sleep(450);

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
    prep?.classList.remove("show");
    toast("Tip sent ✅");
  } catch (e) {
    const msg = String(e?.message || e || "Tip failed");
    prep?.classList.remove("show");
    if (/user rejected|rejected|denied/i.test(msg)) toast("Cancelled");
    else toast(msg, 3600);

    if (cta) {
      cta.disabled = false;
      cta.textContent = "Send USDC";
    }
  }
}

// =========================
// Wire up UI
// =========================

async function bindUserContext() {
  try {
    const sdk = await loadSdkIfPossible();
    const ctx = sdk?.context;
    const pfp = ctx?.user?.pfpUrl || "";
    const name = ctx?.user?.displayName || ctx?.user?.username || "";
    const img = document.getElementById("userPfp");
    const fallback = document.getElementById("pfpFallback");
    if (img && pfp) {
      img.src = pfp;
      img.style.display = "inline-block";
      if (fallback) fallback.style.display = "none";
      if (name) img.title = name;
    } else {
      if (img) img.style.display = "none";
      if (fallback) fallback.style.display = "inline";
    }
    // Prevent showing raw FID anywhere; if you later add a name label, prefer displayName/username.
  } catch {
    // ignore
  }
}

function bindUI() {
  // Mode buttons
  document.getElementById("modeOff")?.addEventListener("click", () => setMode("offchain"));
  document.getElementById("modeOn")?.addEventListener("click", () => setMode("onchain"));

  // Nav
  document.getElementById("navGame")?.addEventListener("click", () => showPanel("game"));
  document.getElementById("navEarn")?.addEventListener("click", () => showPanel("earn"));
  document.getElementById("navTip")?.addEventListener("click", () => showPanel("tip"));

  // Tap area (both pointer + touch for reliability)
  const tapArea = document.getElementById("tapArea");
  if (tapArea) {
    tapArea.addEventListener("pointerdown", (e) => handleTap(e), { passive: true });
    tapArea.addEventListener("touchstart", (e) => handleTap(e), { passive: true });
  }

  // Earn button (keep existing page; button just mirrors behavior)
  document.getElementById("earnBtn")?.addEventListener("click", () => {
    toast("Use Bandor tap on Game tab ✅");
  });

  // Tip sheet close
  document.getElementById("closeSheet")?.addEventListener("click", closeSheet);
  document.getElementById("sheetBackdrop")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "sheetBackdrop") closeSheet();
  });

  // Presets
  document.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () => {
      const usd = Number(btn.getAttribute("data-usd"));
      const custom = document.getElementById("customUsd");
      if (custom) custom.value = String(usd);
    });
  });

  // Tip CTA
  document.getElementById("tipCta")?.addEventListener("click", async () => {
    const custom = parseUsdInput();
    await sendTipUSDC(custom);
  });
}
window.addEventListener("load", async () => {
  try {
    bindUI();
    await bindUserContext();
    render();
    // Mini App gate: call ready (but never break app if sdk missing)
    await callReady();
  } catch (e) {
    // If any runtime error happens, at least show a toast instead of silent failure
    toast("App error: " + String(e?.message || e), 4000);
  }
});
