function renderPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#040a11">
  <title>FloodGuard WhatsApp Link</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%}
    :root{--bg:#040a11;--text:#f4fbff;--muted:#8ba9b8;--cyan:#57ddff;--blue:#5278ff;--green:#56e6a2;--amber:#ffc861;--red:#ff7188;--line:rgba(131,218,255,.16)}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);background:radial-gradient(circle at 18% 5%,rgba(28,170,255,.17),transparent 31%),radial-gradient(circle at 86% 88%,rgba(82,120,255,.15),transparent 31%),linear-gradient(145deg,#02070c,#071521 58%,#040a11);overflow:hidden}
    .grid{position:fixed;inset:0;pointer-events:none;opacity:.34;background-image:linear-gradient(rgba(255,255,255,.023) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.023) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(circle,#000 12%,transparent 82%)}
    .orb{position:fixed;border-radius:50%;filter:blur(90px);pointer-events:none;opacity:.32;animation:orb 10s ease-in-out infinite}.orb.a{width:330px;height:330px;background:#0aa6ff;top:-130px;left:-100px}.orb.b{width:280px;height:280px;background:#5256ff;right:-90px;bottom:-90px;animation-delay:-4s}@keyframes orb{50%{transform:translateY(25px) scale(1.08)}}
    .shell{min-height:100vh;display:grid;place-items:center;padding:18px;perspective:1100px}.card{width:min(560px,100%);min-height:640px;border-radius:34px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(14,38,55,.79),rgba(4,15,24,.87));box-shadow:0 40px 120px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.065);backdrop-filter:blur(28px) saturate(135%);position:relative;overflow:hidden;transform-style:preserve-3d;animation:enter .65s cubic-bezier(.2,.85,.25,1)}@keyframes enter{from{opacity:0;transform:translateY(24px) scale(.975)}to{opacity:1;transform:none}}
    .shine{position:absolute;inset:-45% -30%;pointer-events:none;background:linear-gradient(116deg,transparent 44%,rgba(255,255,255,.05) 50%,transparent 56%);animation:shine 9s ease-in-out infinite}@keyframes shine{0%,45%{transform:translateX(-38%)}75%,100%{transform:translateX(38%)}}
    header{text-align:center;padding:34px 26px 15px;position:relative;z-index:2}.logo{width:70px;height:70px;border-radius:23px;margin:auto auto 15px;display:grid;place-items:center;font-size:33px;background:linear-gradient(145deg,rgba(87,221,255,.22),rgba(82,120,255,.12));border:1px solid rgba(103,222,255,.21);box-shadow:0 17px 50px rgba(32,174,255,.12),inset 0 1px rgba(255,255,255,.13)}h1{font-size:31px;letter-spacing:-.7px;margin:0}.sub{color:var(--muted);font-size:13px;margin:7px 0 0}.pill{margin:16px auto 0;width:max-content;max-width:100%;display:flex;align-items:center;gap:9px;padding:8px 13px;border-radius:999px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.07);font-size:12px;color:#cbe4ef}.dot{width:8px;height:8px;border-radius:50%;background:#708896;transition:background .3s,box-shadow .3s}.dot.ok{background:var(--green);box-shadow:0 0 0 4px rgba(86,230,162,.1)}.dot.wait{background:var(--amber);box-shadow:0 0 0 4px rgba(255,200,97,.1)}.dot.bad{background:var(--red);box-shadow:0 0 0 4px rgba(255,113,136,.1)}
    .body{padding:12px 25px 28px;position:relative;z-index:2}.stage{min-height:450px;border-radius:27px;border:1px solid rgba(255,255,255,.065);background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.25));display:grid;place-items:center;text-align:center;padding:25px 18px;position:relative;overflow:hidden}.view{grid-area:1/1;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:1;transform:translateY(0) scale(1);transition:opacity .32s ease,transform .32s ease}.view.hidden{opacity:0;pointer-events:none;transform:translateY(8px) scale(.985);visibility:hidden}
    .qrShell{position:relative;width:min(330px,78vw);aspect-ratio:1;background:linear-gradient(145deg,#fff,#edf8ff);border-radius:28px;padding:13px;box-shadow:0 28px 82px rgba(0,0,0,.44),0 0 54px rgba(87,221,255,.09);transition:opacity .25s,transform .25s}.qrShell.swapping{opacity:.34;transform:scale(.975)}.qrShell img{display:block;width:100%;height:100%;object-fit:contain;border-radius:17px}.scan{position:absolute;left:20px;right:20px;height:2px;top:19%;background:linear-gradient(90deg,transparent,var(--cyan),transparent);box-shadow:0 0 14px var(--cyan);opacity:.7;animation:scan 2.8s ease-in-out infinite}@keyframes scan{50%{top:79%}}
    .fresh{margin-top:16px;display:flex;gap:7px;align-items:center;color:#9ec6d7;font-size:11px}.fresh i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 12px rgba(86,230,162,.6)}.title{font-size:20px;font-weight:800;margin:19px 0 7px}.hint{margin:0;color:var(--muted);font-size:13px;line-height:1.62;max-width:425px}.chips{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin-top:16px}.chip{padding:7px 10px;border-radius:11px;background:rgba(255,255,255,.045);font-size:10px;color:#b8d0dc}
    .spinner{width:76px;height:76px;border-radius:50%;border:3px solid rgba(87,221,255,.13);border-top-color:var(--cyan);box-shadow:0 0 38px rgba(87,221,255,.11);animation:spin .9s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.check{width:106px;height:106px;border-radius:50%;display:grid;place-items:center;font-size:52px;color:#dffff0;background:radial-gradient(circle,rgba(86,230,162,.3),rgba(86,230,162,.07));border:1px solid rgba(86,230,162,.36);box-shadow:0 0 70px rgba(86,230,162,.15)}.successTitle{font-size:27px;margin:22px 0 8px}.device{margin-top:18px;padding:11px 14px;border-radius:14px;border:1px solid rgba(86,230,162,.14);background:rgba(86,230,162,.055);color:#c0f5dc;font:11px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}footer{text-align:center;padding:0 24px 24px;color:#607f8f;font-size:10px;position:relative;z-index:2}
    @media(max-width:540px){body{overflow:auto}.shell{padding:12px}.card{min-height:610px;border-radius:28px}header{padding:28px 18px 13px}.body{padding:9px 13px 20px}.stage{min-height:440px;border-radius:23px}.qrShell{width:min(310px,82vw)}}
  </style>
</head>
<body>
<div class="grid"></div><div class="orb a"></div><div class="orb b"></div>
<main class="shell"><section class="card"><div class="shine"></div>
<header><div class="logo">🌊</div><h1>FloodGuard</h1><p class="sub">WhatsApp secure device link</p><div class="pill"><span id="dot" class="dot wait"></span><span id="statusText">Starting secure session…</span></div></header>
<div class="body"><div class="stage">
<section id="qrView" class="view hidden"><div id="qrShell" class="qrShell"><img id="qrImage" alt="WhatsApp QR code"><div class="scan"></div></div><div class="fresh"><i></i><span>Current WhatsApp QR</span></div><div class="title">Scan once to link FloodGuard</div><p class="hint">After the first successful scan, FloodGuard keeps the saved session. Normal network drops and EC2 restarts reconnect without asking for another QR.</p><div class="chips"><span class="chip">WhatsApp</span><span class="chip">Linked Devices</span><span class="chip">Link a Device</span><span class="chip">Scan QR</span></div></section>
<section id="waitingView" class="view"><div class="spinner"></div><div id="waitingTitle" class="title">Restoring WhatsApp session…</div><p id="waitingText" class="hint">No QR is needed unless WhatsApp has actually logged this linked device out.</p></section>
<section id="connectedView" class="view hidden"><div class="check">✓</div><h2 class="successTitle">WhatsApp Connected Successfully</h2><p class="hint">The persistent FloodGuard WhatsApp session is authenticated and active.</p><div id="device" class="device"></div></section>
</div></div><footer>Stable UI · persistent session · QR only when re-linking is required</footer></section></main>
<script>
(() => {
  const $ = id => document.getElementById(id);
  let activeView = null;
  let lastSignature = '';
  let currentQrVersion = null;
  let pollBusy = false;

  function show(name) {
    if (activeView === name) return;
    activeView = name;
    $("qrView").classList.toggle("hidden", name !== "qr");
    $("waitingView").classList.toggle("hidden", name !== "waiting");
    $("connectedView").classList.toggle("hidden", name !== "connected");
  }

  function updateStatus(status) {
    const dot = $("dot");
    const text = $("statusText");
    const className = status === 'CONNECTED' ? 'dot ok' : status === 'WAITING_FOR_QR_SCAN' ? 'dot wait' : status === 'LOGGED_OUT' ? 'dot bad' : 'dot wait';
    if (dot.className !== className) dot.className = className;
    const label = status === 'CONNECTED' ? 'WhatsApp connected' : status === 'WAITING_FOR_QR_SCAN' ? 'QR scan required' : status === 'LOGGED_OUT' ? 'Session logged out · preparing QR' : status === 'DISCONNECTED' ? 'Reconnecting saved session…' : 'Restoring saved session…';
    if (text.textContent !== label) text.textContent = label;
  }

  async function loadQr(version) {
    if (!version || currentQrVersion === version) return;
    currentQrVersion = version;
    const shell = $("qrShell");
    shell.classList.add('swapping');
    const img = new Image();
    img.onload = () => {
      $("qrImage").src = img.src;
      shell.classList.remove('swapping');
    };
    img.onerror = () => shell.classList.remove('swapping');
    img.src = '/qr?v=' + encodeURIComponent(version) + '&_=' + Date.now();
  }

  function apply(data) {
    const signature = [data.whatsapp, data.firebase, data.connectedNumber || '', data.hasQr ? '1' : '0', data.qrVersion || '', data.lastError || ''].join('|');
    if (signature === lastSignature) return; // absolutely no visual work when state did not change
    lastSignature = signature;
    updateStatus(data.whatsapp || 'STARTING');

    if (data.whatsapp === 'CONNECTED') {
      show('connected');
      const deviceText = data.connectedNumber ? 'Linked device: ' + data.connectedNumber : 'WhatsApp linked device authenticated';
      if ($('device').textContent !== deviceText) $('device').textContent = deviceText;
      return;
    }

    if (data.whatsapp === 'WAITING_FOR_QR_SCAN' && data.hasQr && data.qrVersion) {
      show('qr');
      loadQr(data.qrVersion);
      return;
    }

    show('waiting');
    if (data.whatsapp === 'LOGGED_OUT') {
      $('waitingTitle').textContent = 'WhatsApp session logged out';
      $('waitingText').textContent = 'FloodGuard is resetting only the expired WhatsApp authentication and preparing one fresh QR.';
    } else if (data.whatsapp === 'DISCONNECTED') {
      $('waitingTitle').textContent = 'Reconnecting without QR…';
      $('waitingText').textContent = 'The saved linked-device session is being reused. No QR will appear unless WhatsApp confirms the session is invalid.';
    } else {
      $('waitingTitle').textContent = 'Restoring WhatsApp session…';
      $('waitingText').textContent = 'No QR is needed unless WhatsApp has actually logged this linked device out.';
    }
  }

  async function poll() {
    if (pollBusy) return;
    pollBusy = true;
    try {
      const res = await fetch('/status', { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      apply(await res.json());
    } catch {
      const signature = 'browser-offline';
      if (lastSignature !== signature) {
        lastSignature = signature;
        updateStatus('DISCONNECTED');
        show('waiting');
        $('waitingTitle').textContent = 'Server connection interrupted';
        $('waitingText').textContent = 'The page is retrying quietly in the background. Your saved WhatsApp session is not being cleared.';
      }
    } finally {
      pollBusy = false;
    }
  }

  poll();
  setInterval(poll, 2000); // silent background check; UI changes only on actual state changes
})();
</script>
</body></html>`;
}
module.exports = { renderPage };
