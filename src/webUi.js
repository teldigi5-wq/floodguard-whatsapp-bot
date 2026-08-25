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
      --bg:#050b12;
      --panel:rgba(10,24,36,.72);
      --panel2:rgba(12,31,45,.62);
      --line:rgba(118,210,255,.16);
      --text:#f3fbff;
      --muted:#8eabba;
      --cyan:#4fd6ff;
      --blue:#4d7dff;
      --green:#55e6a0;
      --amber:#ffc766;
      --red:#ff7088;
    }
    html,body{min-height:100%;margin:0}
    body{
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color:var(--text);
      background:
        radial-gradient(circle at 15% 8%,rgba(39,168,255,.16),transparent 30%),
        radial-gradient(circle at 85% 88%,rgba(77,125,255,.14),transparent 32%),
        linear-gradient(145deg,#02070d,#07131d 55%,#050b12);
      overflow:hidden;
    }
    .grid{
      position:fixed;inset:0;pointer-events:none;opacity:.38;
      background-image:
        linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
        linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
      background-size:42px 42px;
      mask-image:radial-gradient(circle at center,#000 15%,transparent 82%);
    }
    .orb{position:fixed;border-radius:50%;filter:blur(80px);pointer-events:none;opacity:.32;animation:float 9s ease-in-out infinite}
    .orb.a{width:310px;height:310px;background:#0aa5ff;top:-100px;left:-80px}
    .orb.b{width:260px;height:260px;background:#4a4dff;right:-70px;bottom:-70px;animation-delay:-3s}
    @keyframes float{50%{transform:translate3d(0,24px,0) scale(1.08)}}
    .wrap{min-height:100vh;display:grid;place-items:center;padding:20px;perspective:1200px}
    .card{
      width:min(560px,100%);
      min-height:650px;
      position:relative;
      overflow:hidden;
      border:1px solid var(--line);
      border-radius:34px;
      background:
        linear-gradient(180deg,rgba(15,39,56,.78),rgba(4,15,24,.84));
      box-shadow:0 40px 120px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.06);
      backdrop-filter:blur(28px) saturate(135%);
      transform-style:preserve-3d;
      animation:enter .7s cubic-bezier(.2,.85,.25,1);
    }
    @keyframes enter{from{opacity:0;transform:translateY(28px) rotateX(4deg) scale(.97)}to{opacity:1;transform:none}}
    .shine{
      position:absolute;inset:-40% -20%;pointer-events:none;
      background:linear-gradient(115deg,transparent 42%,rgba(255,255,255,.055) 49%,transparent 56%);
      transform:translateX(-45%);
      animation:shine 8s ease-in-out infinite;
    }
    @keyframes shine{55%,100%{transform:translateX(45%)}}
    header{text-align:center;padding:34px 28px 16px;position:relative}
    .logo{
      width:68px;height:68px;margin:0 auto 15px;border-radius:23px;
      display:grid;place-items:center;font-size:32px;
      background:linear-gradient(145deg,rgba(79,214,255,.22),rgba(77,125,255,.12));
      border:1px solid rgba(105,219,255,.2);
      box-shadow:0 15px 50px rgba(36,169,255,.12),inset 0 1px rgba(255,255,255,.12);
      transform:translateZ(35px);
    }
    h1{margin:0;font-size:31px;letter-spacing:-.7px}
    .sub{margin:8px 0 0;color:var(--muted);font-size:13px}
    .status{
      margin:17px auto 0;width:max-content;max-width:100%;
      display:flex;align-items:center;gap:9px;padding:8px 13px;border-radius:999px;
      background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.07);
      color:#cbe2ec;font-size:12px;
    }
    .dot{width:8px;height:8px;border-radius:50%;background:#6a8290;box-shadow:0 0 0 4px rgba(106,130,144,.09)}
    .dot.wait{background:var(--amber);box-shadow:0 0 0 4px rgba(255,199,102,.10)}
    .dot.ok{background:var(--green);box-shadow:0 0 0 4px rgba(85,230,160,.10)}
    .dot.bad{background:var(--red);box-shadow:0 0 0 4px rgba(255,112,136,.10)}
    .body{padding:14px 26px 28px}
    .stage{
      min-height:470px;border:1px solid rgba(255,255,255,.065);border-radius:27px;
      background:linear-gradient(180deg,rgba(0,0,0,.16),rgba(0,0,0,.25));
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:25px 18px;text-align:center;position:relative;overflow:hidden;
    }
    .scanGlow{
      position:absolute;width:280px;height:280px;border-radius:50%;
      background:radial-gradient(circle,rgba(67,201,255,.11),transparent 68%);
      animation:pulse 2.4s ease-in-out infinite;pointer-events:none;
    }
    @keyframes pulse{50%{transform:scale(1.12);opacity:.65}}
    .qrWrap{
      position:relative;width:min(330px,78vw);aspect-ratio:1;border-radius:28px;padding:13px;
      background:linear-gradient(145deg,#fff,#eef8ff);
      box-shadow:0 26px 80px rgba(0,0,0,.42),0 0 50px rgba(79,214,255,.08);
      transform:translateZ(45px);
      transition:opacity .25s,transform .25s;
    }
    .qrWrap.refreshing{opacity:.22;transform:scale(.965) translateZ(25px)}
    .qrWrap img{width:100%;height:100%;display:block;border-radius:17px;object-fit:contain}
    .scanLine{
      position:absolute;left:18px;right:18px;height:2px;top:20%;
      background:linear-gradient(90deg,transparent,var(--cyan),transparent);
      box-shadow:0 0 12px var(--cyan);opacity:.72;animation:scan 2.8s ease-in-out infinite;
    }
    @keyframes scan{50%{top:78%}}
    .timer{width:min(330px,78vw);margin-top:17px}
    .timerTop{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin-bottom:8px}
    .timerTop strong{color:#dff7ff}
    .track{height:7px;background:rgba(255,255,255,.07);border-radius:999px;overflow:hidden}
    .fill{height:100%;width:100%;border-radius:inherit;background:linear-gradient(90deg,var(--blue),var(--cyan));transition:width .2s linear}
    .title{font-size:19px;font-weight:800;margin:20px 0 7px}
    .hint{margin:0;color:var(--muted);font-size:13px;line-height:1.6;max-width:400px}
    .steps{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:15px}
    .chip{padding:7px 9px;border-radius:10px;background:rgba(255,255,255,.045);font-size:10px;color:#b7d0dc}
    .spinner{
      width:74px;height:74px;border-radius:50%;
      border:3px solid rgba(79,214,255,.12);border-top-color:var(--cyan);
      box-shadow:0 0 35px rgba(79,214,255,.10);animation:spin .85s linear infinite;
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .check{
      width:102px;height:102px;border-radius:50%;display:grid;place-items:center;font-size:50px;
      color:#dfffee;background:radial-gradient(circle,rgba(85,230,160,.28),rgba(85,230,160,.07));
      border:1px solid rgba(85,230,160,.35);box-shadow:0 0 65px rgba(85,230,160,.14);
      animation:success .55s cubic-bezier(.2,.9,.2,1.2);
    }
    @keyframes success{from{opacity:0;transform:scale(.55) rotate(-8deg)}to{opacity:1;transform:none}}
    .successTitle{font-size:26px;margin:22px 0 8px}
    .device{
      margin-top:18px;padding:10px 13px;border-radius:13px;
      border:1px solid rgba(85,230,160,.14);background:rgba(85,230,160,.055);
      color:#bdf4db;font:11px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all;
    }
    .hidden{display:none!important}
    footer{text-align:center;padding:0 24px 24px;color:#5f7e8e;font-size:10px}
    @media(max-width:520px){
      body{overflow:auto}.wrap{padding:12px}.card{min-height:620px;border-radius:27px}
      header{padding:28px 18px 13px}.body{padding:10px 13px 20px}.stage{min-height:440px;border-radius:22px}
      .qrWrap,.timer{width:min(300px,82vw)}
    }
  </style>
</head>
<body>
<div class="grid"></div><div class="orb a"></div><div class="orb b"></div>
<main class="wrap">
  <section class="card">
    <div class="shine"></div>
    <header>
      <div class="logo">🌊</div>
      <h1>FloodGuard</h1>
      <p class="sub">WhatsApp secure device link</p>
      <div class="status"><span id="statusDot" class="dot wait"></span><span id="statusText">Starting…</span></div>
    </header>
    <div class="body">
      <div class="stage">
        <div class="scanGlow"></div>

        <section id="qrView" class="hidden">
          <div id="qrWrap" class="qrWrap">
            <img id="qrImage" alt="WhatsApp QR code">
            <div class="scanLine"></div>
          </div>
          <div class="timer">
            <div class="timerTop"><span>QR refresh</span><strong id="timerText">30s</strong></div>
            <div class="track"><div id="timerFill" class="fill"></div></div>
          </div>
          <div class="title">Scan to connect</div>
          <p class="hint">Open WhatsApp on your phone and link this FloodGuard server as a device. A new QR appears automatically when WhatsApp issues one.</p>
          <div class="steps">
            <span class="chip">WhatsApp</span><span class="chip">Linked Devices</span><span class="chip">Link a Device</span><span class="chip">Scan</span>
          </div>
        </section>

        <section id="waitingView">
          <div class="spinner"></div>
          <div id="waitingTitle" class="title">Preparing QR…</div>
          <p id="waitingText" class="hint">FloodGuard is creating a secure WhatsApp link. Keep this page open.</p>
        </section>

        <section id="connectedView" class="hidden">
          <div class="check">✓</div>
          <h2 class="successTitle">WhatsApp Connected Successfully</h2>
          <p class="hint">FloodGuard is linked and ready. The QR is hidden while this WhatsApp session remains authenticated.</p>
          <div id="device" class="device"></div>
        </section>
      </div>
    </div>
    <footer>Auto-updating QR page · no manual refresh required</footer>
  </section>
</main>

<script>
(() => {
  const $ = id => document.getElementById(id);
  let latest = null;
  let currentQrVersion = null;

  const show = name => {
    $("qrView").classList.toggle("hidden", name !== "qr");
    $("waitingView").classList.toggle("hidden", name !== "waiting");
    $("connectedView").classList.toggle("hidden", name !== "connected");
  };

  const setStatus = status => {
    const dot = $("statusDot");
    dot.className = "dot";
    if (status === "CONNECTED") {
      dot.classList.add("ok");
      $("statusText").textContent = "WhatsApp connected";
    } else if (status === "LOGGED_OUT" || status === "DISCONNECTED") {
      dot.classList.add("bad");
      $("statusText").textContent = status === "LOGGED_OUT" ? "Logged out · creating new QR" : "Reconnecting…";
    } else {
      dot.classList.add("wait");
      $("statusText").textContent = status === "WAITING_FOR_QR_SCAN" ? "Waiting for QR scan" : "Preparing connection…";
    }
  };

  function render(data) {
    latest = data;
    setStatus(data.whatsapp || "STARTING");

    if (data.whatsapp === "CONNECTED") {
      show("connected");
      $("device").textContent = data.connectedNumber ? "Linked device: " + data.connectedNumber : "WhatsApp device linked";
      return;
    }

    if (data.qr && data.qrVersion) {
      show("qr");
      if (currentQrVersion !== data.qrVersion) {
        currentQrVersion = data.qrVersion;
        $("qrWrap").classList.add("refreshing");
        const img = new Image();
        img.onload = () => {
          $("qrImage").src = data.qr;
          $("qrWrap").classList.remove("refreshing");
        };
        img.src = data.qr;
      }
      return;
    }

    show("waiting");
    if (data.whatsapp === "LOGGED_OUT") {
      $("waitingTitle").textContent = "Session logged out";
      $("waitingText").textContent = "FloodGuard is clearing the expired session and generating a new QR automatically…";
    } else if (data.qrExpired) {
      $("waitingTitle").textContent = "Refreshing QR…";
      $("waitingText").textContent = "The previous QR expired. Waiting for the next real QR from WhatsApp.";
    } else if (data.whatsapp === "DISCONNECTED") {
      $("waitingTitle").textContent = "Reconnecting…";
      $("waitingText").textContent = "FloodGuard is reconnecting to WhatsApp automatically.";
    } else {
      $("waitingTitle").textContent = "Preparing QR…";
      $("waitingText").textContent = "FloodGuard is creating a secure WhatsApp link. Keep this page open.";
    }
  }

  function tick() {
    if (!latest || !latest.qrGeneratedAt || latest.whatsapp === "CONNECTED") return;
    const ttl = latest.qrTtlMs || 30000;
    const left = Math.max(0, ttl - (Date.now() - latest.qrGeneratedAt));
    const sec = Math.ceil(left / 1000);
    $("timerText").textContent = left > 0 ? sec + "s" : "Refreshing…";
    $("timerFill").style.width = Math.max(0, Math.min(100, left / ttl * 100)) + "%";
    if (left <= 0 && latest.whatsapp !== "CONNECTED") {
      show("waiting");
      $("waitingTitle").textContent = "Refreshing QR…";
      $("waitingText").textContent = "The previous QR expired. Waiting for the next real QR from WhatsApp.";
    }
  }

  async function poll() {
    try {
      const res = await fetch("/status?_=" + Date.now(), {cache:"no-store"});
      if (!res.ok) throw new Error("HTTP " + res.status);
      render(await res.json());
    } catch {
      setStatus("DISCONNECTED");
      show("waiting");
      $("waitingTitle").textContent = "Server connection interrupted";
      $("waitingText").textContent = "Trying again automatically…";
    }
  }

  poll();
  setInterval(poll, 1000);
  setInterval(tick, 200);
})();
</script>
</body>
</html>`;
}

module.exports = { renderPage };
