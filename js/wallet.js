// wallet.js (module) - Farcaster Mini App wallet bridge
import { sdk } from "https://esm.sh/@farcaster/miniapp-sdk";
import { Attribution } from "https://esm.sh/ox/erc8021";

// ===== Config =====
const BASE_MAINNET_CHAIN_ID = "0x2105";
const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

// Tip recipient (USDC receiver)
const RECIPIENT = "0x65576A499603259A7cD4F1FdF98A16048F09Bd07";

// Onchain earn target contract
const ONCHAIN_CONTRACT = "0xB331328F506f2D35125e367A190e914B1b6830cF";

// Builder code (paste yours here; users should NOT input it)
const BUILDER_CODE = "TODO_REPLACE_BUILDER_CODE";

function toast(msg) {
  const t = document.querySelector("#toast");
  if (!t) return;
  t.textContent = msg;
  t.style.opacity = "1";
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => (t.style.opacity = "0"), 1900);
}

function isTodoBuilder(code) {
  return !code || code.includes("TODO");
}

// ===== Helpers =====
function toHex(n) {
  // n is BigInt
  return "0x" + n.toString(16);
}

function pad32(hexNo0x) {
  return hexNo0x.padStart(64, "0");
}

function strip0x(h) {
  return h.startsWith("0x") ? h.slice(2) : h;
}

function assertAddr(a) {
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}

// keccak selectors precomputed
// transfer(address,uint256) -> a9059cbb
const ERC20_TRANSFER_SELECTOR = "a9059cbb";
// logAction(bytes32,bytes) -> 2d9bc1fb (from user's repo)
const LOG_ACTION_SELECTOR = "2d9bc1fb";

// bytes32 action id for "BANDOR_TAP" (keccak256)
const ACTION_ID = "0xb14c7e19bfdac390b2e66b2115ead95095dc220a5482cae23d41552ab1cd3e08";

function encodeErc20Transfer(to, amountBaseUnitsBigInt) {
  const recipient = strip0x(to).toLowerCase();
  const amt = amountBaseUnitsBigInt.toString(16);
  return "0x" + ERC20_TRANSFER_SELECTOR + pad32(recipient) + pad32(amt);
}

function encodeLogActionBytes32Bytes(actionIdHex, payloadHex) {
  // ABI:
  // logAction(bytes32 actionId, bytes payload)
  // head[0]=bytes32
  // head[1]=offset to payload (0x40)
  // tail = len + data (padded)
  const action = strip0x(actionIdHex);
  const offset = pad32("40"); // 64 bytes
  const payload = strip0x(payloadHex || "0x");
  const len = pad32((payload.length / 2).toString(16));
  const paddedData = payload.padEnd(Math.ceil(payload.length / 64) * 64, "0");
  return "0x" + LOG_ACTION_SELECTOR + pad32(action) + offset + len + paddedData;
}

async function getProvider() {
  // Farcaster Mini App provider
  return await sdk.wallet.getEthereumProvider();
}

async function ensureBaseChain(provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId === BASE_MAINNET_CHAIN_ID) return;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_MAINNET_CHAIN_ID }]
    });
  } catch (e) {
    toast("Switch to Base Mainnet failed.");
    throw e;
  }
}

async function getFrom(provider) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const from = Array.isArray(accounts) ? accounts[0] : null;
  if (!from) throw new Error("No account");
  return from;
}

async function getCapabilities(provider) {
  try {
    return await provider.request({ method: "wallet_getCapabilities" });
  } catch {
    return null;
  }
}

function buildCapabilities(dataSuffixValue, optional) {
  // EIP-5792 capability object supports "optional" so wallets that don't support it won't reject the request
  // (EIP-5792: wallets MUST reject if unsupported and optional false/absent). 
  // We'll set optional=true for compatibility, but still pass the value when we can.
  if (!dataSuffixValue) return {};
  return { dataSuffix: { value: dataSuffixValue, optional: !!optional } };
}

function safeDataSuffix() {
  if (isTodoBuilder(BUILDER_CODE)) return null;
  try {
    return Attribution.toDataSuffix({ codes: [BUILDER_CODE] });
  } catch {
    return null;
  }
}

async function walletSendCalls(provider, from, chainId, calls, capabilities) {
  const params = [{
    version: "2.0.0",
    from,
    chainId,
    atomicRequired: true,
    calls,
    capabilities
  }];
  return await provider.request({ method: "wallet_sendCalls", params });
}

// ===== Bridge API =====
window.walletBridge = {
  async init() {
    try {
      await sdk.actions.ready();
    } catch {
      // Ignore outside mini app
    }

    },

  async sendOnchainTap() {
    let provider;
    try {
      provider = await getProvider();
      await ensureBaseChain(provider);
      const from = await getFrom(provider);
      const chainId = await provider.request({ method: "eth_chainId" });

      // Build calldata for logAction(bytes32,bytes) with empty payload (cheapest)
      const data = encodeLogActionBytes32Bytes(ACTION_ID, "0x");

      // Capabilities
      const suffix = safeDataSuffix();
      const caps = buildCapabilities(suffix, true);

      await walletSendCalls(provider, from, chainId, [{
        to: ONCHAIN_CONTRACT,
        value: "0x0",
        data
      }], caps);

      return true;
    } catch (e) {
      // Common wallet generic message; show our own clearer hint
      toast("Onchain tap failed. Make sure you're on Base and contract call is valid.");
      return false;
    }
  },

  async sendTipUSDC(usdAmountNumber) {
    if (!assertAddr(RECIPIENT)) {
      toast("Invalid recipient address in app config.");
      throw new Error("Invalid recipient");
    }
    if (isTodoBuilder(BUILDER_CODE)) {
      toast("Builder code missing in app config.");
      throw new Error("Builder code missing");
    }

    const provider = await getProvider();
    await ensureBaseChain(provider);
    const from = await getFrom(provider);
    const chainId = await provider.request({ method: "eth_chainId" });

    // USD -> USDC base units
    // usdAmountNumber is in USD; USDC has 6 decimals.
    const amount = BigInt(Math.round(usdAmountNumber * 1_000_000)); // safe for small tips
    if (amount <= 0n) {
      toast("Invalid amount.");
      throw new Error("Invalid amount");
    }

    const data = encodeErc20Transfer(RECIPIENT, amount);

    const suffix = safeDataSuffix();
    const caps = buildCapabilities(suffix, false);

    await walletSendCalls(provider, from, chainId, [{
      to: USDC_CONTRACT,
      value: "0x0",
      data
    }], caps);

    return true;
  }
};

// Auto-init
window.walletBridge.init();
