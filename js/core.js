/* core.js - UI + game logic (no imports, so it always runs) */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const LS_KEY = "bandor_state_v3";
  const state = { pata: 0, mode: "offchain", streak: 0, lastPlayDay: "" };

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (typeof obj.pata === "number") state.pata = obj.pata;
      if (obj.mode === "offchain" || obj.mode === "onchain") state.mode = obj.mode;
      if (typeof obj.streak === "number") state.streak = obj.streak;
      if (typeof obj.lastPlayDay === "string") state.lastPlayDay = obj.lastPlayDay;
    } catch {}
  }
  function saveState() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {} }

  function toast(msg) {
    const t = $("#toast");
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => (t.style.opacity = "0"), 1800);
  }

  function render() {
    const pataText = $("#pataText");
    if (pataText) pataText.textContent = `Pata: ${state.pata}`;

    const energyText = $("#energyText");
    if (energyText) energyText.textContent = "∞";

    const streakText = $("#streakText");
    if (streakText) streakText.textContent = String(state.streak);

    const offBtn = $("#modeOff");
    const onBtn = $("#modeOn");
    if (offBtn && onBtn) {
      offBtn.classList.toggle("act", state.mode === "offchain");
      onBtn.classList.toggle("act", state.mode === "onchain");
    }
  }

  function updateStreak() {
    const tk = todayKey();
    if (state.lastPlayDay === tk) return;
    const last = state.lastPlayDay ? new Date(state.lastPlayDay) : null;
    const now = new Date(tk);
    let newStreak = 1;
    if (last) {
      const diffDays = Math.round((now - last) / (1000*60*60*24));
      if (diffDays === 1) newStreak = Math.max(1, state.streak + 1);
    }
    state.streak = newStreak;
    state.lastPlayDay = tk;
    saveState();
  }

  function pulseBandor() {
    const img = $("#bandor");
    if (!img) return;
    img.animate([{transform:"scale(1)"},{transform:"scale(1.03)"},{transform:"scale(1)"}], {duration:180, easing:"ease-out"});
  }

  function floatText(txt) {
    const host = $("#tapArea");
    if (!host) return;
    const d = document.createElement("div");
    d.className = "floatText";
    d.textContent = txt;
    d.style.left = "50%";
    d.style.top = "55%";
    host.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }

  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  let busy = false;

  async function onTap() {
    if (busy) return;
    busy = true;
    try {
      updateStreak();

      if (state.mode === "offchain") {
        state.pata += 1;
        saveState();
        render();
        floatText("+1");
        return;
      }

      // Onchain mode
      if (!window.walletBridge || typeof window.walletBridge.sendOnchainTap !== "function") {
        toast("Wallet not ready. Open inside Farcaster/Warpcast.");
        return;
      }

      pulseBandor();
      await sleep(120); // small feedback before wallet blocks

      const ok = await window.walletBridge.sendOnchainTap();
      if (ok) {
        state.pata += 1;
        saveState();
        render();
        floatText("+1");
      }
    } finally {
      busy = false;
    }
  }

  function openTipSheet() {
    const backdrop = $("#sheetBackdrop");
    if (!backdrop) return;
    backdrop.classList.add("show");
    backdrop.setAttribute("aria-hidden", "false");
  }
  function closeTipSheet() {
    const backdrop = $("#sheetBackdrop");
    if (!backdrop) return;
    backdrop.classList.remove("show");
    backdrop.setAttribute("aria-hidden", "true");
  }

  function wire() {
    const tapArea = $("#tapArea");
    if (tapArea) {
      tapArea.style.touchAction = "manipulation";
      tapArea.addEventListener("pointerdown", (e) => { e.preventDefault(); onTap(); }, { passive: false });
      tapArea.addEventListener("click", () => onTap());
    }

    const earnBtn = $("#earnBtn");
    if (earnBtn) {
      earnBtn.addEventListener("click", () => onTap());
    }

    const offBtn = $("#modeOff");
    const onBtn = $("#modeOn");
    if (offBtn) offBtn.addEventListener("click", () => { state.mode = "offchain"; saveState(); render(); });
    if (onBtn) onBtn.addEventListener("click", () => { state.mode = "onchain"; saveState(); render(); });

    const navGame = $("#navGame");
    const navEarn = $("#navEarn");
    const navTip = $("#navTip");
    const earnPanel = $("#earnPanel");
    if (navGame) navGame.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
      navGame.classList.add("primary");
      if (navEarn) navEarn.classList.remove("primary");
      if (navTip) navTip.classList.remove("primary");
    });
    if (navEarn && earnPanel) navEarn.addEventListener("click", () => {
      earnPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      navEarn.classList.add("primary");
      if (navGame) navGame.classList.remove("primary");
      if (navTip) navTip.classList.remove("primary");
    });
    if (navTip) navTip.addEventListener("click", () => {
      openTipSheet();
      navTip.classList.add("primary");
      if (navGame) navGame.classList.remove("primary");
      if (navEarn) navEarn.classList.remove("primary");
    });

    const closeSheet = $("#closeSheet");
    if (closeSheet) closeSheet.addEventListener("click", closeTipSheet);
    const backdrop = $("#sheetBackdrop");
    if (backdrop) backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeTipSheet(); });

    document.querySelectorAll(".preset").forEach((btn) => {
      btn.addEventListener("click", () => {
        const usd = btn.getAttribute("data-usd");
        const inp = $("#customUsd");
        if (inp) inp.value = usd;
      });
    });

    const tipCta = $("#tipCta");
    if (tipCta) tipCta.addEventListener("click", async () => {
      if (!window.walletBridge || typeof window.walletBridge.sendTipUSDC !== "function") {
        toast("Wallet not ready. Open inside Farcaster/Warpcast.");
        return;
      }
      const inp = $("#customUsd");
      const usd = Number((inp ? inp.value : "").trim());
      if (!Number.isFinite(usd) || usd <= 0) {
        toast("Enter a valid tip amount.");
        return;
      }

      const prep = $("#prepAnim");
      if (prep) prep.classList.add("on");
      await sleep(1200); // required pre-wallet animation
      try {
        await window.walletBridge.sendTipUSDC(usd);
        toast("Tip sent (if confirmed).");
        closeTipSheet();
      } catch {
        // walletBridge handles toast
      } finally {
        if (prep) prep.classList.remove("on");
      }
    });
  }

  window.addEventListener("load", () => {
    loadState();
    render();
    wire();
  });
})();
