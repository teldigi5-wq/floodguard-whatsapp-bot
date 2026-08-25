function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#07151f">
  <title>FloodGuard WhatsApp Link</title>
  <style>
    *{box-sizing:border-box}
    :root{
      --bg:#06111a;
      --panel:rgba(11,31,44,.80);
      --panel2:rgba(15,43,59,.68);
      --line:rgba(151,220,255,.14);
      --text:#eef9ff;
      --muted:#8eafc0;
      --cyan:#56d8ff;
      --green:#54e6a2;
      --amber:#ffc868;
      --red:#ff7187;
      --shadow:0 35px 100px rgba(0,0,0,.42);
    }
    html,body{min-height:100%}
    body{
      margin:0;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:var(--text);
      background:
        radial-gradient(circle at 18% 5%,rgba(39,175,226,.16),transparent 30%),
        radial-gradient(circle at 85% 85%,rgba(35,230,151,.09),transparent 28%),
        linear-gradient(145deg,#041019,#071823 55%,#05121a);
      overflow-x:hidden;
    }
    body:before{
      content:"";
      position:fixed;inset:0;pointer-events:none;
      background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);
      background-size:44px 44px;
      mask-image:linear-gradient(to bottom,rgba(0,0,0,.7),transparent);
    }
    .shell{
      min-height:100vh;
      display:grid;
      place-items:center;
      padding:28px 16px;
    }
    .card{
      width:min(760px,100%);
      border:1px solid var(--line);
      border-radius:32px;
      background:linear-gradient(180deg,rgba(15,43,59,.88),rgba(7,25,36,.86));
      box-shadow:var(--shadow);
      backdrop-filter:blur(22px);
      overflow:hidden;
      position:relative;
    }
    .glow{
      position:absolute;width:240px;height:240px;border-radius:50%;
      background:rgba(77,210,255,.12);filter:blur(50px);
      top:-120px;right:-70px;pointer-events:none;
    }
    .header{padding:30px 32px 18px;text-align:center;position:relative}
    .brand{
      width:64px;height:64px;margin:0 auto 14px;border-radius:20px;
      display:grid;place-items:center;font-size:31px;
      background:linear-gradient(145deg,rgba(64,205,255,.2),rgba(27,112,150,.12));
      border:1px solid rgba(112,221,255,.2);
      box-shadow:inset 0 1px rgba(255,255,255,.12);
    }
    h1{font-size:clamp(25px,5vw,36px);margin:0;letter-spacing:-.7px}
    .subtitle{margin:8px 0 0;color:var(--muted);font-size:14px}
    .statusRow{display:flex;justify-content:center;gap:9px;flex-wrap:wrap;margin-top:20px}
    .pill{
      display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;
      background:rgba(3,16,24,.42);border:1px solid var(--line);font-size:12px;color:#c8e4f0;
    }
    .dot{width:8px;height:8px;border-radius:50%;background:#64808e;box-shadow:0 0 0 4px rgba(100,128,142,.10)}
    .dot.ok{background:var(--green);box-shadow:0 0 0 4px rgba(84,230,162,.10)}
    .dot.wait{background:var(--amber);box-shadow:0 0 0 4px rgba(255,200,104,.10)}
    .dot.bad{background:var(--red);box-shadow:0 0 0 4px rgba(255,113,135,.10)}
    .content{padding:12px 32px 32px}
    .stage{
      border:1px solid var(--line);border-radius:26px;background:rgba(2,14,21,.36);
      min-height:430px;padding:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
    }
    .qrFrame{
      width:min(360px,88vw);aspect-ratio:1;background:white;border-radius:27px;padding:14px;
      box-shadow:0 20px 70px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.3);
      transition:opacity .25s,transform .25s;
    }
    .qrFrame.refreshing{opacity:.28;transform:scale(.97)}
    .qrFrame img{display:block;width:100%;height:100%;object-fit:contain;border-radius:15px}
    .timerWrap{width:min(360px,88vw);margin:18px auto 0}
    .timerTop{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--muted);margin-bottom:8px}
    .bar{height:7px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}
    .barFill{height:100%;width:100%;border-radius:inherit;background:linear-gradient(90deg,#4cd7ff,#5be3a7);transition:width .5s linear}
    .instruction{font-size:16px;font-weight:700;margin:20px 0 6px}
    .hint{font-size:13px;color:var(--muted);line-height:1.55;margin:0;max-width:470px}
    .steps{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px}
    .step{font-size:11px;padding:7px 10px;border-radius:11px;background:rgba(255,255,255,.045);color:#bcd5df}
    .successIcon{
      width:96px;height:96px;border-radius:50%;display:grid;place-items:center;font-size:50px;
      background:radial-gradient(circle,rgba(84,230,162,.27),rgba(84,230,162,.08));
      border:1px solid rgba(84,230,162,.35);box-shadow:0 0 55px rgba(84,230,162,.16);
      animation:pop .45s cubic-bezier(.2,.9,.25,1.25);
    }
    @keyframes pop{from{transform:scale(.55);opacity:0}to{transform:scale(1);opacity:1}}
    .successTitle{font-size:28px;margin:20px 0 8px}
    .successText{color:var(--muted);font-size:14px;line-height:1.6;max-width:500px;margin:0 auto}
    .device{
      margin-top:18px;padding:12px 15px;border-radius:15px;background:rgba(84,230,162,.06);
      border:1px solid rgba(84,230,162,.14);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
      font-size:12px;color:#bbf5da;word-break:break-all;
    }
    .waitingIcon{width:70px;height:70px;border-radius:50%;border:3px solid rgba(86,216,255,.15);border-top-color:var(--cyan);animation:spin .9s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .waitTitle{font-size:22px;margin:22px 0 8px}
    .errorBox{margin-top:16px;color:#ffc1cb;font-size:12px;max-width:520px}
    .footer{
      padding:0 32px 27px;display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;
      color:#66899a;font-size:11px;
    }
    .footer strong{color:#8cb5c7;font-weight:600}
    .hidden{display:none!important}
    @media(max-width:560px){
      .header{padding:25px 18px 14px}.content{padding:10px 14px 18px}.stage{padding:22px 13px;min-height:410px}.footer{padding:0 18px 20px;justify-content:center;text-align:center}
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="card">
      <div class="glow"></div>
      <header class="header">
        <div class="brand">🌊</div>
        <h1>FloodGuard WhatsApp</h1>
        <p class="subtitle">Secure linked-device setup for the FloodGuard monitoring bot</p>
        <div class="statusRow">
          <div class="pill"><span id="waDot" class="dot"></span><span id="waStatus">WhatsApp · Starting</span></div>
          <div class="pill"><span id="fbDot" class="dot"></span><span id="fbStatus">Firebase · Starting</span></div>
        </div>
      </header>

      <div class="content">
        <div class="stage">
          <section id="qrView" class="hidden">
            <div id="qrFrame" class="qrFrame"><img id="qrImage" alt="WhatsApp link QR code"></div>
            <div class="timerWrap">
              <div class="timerTop"><span>QR refresh</span><strong id="timerText">--</strong></div>
              <div class="bar"><div id="timerBar" class="barFill"></div></div>
            </div>
            <p class="instruction">Scan with WhatsApp</p>
            <p class="hint">Use the phone that should remain linked to the FloodGuard bot. This page automatically switches to the newest QR when WhatsApp issues one.</p>
            <div class="steps">
              <span class="step">1 · WhatsApp</span><span class="step">2 · Linked Devices</span><span class="step">3 · Link a Device</span><span class="step">4 · Scan QR</span>
            </div>
          </section>

          <section id="successView" class="hidden">
            <div class="successIcon">✓</div>
            <h2 class="successTitle">WhatsApp Connected Successfully</h2>
            <p class="successText">FloodGuard is linked and ready. The QR has been disabled because this server already has an authenticated WhatsApp session.</p>
            <div id="deviceId" class="device"></div>
          </section>

          <section id="waitingView">
            <div class="waitingIcon"></div>
            <h2 id="waitTitle" class="waitTitle">Starting FloodGuard…</h2>
            <p id="waitText" class="hint">Waiting for WhatsApp to create a secure QR code.</p>
            <div id="errorBox" class="errorBox hidden"></div>
          </section>
        </div>
      </div>

      <footer class="footer">
        <span>Page updates automatically · no manual refresh needed</span>
        <span><strong>FloodGuard</strong> · EC2 + PM2</span>
      </footer>
    </section>
  </main>

<script>
(() => {
  const $ = id => document.getElementById(id);
  let currentQrVersion = null;
  let latest = null;

  function setView(name) {
    $("qrView").classList.toggle("hidden", name !== "qr");
    $("successView").classList.toggle("hidden", name !== "success");
    $("waitingView").classList.toggle("hidden", name !== "waiting");
  }

  function statusDot(el, status) {
    el.className = "dot";
    if (status === "CONNECTED") el.classList.add("ok");
    else if (status.includes("WAIT") || status.includes("START") || status.includes("RECONNECT")) el.classList.add("wait");
    else if (status.includes("DISCONNECT") || status.includes("LOGGED_OUT") || status.includes("ERROR")) el.classList.add("bad");
  }

  function pretty(s) {
    return String(s || "UNKNOWN").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  function render(data) {
    latest = data;
    $("waStatus").textContent = "WhatsApp · " + pretty(data.whatsapp);
    $("fbStatus").textContent = "Firebase · " + pretty(data.firebase);
    statusDot($("waDot"), data.whatsapp || "");
    statusDot($("fbDot"), data.firebase || "");

    if (data.whatsapp === "CONNECTED") {
      setView("success");
      $("deviceId").textContent = data.connectedNumber ? "Linked device: " + data.connectedNumber : "Linked device authenticated";
      return;
    }

    if (data.qr && data.qrVersion) {
      setView("qr");
      if (currentQrVersion !== data.qrVersion) {
        currentQrVersion = data.qrVersion;
        $("qrFrame").classList.add("refreshing");
        const preload = new Image();
        preload.onload = () => {
          $("qrImage").src = data.qr;
          $("qrFrame").classList.remove("refreshing");
        };
        preload.src = data.qr;
      }
      return;
    }

    setView("waiting");
    const expired = data.qrExpired;
    $("waitTitle").textContent = expired ? "QR expired — getting a new one…" :
      data.whatsapp === "DISCONNECTED" ? "WhatsApp reconnecting…" :
      data.whatsapp === "LOGGED_OUT" ? "WhatsApp session logged out" :
      "Preparing secure QR…";
    $("waitText").textContent = expired
      ? "The old QR has been hidden. FloodGuard will show the next QR automatically as soon as WhatsApp issues it."
      : "Keep this page open. It will update automatically.";
    if (data.lastError) {
      $("errorBox").textContent = data.lastError;
      $("errorBox").classList.remove("hidden");
    } else $("errorBox").classList.add("hidden");
  }

  function updateTimer() {
    if (!latest || !latest.qr || !latest.qrGeneratedAt || latest.whatsapp === "CONNECTED") return;
    const ttl = latest.qrTtlMs || 60000;
    const left = Math.max(0, ttl - (Date.now() - latest.qrGeneratedAt));
    const sec = Math.ceil(left / 1000);
    $("timerText").textContent = left > 0 ? sec + "s" : "Refreshing…";
    $("timerBar").style.width = Math.max(0, Math.min(100, left / ttl * 100)) + "%";
    if (left <= 0) {
      setView("waiting");
      $("waitTitle").textContent = "QR expired — getting a new one…";
      $("waitText").textContent = "The expired QR is hidden. A fresh QR will appear here automatically.";
    }
  }

  async function poll() {
    try {
      const r = await fetch("/status?_=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("Status HTTP " + r.status);
      render(await r.json());
    } catch (e) {
      $("waitTitle").textContent = "Connection to server interrupted";
      $("waitText").textContent = "Trying again automatically…";
      $("errorBox").textContent = e.message;
      $("errorBox").classList.remove("hidden");
    }
  }

  poll();
  setInterval(poll, 1000);
  setInterval(updateTimer, 250);
})();
</script>
</body>
</html>`;
}

module.exports = { renderPage };
