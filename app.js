// Bandor Pata Tapper — Farcaster / Base Mini App
// Domain (STRICT)
const DOMAIN = "https://nurrabby.com/";
const PRIMARY_ROUTE = "https://nurrabby.com/";

// Wallet / chain constants
const BASE_MAINNET_CHAIN_ID = "0x2105"; // Base Mainnet
const BASE_SEPOLIA_CHAIN_ID = "0x14a34"; // Base Sepolia (allowed, but we prefer mainnet)
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bda02913"; // native USDC on Base

// Builder code attribution (REQUIRED)
import { Attribution } from "https://esm.sh/ox/erc8021";
const BUILDER_CODE = "TODO_REPLACE_BUILDER_CODE";
const dataSuffix = Attribution.toDataSuffix({
  codes: [BUILDER_CODE]
});

// Farcaster Mini App SDK
import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";

const $ = (id) => document.getElementById(id);

const ui = {
  balanceEl: $("balance"),
  balanceWrap: $("balanceWrap"),
  bandor: $("bandor"),
  bandorWrap: $("bandorWrap"),
  milestone: $("milestone"),
  earnBtn: $("earnBtn"),
  tipBtn: $("tipBtn"),
  tipStatus: $("tipStatus"),
  blocker: $("blocker")
};

let balance = 150;
const EARN_PER_TAP = 5;
const milestones = [500, 1000, 2500, 5000];
const milestoneSeen = new Set();

function formatNumber(n) {
  return n.toLocaleString("en-US");
}

function showBlocker(message) {
  ui.blocker.classList.remove("hidden");
  if (message) {
    ui.blocker.querySelector(".blocker-text").textContent = message;
  }
}

function hideBlocker() {
  ui.blocker.classList.add("hidden");
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ====== MINI APP DETECTION GATE (MANDATORY) ======
async function preflightMiniAppChecks() {
  // 1) farcaster.json exists + homeUrl + miniapp.imageUrl
  const manifestUrl = DOMAIN + ".well-known/farcaster.json";
  let manifest;
  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) return { ok: false, reason: "Manifest missing or not reachable: " + manifestUrl };
    manifest = await res.json();
  } catch (e) {
    return { ok: false, reason: "Failed to fetch/parse farcaster.json manifest." };
  }

  const miniapp = manifest?.miniapp || manifest?.frame || null;
  if (!miniapp) {
    return { ok: false, reason: "Manifest must include a miniapp object (or frame) with required fields." };
  }
  if (miniapp.homeUrl !== PRIMARY_ROUTE) {
    return { ok: false, reason: "miniapp.homeUrl must exactly match: " + PRIMARY_ROUTE };
  }
  if (miniapp.imageUrl !== (DOMAIN + "assets/embed-3x2.png")) {
    return { ok: false, reason: "miniapp.imageUrl must be exactly: " + (DOMAIN + "assets/embed-3x2.png") };
  }

  // 2) meta tags exist + valid JSON + launch_frame action type
  const miniTag = document.querySelector('meta[name="fc:miniapp"]');
  const frameTag = document.querySelector('meta[name="fc:frame"]');
  if (!miniTag || !frameTag) {
    return { ok: false, reason: "Missing required meta tags: fc:miniapp and fc:frame." };
  }

  const miniCfg = safeJsonParse(miniTag.getAttribute("content") || "");
  const frameCfg = safeJsonParse(frameTag.getAttribute("content") || "");
  if (!miniCfg || !frameCfg) {
    return { ok: false, reason: "Meta tag JSON is invalid. Ensure single-line valid JSON with double quotes." };
  }

  const actionType = miniCfg?.button?.action?.type;
  if (actionType !== "launch_frame") {
    return { ok: false, reason: 'Embed action type must be exactly "launch_frame".' };
  }

  // 3) SDK exists and ready() will be called (we call later)
  return { ok: true };
}

function getCenterRect(el) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.top + r.height / 2
  };
}

function spawnLeafFlight() {
  const leaf = document.createElement("img");
  leaf.src = "./assets/leaf.svg";
  leaf.className = "leaf-fly";
  document.body.appendChild(leaf);

  const start = getCenterRect(ui.earnBtn);
  const end = getCenterRect(ui.balanceWrap);

  // place at start
  leaf.style.left = (start.x - 13) + "px";
  leaf.style.top = (start.y - 13) + "px";

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const spin = (Math.random() * 120 - 60);

  const anim = leaf.animate(
    [
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 60}px) scale(1.05) rotate(${spin}deg)`, opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(.9) rotate(${spin * 1.6}deg)`, opacity: 0 }
    ],
    { duration: 520, easing: "cubic-bezier(.2,.9,.2,1)", fill: "forwards" }
  );

  anim.onfinish = () => leaf.remove();
}

function bandorReact() {
  ui.bandor.classList.remove("react");
  // reflow
  void ui.bandor.offsetWidth;
  ui.bandor.classList.add("react");
}

function checkMilestones() {
  for (const m of milestones) {
    if (balance >= m && !milestoneSeen.has(m)) {
      milestoneSeen.add(m);
      ui.milestone.classList.remove("hidden");
      ui.milestone.textContent = m === 500 ? "😄 Bandor is getting hyped!" :
                                  m === 1000 ? "🤩 Bandor unlocked mega smile!" :
                                  m === 2500 ? "🔥 Bandor is unstoppable!" :
                                  "🤑 Bandor is rich in Pata!";
      setTimeout(() => ui.milestone.classList.add("hidden"), 1300);

      // pose changes
      if (m === 500) ui.bandor.classList.add("pose500");
      if (m === 1000) ui.bandor.classList.add("pose1000");
    }
  }
}

function onEarnTap() {
  balance += EARN_PER_TAP;
  ui.balanceEl.textContent = formatNumber(balance);

  ui.earnBtn.classList.remove("bounce");
  void ui.earnBtn.offsetWidth;
  ui.earnBtn.classList.add("bounce");

  spawnLeafFlight();
  bandorReact();
  checkMilestones();
}

// ===== Wallet / Tip (ERC-5792) =====
function setTipStatus(msg) {
  ui.tipStatus.textContent = msg || "";
}

function pad32(hexNo0x) {
  return hexNo0x.padStart(64, "0");
}

function encodeErc20Transfer(to, amountHexNo0x) {
  // transfer(address,uint256) selector = 0xa9059cbb
  const selector = "a9059cbb";
  const toClean = to.toLowerCase().replace(/^0x/, "");
  const toArg = pad32(toClean);
  const amtArg = pad32(amountHexNo0x.replace(/^0x/, ""));
  return "0x" + selector + toArg + amtArg;
}

async function ensureBaseMainnet(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId === BASE_MAINNET_CHAIN_ID) return;

  // Allowed chains: Base Mainnet or Base Sepolia — but we REQUIRE Base Mainnet for USDC tip.
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_MAINNET_CHAIN_ID }]
    });
  } catch (e) {
    throw new Error("Please switch to Base Mainnet (chainId 0x2105) in your wallet to send the tip.");
  }
}

async function sendTip1USDC() {
  ui.tipBtn.disabled = true;
  setTipStatus("Preparing tip…");

  try {
    const provider = await sdk.wallet.getEthereumProvider();

    const accounts = await provider.request({ method: "eth_requestAccounts" });
    const from = accounts?.[0];
    if (!from) throw new Error("No wallet account returned.");

    await ensureBaseMainnet(provider);

    // Tip recipient (YOUR address) — replace this with the address you want to receive tips.
    const TIP_RECIPIENT = "0x000000000000000000000000000000000000dEaD";

    // 1 USDC = 1_000_000 (6 decimals) = 0x0f4240
    const amountHexNo0x = "0f4240";

    const data = encodeErc20Transfer(TIP_RECIPIENT, amountHexNo0x);

    const params = {
      version: "2.0.0",
      from,
      chainId: BASE_MAINNET_CHAIN_ID,
      atomicRequired: true,
      calls: [{
        to: USDC_BASE_MAINNET,
        value: "0x0",
        data
      }],
      capabilities: {
        dataSuffix
      }
    };

    const result = await provider.request({
      method: "wallet_sendCalls",
      params: [params]
    });

    setTipStatus("Tip sent ✅");
    console.log("wallet_sendCalls result:", result);
  } catch (err) {
    const code = err?.code;
    if (code === 4001) {
      // User rejected
      setTipStatus("Tip cancelled");
    } else {
      setTipStatus(err?.message || "Tip failed");
    }
  } finally {
    ui.tipBtn.disabled = false;
  }
}

async function init() {
  ui.balanceEl.textContent = formatNumber(balance);

  // --- Preflight checks (must pass) ---
  const checks = await preflightMiniAppChecks();
  if (!checks.ok) {
    showBlocker(checks.reason);
  }

  // --- Runtime Mini App detection ---
  let inMiniApp = false;
  try {
    inMiniApp = await sdk.isInMiniApp();
  } catch {
    inMiniApp = false;
  }

  if (!inMiniApp) {
    showBlocker();
    // Still call ready() to satisfy "always called" requirement; it should be a no-op outside a host.
    try { await sdk.actions.ready(); } catch {}
    return;
  }

  // Show wallet tip UI only inside a host
  ui.tipBtn.classList.remove("hidden");

  // Ready: hide splash screen / show the Mini App surface
  await sdk.actions.ready();

  hideBlocker();

  // Bind UI events AFTER ready (UI is now visible inside host)
  ui.earnBtn.addEventListener("click", onEarnTap, { passive: true });
  ui.tipBtn.addEventListener("click", sendTip1USDC);
}

init();
