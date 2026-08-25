function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#050b12">
  <title>FloodGuard WhatsApp Link</title>
  <style>
    *{box-sizing:border-box}
    :root{
      --bg0:#02070c;--bg1:#06121c;--panel:rgba(9,25,38,.76);--panel2:rgba(13,34,49,.62);
      --line:rgba(135,218,255,.14);--text:#f4fbff;--muted:#88a8b9;--cyan:#58dcff;
      --blue:#5f76ff;--green:#55e6a0;--amber:#ffc96c;--red:#ff7189;
    }
    html,body{min-height:100%;margin:0}
    body{
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:var(--text);overflow:hidden;background:
        radial-gradient(circle at 12% 6%,rgba(27,165,255,.19),transparent 30%),
        radial-gradient(circle at 90% 90%,rgba(93,83,255,.17),transparent 34%),
        linear-gradient(145deg,var(--bg0),var(--bg1) 52%,#030910);
    }
    .noise,.grid,.aurora{position:fixed;inset:0;pointer-events:none}
    .grid{opacity:.34;background-image:linear-gradient(rgba(255,255,255,.024) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.024) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(circle at center,#000 12%,transparent 82%)}
    .aurora:before,.aurora:after{content:"";position:absolute;border-radius:50%;filter:blur(90px);opacity:.3;animation:drift 10s ease-in-out infinite}
    .aurora:before{width:340px;height:340px;background:#00a9ff;left:-120px;top:-110px}
    .aurora:after{width:300px;height:300px;background:#6757ff;right:-100px;bottom:-100px;animation-delay:-4s}
    @keyframes drift{50%{transform:translate3d(20px,28px,0) scale(1.08)}}
    .shell{min-height:100vh;display:grid;place-items:center;padding:22px;perspective:1400px}
    .card{width:min(590px,100%);min-height:660px;position:relative;overflow:hidden;border:1px solid var(--line);border-radius:36px;background:linear-gradient(180deg,rgba(15,42,59,.78),rgba(4,15,24,.88));box-shadow:0 45px 130px rgba(0,0,0,.52),inset 0 1px rgba(255,255,255,.065);backdrop-filter:blur(30px) saturate(140%);transform-style:preserve-3d;animation:cardIn .75s cubic-bezier(.2,.85,.25,1)}
    @keyframes cardIn{from{opacity:0;transform:translateY(34px) rotateX(6deg) scale(.965)}to{opacity:1;transform:none}}
    .card:before{content:"";position:absolute;inset:-50% -30%;background:linear-gradient(115deg,transparent 43%,rgba(255,255,255,.055) 49%,transparent 56%);transform:translateX(-45%);animation:shine 8s ease-in-out infinite;pointer-events:none}
    @keyframes shine{55%,100%{transform:translateX(45%)}}
    .top{text-align:center;padding:35px 28px 16px;position:relative;z-index:2}
    .brandOrb{width:72px;height:72px;margin:0 auto 15px;border-radius:24px;display:grid;place-items:center;font-size:34px;background:linear-gradient(145deg,rgba(88,220,255,.23),rgba(95,118,255,.14));border:1px solid rgba(122,226,255,.22);box-shadow:0 18px 55px rgba(38,178,255,.13),inset 0 1px rgba(255,255,255,.14);transform:translateZ(42px);animation:brandFloat 4s ease-in-out infinite}
    @keyframes brandFloat{50%{transform:translateZ(42px) translateY(-5px)}}
    h1{margin:0;font-size:32px;letter-spacing:-.8px}.sub{margin:7px 0 0;color:var(--muted);font-size:13px}
    .statusPill{margin:18px auto 0;width:max-content;max-width:100%;display:flex;align-items:center;gap:9px;padding:9px 14px;border-radius:999px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.075);color:#cde4ef;font-size:12px;transition:.3s}
    .dot{width:8px;height:8px;border-radius:50%;background:#647d8a;box-shadow:0 0 0 4px rgba(100,125,138,.09);transition:.3s}.dot.ok{background:var(--green);box-shadow:0 0 0 4px rgba(85,230,160,.1),0 0 17px rgba(85,230,160,.45)}.dot.wait{background:var(--amber);box-shadow:0 0 0 4px rgba(255,201,108,.1)}.dot.bad{background:var(--red);box-shadow:0 0 0 4px rgba(255,113,137,.1)}
    .body{padding:12px 27px 28px;position:relative;z-index:2}
    .stage{min-height:485px;border:1px solid rgba(255,255,255,.067);border-radius:29px;background:linear-gradient(180deg,rgba(0,0,0,.14),rgba(0,0,0,.27));display:grid;place-items:center;text-align:center;padding:27px 19px;position:relative;overflow:hidden}
    .stage:before{content:"";position:absolute;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle,rgba(76,204,255,.105),transparent 68%);animation:pulse 2.7s ease-in-out infinite;pointer-events:none}@keyframes pulse{50%{transform:scale(1.12);opacity:.65}}
    .view{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;position:relative;z-index:2;animation:viewIn .45s ease both}@keyframes viewIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
    .hidden{display:none!important}
    .qrShell{position:relative;width:min(342px,78vw);aspect-ratio:1;border-radius:30px;padding:13px;background:linear-gradient(145deg,#fff,#edf8ff);box-shadow:0 28px 86px rgba(0,0,0,.44),0 0 54px rgba(88,220,255,.08);transform:translateZ(52px);transition:opacity .25s,transform .25s}.qrShell.swapping{opacity:.22;transform:scale(.965) translateZ(30px)}
    .qrShell img{width:100%;height:100%;display:block;border-radius:18px;object-fit:contain}.scan{position:absolute;left:18px;right:18px;height:2px;top:18%;background:linear-gradient(90deg,transparent,var(--cyan),transparent);box-shadow:0 0 14px var(--cyan);opacity:.72;animation:scan 2.8s ease-in-out infinite}@keyframes scan{50%{top:80%}}
    .fresh{margin-top:15px;display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border-radius:999px;background:rgba(88,220,255,.06);border:1px solid rgba(88,220,255,.12);font-size:11px;color:#bfeeff}.fresh i{width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 12px rgba(88,220,255,.7)}
    .title{font-size:20px;font-weight:800;margin:19px 0 7px}.hint{margin:0;color:var(--muted);font-size:13px;line-height:1.62;max-width:425px}.chips{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:16px}.chip{padding:7px 10px;border-radius:11px;background:rgba(255,255,255,.045);font-size:10px;color:#b8d0dc}
    .spinner{width:76px;height:76px;border-radius:50%;border:3px solid rgba(88,220,255,.13);border-top-color:var(--cyan);box-shadow:0 0 38px rgba(88,220,255,.11);animation:spin .86s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
    .signal{width:100px;height:100px;position:relative;display:grid;place-items:center}.signal:before,.signal:after{content:"";position:absolute;border:1px solid rgba(88,220,255,.28);border-radius:50%;animation:ripple 2s ease-out infinite}.signal:before{inset:18px}.signal:after{inset:4px;animation-delay:.55s}@keyframes ripple{from{opacity:.7;transform:scale(.6)}to{opacity:0;transform:scale(1.3)}}
    .check{width:106px;height:106px;border-radius:50%;display:grid;place-items:center;font-size:52px;color:#dffff0;background:radial-gradient(circle,rgba(85,230,160,.3),rgba(85,230,160,.07));border:1px solid rgba(85,230,160,.36);box-shadow:0 0 70px rgba(85,230,160,.15);animation:success .55s cubic-bezier(.2,.9,.2,1.2)}@keyframes success{from{opacity:0;transform:scale(.55) rotate(-8deg)}to{opacity:1;transform:none}}
    .successTitle{font-size:27px;margin:22px 0 8px}.device{margin-top:18px;padding:11px 14px;border-radius:14px;border:1px solid rgba(85,230,160,.14);background:rgba(85,230,160,.055);color:#c0f5dc;font:11px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}
    .sessionBadge{margin-top:13px;display:inline-flex;gap:7px;align-items:center;color:#a7c5d4;font-size:11px}.sessionBadge b{color:#d9f3ff;font-weight:650}
    footer{text-align:center;padding:0 25px 25px;color:#607f8f;font-size:10px;position:relative;z-index:2}
    @media(max-width:540px){body{overflow:auto}.shell{padding:12px}.card{min-height:620px;border-radius:28px}.top{padding:28px 18px 13px}.body{padding:9px 13px 20px}.stage{min-height:450px;border-radius:23px}.qrShell{width:min(310px,82vw)}}
  </style>
</head>
<body>
<div class="grid"></div><div class="aurora"></div>
<main class="shell">
  <section id="tiltCard" class="card">
    <header class="top">
      <div class="brandOrb">🌊</div>
      <h1>FloodGuard</h1>
      <p class="sub">WhatsApp secure device link</p>
      <div class="statusPill"><span id="statusDot" class="dot wait"></span><span id="statusText">Starting secure session…</span></div>
    </header>
    <div class="body">
      <div class="stage">
        <section id="qrView" class="view hidden">
          <div id="qrShell" class="qrShell"><img id="qrImage" alt="WhatsApp QR code"><div class="scan"></div></div>
          <div class="fresh"><i></i><span>Live WhatsApp QR · updates automatically if replaced</span></div>
          <div class="title">Scan once to link FloodGuard</div>
          <p class="hint">Open WhatsApp on your phone and link this server. After a successful scan, FloodGuard keeps the saved session and will not ask for another QR during normal reconnects or EC2 restarts.</p>
          <div class="chips"><span class="chip">WhatsApp</span><span class="chip">Linked Devices</span><span class="chip">Link a Device</span><span class="chip">Scan QR</span></div>
        </section>

        <section id="waitingView" class="view">
          <div class="signal"><div class="spinner"></div></div>
          <div id="waitingTitle" class="title">Restoring WhatsApp session…</div>
          <p id="waitingText" class="hint">FloodGuard is checking the saved linked-device session. No QR is needed unless WhatsApp has actually logged this device out.</p>
        </section>

        <section id="connectedView" class="view hidden">
          <div class="check">✓</div>
          <h2 class="successTitle">WhatsApp Connected Successfully</h2>
          <p class="hint">The FloodGuard WhatsApp session is authenticated and active. You only need to scan again if this linked device is explicitly logged out or removed from WhatsApp.</p>
          <div id="device" class="device"></div>
          <div class="sessionBadge">Session mode: <b>persistent linked device</b></div>
        </section>
      </div>
    </div>
    <footer>Persistent session · automatic reconnect · QR only when re-linking is required</footer>
  </section>
</main>
<script>
(() => {
  const $ = id => document.getElementById(id);
  let currentQrVersion = null;
  const show = name => {
    $("qrView").classList.toggle("hidden", name !== "qr");
    $("waitingView").classList.toggle("hidden", name !== "waiting");
    $("connectedView").classList.toggle("hidden", name !== "connected");
  };
  const setStatus = status => {
    const dot = $("statusDot"); dot.className = "dot";
    if (status === "CONNECTED") { dot.classList.add("ok"); $("statusText").textContent = "WhatsApp connected"; }
    else if (status === "WAITING_FOR_QR_SCAN") { dot.classList.add("wait"); $("statusText").textContent = "QR scan required"; }
    else if (status === "LOGGED_OUT") { dot.classList.add("bad"); $("statusText").textContent = "Session logged out · preparing QR"; }
    else { dot.classList.add("wait"); $("statusText").textContent = "Restoring saved session…"; }
  };
  function render(data) {
    setStatus(data.whatsapp || "STARTING");
    if (data.whatsapp === "CONNECTED") {
      show("connected");
      $("device").textContent = data.connectedNumber ? "Linked device: " + data.connectedNumber : "WhatsApp linked device authenticated";
      return;
    }
    if (data.qr && data.qrVersion) {
      show("qr");
      if (currentQrVersion !== data.qrVersion) {
        currentQrVersion = data.qrVersion;
        $("qrShell").classList.add("swapping");
        const img = new Image();
        img.onload = () => { $("qrImage").src = data.qr; $("qrShell").classList.remove("swapping"); };
        img.src = data.qr;
      }
      return;
    }
    show("waiting");
    if (data.whatsapp === "LOGGED_OUT") {
      $("waitingTitle").textContent = "WhatsApp session logged out";
      $("waitingText").textContent = "FloodGuard is safely resetting only the expired WhatsApp authentication and will show a fresh QR automatically.";
    } else if (data.whatsapp === "DISCONNECTED") {
      $("waitingTitle").textContent = "Reconnecting without QR…";
      $("waitingText").textContent = "The saved linked-device session is still being used. FloodGuard will only show a QR if WhatsApp confirms that this session is no longer valid.";
    } else {
      $("waitingTitle").textContent = "Restoring WhatsApp session…";
      $("waitingText").textContent = "FloodGuard is checking the saved linked-device session. No QR is needed unless WhatsApp has actually logged this device out.";
    }
  }
  async function poll() {
    try {
      const res = await fetch("/status?_=" + Date.now(), {cache:"no-store"});
      if (!res.ok) throw new Error("HTTP " + res.status);
      render(await res.json());
    } catch {
      setStatus("DISCONNECTED"); show("waiting");
      $("waitingTitle").textContent = "Server connection interrupted";
      $("waitingText").textContent = "The page is retrying automatically. The bot process and saved WhatsApp session are not cleared by this browser error.";
    }
  }
  const card = $("tiltCard");
  if (matchMedia("(pointer:fine)").matches) {
    addEventListener("pointermove", e => {
      const x = (e.clientX / innerWidth - .5) * 2, y = (e.clientY / innerHeight - .5) * 2;
      card.style.transform = "rotateY(" + (x*1.8) + "deg) rotateX(" + (-y*1.4) + "deg)";
    });
    addEventListener("pointerleave", () => card.style.transform = "");
  }
  poll(); setInterval(poll, 1000);
})();
</script>
</body>
</html>`;
}
module.exports = { renderPage };
