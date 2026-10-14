'use strict';

// Separate HTML from the real QR/pairing interface. All displayed data is
// fetched from the synthetic in-memory demo fixtures and read-only command
// formatter. No CDN, external scripts, network beacons or real device APIs.
function renderCommandCenter(){
return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#071018">
<title>FloodGuard · Offline Command Center</title>
<style>
:root{--bg:#061018;--surface:#0c1c27;--surface2:#102735;--border:#264451;--text:#ecf8ff;--muted:#acc3ce;--accent:#77dff7;--safe:#8ef0c5;--warn:#ffcf85;--danger:#ff9eae;--radius:18px}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 85% 0%,#12334a 0%,transparent 34%),linear-gradient(165deg,#061018,#0b1823);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
button,select{font:inherit}
button,select{color:var(--text)}
button{cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}
:focus-visible{outline:3px solid #abebff;outline-offset:3px}
.skip{position:absolute;top:-80px;left:16px;z-index:20;padding:10px;background:#e4f9ff;color:#09202b}
.skip:focus{top:12px}
.chrome{position:sticky;top:0;z-index:10;background:rgba(6,16,24,.94);border-bottom:1px solid var(--border);backdrop-filter:blur(16px)}
.bar{max-width:1440px;margin:auto;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:11px;font-weight:800;letter-spacing:.01em}
.brandmark{display:grid;place-items:center;width:39px;height:39px;border-radius:13px;border:1px solid #3f7891;background:#112e3f;color:var(--accent);font-size:22px}
.small{color:var(--muted);font-size:.8rem}
.tag{display:inline-flex;align-items:center;gap:7px;font-size:.72rem;letter-spacing:.07em;font-weight:800;color:#ffdd9d;background:#372712;padding:8px 12px;border:1px solid #8a6336;border-radius:100px;text-transform:uppercase}
.shell{max-width:1440px;margin:0 auto;padding:30px 24px 80px}
.hero{display:flex;gap:20px;align-items:flex-end;justify-content:space-between;margin-bottom:20px}
h1,h2,h3,p{margin-top:0}
h1{font-size:clamp(1.9rem,3.1vw,3.1rem);letter-spacing:-.045em;line-height:1.1;margin-bottom:12px}
h2{font-size:1.12rem;letter-spacing:-.015em;margin-bottom:6px}
p{color:var(--muted)}
.hero p{max-width:770px;margin:0;font-size:.92rem}
.kicker{font-size:.75rem;text-transform:uppercase;letter-spacing:.14em;color:var(--accent);font-weight:800;margin-bottom:12px}
.panel{border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(170deg,rgba(15,37,51,.98),rgba(10,26,37,.98));box-shadow:0 18px 50px rgba(0,0,0,.15);min-width:0}
.control{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:18px;margin:24px 0}
.control label{display:block;font-weight:720;font-size:.9rem;margin-bottom:5px}
.help{color:var(--muted);font-size:.79rem}
select{width:100%;max-width:350px;border:1px solid #4c788b;border-radius:11px;padding:12px 14px;background:#091823}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
.metric{padding:18px}
.metric-label{font-size:.79rem;color:#bdd4e0;display:block;margin-bottom:11px}
.metric-value{display:block;font-size:clamp(.94rem,1.5vw,1.35rem);font-weight:800;overflow-wrap:anywhere;min-height:2.8rem;line-height:1.3}
.metric-sub{display:block;font-size:.73rem;color:var(--muted);margin-top:9px}
.strip{margin-bottom:16px;padding:12px 16px;background:#392811;border:1px solid #95652f;border-radius:13px;color:#ffe0a8;font-size:.82rem}
.content{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,1fr);gap:16px;align-items:start}
.column{display:grid;gap:16px;min-width:0}
.section-head{padding:20px 20px 12px;display:flex;justify-content:space-between;align-items:start;gap:14px}
.section-head p{font-size:.78rem;margin:0}
.chat{padding:0 20px 16px}
.chat-log{min-height:255px;max-height:420px;overflow:auto;border-radius:13px;background:#071924;border:1px solid #1e3d4a;padding:14px;display:flex;flex-direction:column;gap:12px;scrollbar-gutter:stable}
.bubble{max-width:92%;border:1px solid #315d70;padding:11px 13px;border-radius:14px;background:#142e3d;white-space:pre-wrap;overflow-wrap:anywhere;font-size:.82rem}
.bubble.user{align-self:flex-end;background:#174053;border-color:#3a7087}
.bubble.system{align-self:flex-start}
.bubble small{display:block;font-size:.68rem;letter-spacing:.02em;color:#c9dfea;margin-bottom:6px;font-weight:740}
.placeholder{color:#bed6e0;font-size:.85rem}
.commands{display:flex;gap:7px;flex-wrap:wrap;padding:13px 0 9px}
.chip{border:1px solid #47788a;background:#123246;padding:8px 11px;border-radius:999px;font-size:.76rem;min-height:40px}
.chip:hover{background:#1c455c}
.command-input{display:flex;align-items:end;gap:8px}
.command-input label{flex:1;display:block;font-size:.78rem;color:#cae0eb}
.command-input select{display:block;max-width:none;margin-top:6px}
.primary{background:#79dbef;border:1px solid #79dbef;color:#07171d;border-radius:10px;padding:13px 17px;font-weight:800;min-height:46px}
.primary:hover{background:#9aebf8}
.ghost{background:transparent;color:#d1edf6;border:1px solid #456678;border-radius:10px;padding:8px 11px;min-height:38px;font-size:.75rem}
.timeline{list-style:none;padding:0 18px 16px;margin:0;display:grid;gap:11px}
.timeline li{padding:11px 13px 11px 16px;border-radius:11px;border:1px solid #294c5e;background:#0a202d;border-left:3px solid #71c5dc}
.timeline li.warning{border-left-color:#ffcf85}
.timeline li.danger{border-left-color:#ff9eae}
.timeline li.blocked{border-left-color:#baa9e5}
.timeline strong{font-size:.85rem;display:block}
.timeline span{color:#c7dce5;font-size:.74rem}
.timeline small{color:#adc8d4;font-size:.69rem;display:block;margin-bottom:4px}
.diagnostics{padding:0 18px 18px;display:grid;gap:8px}
.diagnostic{border:1px solid #2b5062;border-radius:10px;padding:12px;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;row-gap:3px}
.diagnostic strong{font-size:.81rem}
.diagnostic .diagnostic-detail{font-size:.73rem;color:#b5ced8;grid-column:1/-1}
.diagnostic .diagnostic-status{font-weight:850;color:#ffcf85;font-size:.69rem;letter-spacing:.02em}
.footer{margin-top:18px;font-size:.74rem;color:#b8ced9;text-align:center}
.sr-only{position:absolute!important;height:1px;width:1px;overflow:hidden;clip:rect(1px,1px,1px,1px);white-space:nowrap}
@media(max-width:1080px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.content{grid-template-columns:minmax(0,1fr) minmax(270px,.9fr)}}
@media(max-width:750px){.bar{padding:12px 16px}.shell{padding:22px 14px 70px}.hero{display:block}.content{grid-template-columns:1fr}.control{grid-template-columns:1fr}.control select{max-width:none}.section-head{padding:17px 16px 12px}.chat{padding:0 14px 14px}.tag{font-size:.65rem}.metric{padding:15px}}
@media(max-width:420px){.cards{grid-template-columns:1fr 1fr;gap:9px}.metric-value{font-size:.95rem}.brand small{display:none}.command-input{flex-direction:column;align-items:stretch}.primary{width:100%}.tag{padding:6px 9px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
</style>
</head>
<body>
<a class="skip" href="#main">Skip to Command Center</a>
<div class="chrome"><div class="bar">
<div class="brand"><span class="brandmark" aria-hidden="true">≈</span><span>FloodGuard <small> / Local Command Center</small></span></div>
<span class="tag">SIMULATION ONLY · NO LIVE DATA</span>
</div></div>
<main class="shell" id="main" tabindex="-1">
<div class="hero"><div><div class="kicker">Local preview · Stage 1</div>
<h1>Offline FloodGuard Preview</h1>
<p>Explore a simulated flood-monitoring workspace and command conversations without linking a WhatsApp account. No Firebase data, physical hardware, alert delivery or gate action is involved.</p></div></div>
<div class="panel control">
<div><label for="scenario">Simulation scenario</label><div class="help">These are fixed fictional readings. Switching scenarios never changes a real sensor.</div></div>
<select id="scenario"><option value="offline">Offline — no sensor readings</option><option value="safe">SAFE — synthetic</option><option value="warning">WARNING — synthetic</option><option value="danger">DANGER — synthetic</option></select>
</div>
<div class="strip" role="note"><strong>Training interface only.</strong> No gate countdown, servo movement or real alert occurs. No WhatsApp messages are sent.</div>
<section class="cards" aria-label="Synthetic sensor cards" id="sensorCards"></section>
<div class="content">
<div class="column">
<section class="panel" aria-labelledby="chatTitle">
 <div class="section-head"><div><h2 id="chatTitle">Simulated WhatsApp chat</h2><p>Local browser conversation · never delivered</p></div><button id="clearChat" type="button" class="ghost">Clear preview</button></div>
 <div class="chat">
   <div id="chatLog" class="chat-log" role="log" aria-label="Synthetic command conversation" aria-live="polite" aria-relevant="additions text"><p class="placeholder">Choose a command to preview a synthetic reply.</p></div>
   <div class="commands" aria-label="Quick preview commands">
     <button class="chip" type="button" data-command="stats">stats</button><button class="chip" type="button" data-command="water">water</button><button class="chip" type="button" data-command="risk">risk</button><button class="chip" type="button" data-command="gate">gate</button><button class="chip" type="button" data-command="emergency">emergency</button>
   </div>
   <div class="command-input">
    <label for="command">Select a read-only example command<select id="command">
      <option value="stats">stats — system summary</option><option value="menu">menu — command list</option><option value="water">water — water level</option><option value="risk">risk — flood risk</option><option value="gate">gate — gate indication</option><option value="rain">rain — no fabricated rainfall</option><option value="devices">devices — hardware</option><option value="network">network — connectivity</option><option value="emergency">emergency — alarm example</option>
    </select></label>
    <button id="previewCommand" class="primary" type="button">Preview reply</button>
   </div>
   <p class="help" style="margin:10px 0 0">SIMULATED CHAT ONLY · subscribe, unsubscribe and physical-control commands are disabled.</p>
 </div>
</section>
<section class="panel" aria-labelledby="alertsTitle">
 <div class="section-head"><div><h2 id="alertsTitle">Simulated alert history</h2><p>Example event timeline · nothing recorded or sent</p></div></div>
 <ol id="alertHistory" class="timeline" aria-label="Synthetic alert history"></ol>
</section>
</div>
<div class="column">
<section class="panel" aria-labelledby="diagTitle">
 <div class="section-head"><div><h2 id="diagTitle">Offline diagnostics</h2><p>Safe simulation checks, not live device health</p></div></div>
 <div id="diagnostics" class="diagnostics"></div>
</section>
<section class="panel" aria-labelledby="guideTitle">
 <div class="section-head"><div><h2 id="guideTitle">Local hosting</h2><p>Ready for PC demo · EC2 optional later</p></div></div>
 <div class="diagnostics">
  <div class="diagnostic"><strong>Session</strong><span class="diagnostic-status">NOT LINKED</span><span class="diagnostic-detail">WhatsApp login is intentionally disabled.</span></div>
  <div class="diagnostic"><strong>Demo server</strong><span class="diagnostic-status">LOCAL ONLY</span><span class="diagnostic-detail">Protected by private admin credentials and bound to 127.0.0.1.</span></div>
  <div class="diagnostic"><strong>Installed hardware</strong><span class="diagnostic-status">UNCHANGED</span><span class="diagnostic-detail">Arduino and ESP8266 firmware stays exactly as flashed.</span></div>
  <p class="help">To exit, press Ctrl+C in the terminal. Start a real WhatsApp process only when you choose to pair an authorized account.</p>
 </div>
</section>
</div>
</div>
<p id="scenarioNarration" class="sr-only" role="status" aria-live="polite"></p>
<footer class="footer">FloodGuard Offline Command Center · Every visual, message and event on this page is fictional test data.</footer>
</main>
<script>
(()=>{
  'use strict';
  const $ = id => document.getElementById(id);
  const allowed=['menu','stats','water','risk','gate','rain','devices','network','emergency'];
  let scenarioRevision=0;
  let commandRevision=0;
  const scenario=$('scenario');
  const log=$('chatLog');

  function el(tag,className,text){
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function clearChildren(node){node.replaceChildren();}
  function appendBubble(kind,title,body){
    const bubble=el('div','bubble '+kind);
    bubble.append(el('small','',title),el('div','',body));
    if(log.querySelector('.placeholder'))clearChildren(log);
    log.append(bubble);
    while(log.children.length>14)log.removeChild(log.firstElementChild);
    log.scrollTop=log.scrollHeight;
  }
  function renderCards(data){
    const root=$('sensorCards');clearChildren(root);
    for(const item of data.cards){
      const card=el('article','panel metric');
      card.append(el('span','metric-label',item.label),el('strong','metric-value',item.value),el('small','metric-sub',item.detail));
      root.append(card);
    }
  }
  function renderAlerts(data){
    const root=$('alertHistory');clearChildren(root);
    for(const item of data.alerts){
      const row=el('li',item.kind);
      row.append(el('small','',item.when+' · SYNTHETIC'),el('strong','',item.title),el('span','',item.detail));
      root.append(row);
    }
  }
  function renderDiagnostics(data){
    const root=$('diagnostics');clearChildren(root);
    for(const item of data.diagnostics){
      const row=el('div','diagnostic');
      row.append(el('strong','',item.name),el('span','diagnostic-status',item.status),el('span','diagnostic-detail',item.detail));
      root.append(row);
    }
  }
  async function loadScenario(){
    const version=++scenarioRevision;
    const chosen=scenario.value;
    commandRevision++;
    $('scenarioNarration').textContent='Loading synthetic scenario. No remote sensor connection.';
    try {
      const res=await fetch('/demo/state?scenario='+encodeURIComponent(chosen),{cache:'no-store'});
      if(!res.ok)throw Error('Offline state unavailable');
      const data=await res.json();
      if(version!==scenarioRevision)return;
      if(data.demoMode!==true||data.deliveryEnabled!==false||data.hardwareControlEnabled!==false||data.scenario!==chosen)throw Error('Untrusted simulation data');
      renderCards(data);renderAlerts(data);renderDiagnostics(data);
      clearChildren(log);
      log.append(el('p','placeholder','Scenario: '+chosen.toUpperCase()+'. Choose a command to preview a simulated reply.'));
      $('scenarioNarration').textContent='Synthetic scenario '+chosen+' loaded. '+data.note;
    } catch {
      if(version!==scenarioRevision)return;
      clearChildren($('sensorCards'));clearChildren($('alertHistory'));clearChildren($('diagnostics'));
      clearChildren(log);
      log.append(el('p','placeholder','Offline preview unavailable. No commands were sent.'));
      $('scenarioNarration').textContent='Preview unavailable; no real data was used.';
    }
  }
  async function previewCommand(){
    const command=$('command').value;
    const chosen=scenario.value;
    if(!allowed.includes(command))return;
    const version=++commandRevision;
    $('previewCommand').disabled=true;
    try {
      const res=await fetch('/demo/preview?command='+encodeURIComponent(command)+'&scenario='+encodeURIComponent(chosen),{cache:'no-store'});
      if(!res.ok)throw Error('Preview not available');
      const data=await res.json();
      if(version!==commandRevision||chosen!==scenario.value)return;
      if(data.demoMode!==true||data.delivered!==false||typeof data.reply!=='string')throw Error('Invalid preview');
      appendBubble('user','Local example · not sent',command);
      appendBubble('system','FloodGuard · synthetic reply',data.reply);
    } catch {
      if(version===commandRevision)appendBubble('system','Offline preview','SIMULATION ONLY · Example unavailable. No message was sent.');
    } finally {
      if(version===commandRevision)$('previewCommand').disabled=false;
    }
  }
  scenario.addEventListener('change',loadScenario);
  $('previewCommand').addEventListener('click',previewCommand);
  $('command').addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();previewCommand();}
  });
  for(const quick of document.querySelectorAll('[data-command]')){
    quick.addEventListener('click',()=>{$('command').value=quick.dataset.command;previewCommand();});
  }
  $('clearChat').addEventListener('click',()=>{
    commandRevision++;$('previewCommand').disabled=false;clearChildren(log);
    log.append(el('p','placeholder','Chat preview cleared locally. Nothing was sent.'));
  });
  loadScenario();
})();
</script>
</body></html>`;
}
module.exports={renderCommandCenter};
