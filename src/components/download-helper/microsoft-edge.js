<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Edge Downloads Guide</title>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
</head>
<body>
<script>
/* ─────────────────────────────────────────────
   createEdgeGuide()
   → Builds the full component, injects scoped
     CSS into <head>, and returns the container
     element. Caller decides where to mount it.
───────────────────────────────────────────── */
function createEdgeGuide() {

  /* ── 1. DATA ── */
  const config = {
    title:    'Change Downloads Folder — Microsoft Edge',
    subtitle: 'edge://settings/downloads',
    steps: [
      `Open Microsoft Edge, then select <strong>Settings and more</strong> <span class="eg-tag">···</span> › <strong>Settings</strong> <span class="eg-tag">⚙</span>`,
      `Select <strong>Downloads</strong> <span class="eg-tag">↓</span>, and then, in the <strong>Location</strong> area, select <strong>Change</strong>`,
      `In the dialog box, select a new location for your downloaded files`,
      `Here you'll also find the option to have Microsoft Edge <strong>ask where to save</strong> each file before downloading`,
    ],
  };

  /* ── 2. SCOPED CSS (injected once) ── */
  if (!document.getElementById('eg-styles')) {
    const style = document.createElement('style');
    style.id = 'eg-styles';
    style.textContent = `
      .eg-wrap {
        font-family: 'Sora', sans-serif;
        background: #111827;
        border: 1px solid #1e2d45;
        border-radius: 20px;
        padding: 40px 44px;
        max-width: 600px;
        width: 100%;
        position: relative;
        overflow: hidden;
        box-shadow: 0 0 0 1px rgba(56,189,248,.06), 0 24px 60px rgba(0,0,0,.5);
        color: #e2e8f0;
      }
      .eg-wrap::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, #38bdf8, #818cf8, transparent);
      }
      .eg-header { display: flex; align-items: center; gap: 14px; margin-bottom: 36px; }
      .eg-icon {
        width: 42px; height: 42px; flex-shrink: 0;
        background: linear-gradient(135deg, #1e3a5f, #1e2d45);
        border: 1px solid #1e2d45; border-radius: 12px;
        display: flex; align-items: center; justify-content: center;
      }
      .eg-icon svg { width: 20px; height: 20px; color: #38bdf8; }
      .eg-title   { font-size: 15px; font-weight: 600; letter-spacing: -.02em; }
      .eg-subtitle{ font-size: 12px; color: #64748b; margin-top: 2px; font-family: 'JetBrains Mono', monospace; }
      .eg-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
      .eg-step {
        display: flex; gap: 18px; align-items: flex-start;
        padding: 16px 18px; border-radius: 12px;
        border: 1px solid transparent; cursor: pointer;
        transition: background .2s, border-color .2s, transform .15s;
        opacity: 0; transform: translateY(12px);
        animation: egFadeUp .4s forwards;
      }
      .eg-step:nth-child(1){animation-delay:.05s}
      .eg-step:nth-child(2){animation-delay:.15s}
      .eg-step:nth-child(3){animation-delay:.25s}
      .eg-step:nth-child(4){animation-delay:.35s}
      @keyframes egFadeUp { to { opacity:1; transform:translateY(0); } }
      .eg-step:hover { background:rgba(56,189,248,.04); border-color:rgba(56,189,248,.12); transform:translateX(3px); }
      .eg-step.done  { background:rgba(34,211,238,.04); border-color:rgba(34,211,238,.15); }
      .eg-step.done .eg-num   { background:#22d3ee; color:#0b0f1a; border-color:#22d3ee; }
      .eg-step.done .eg-text  { color:#64748b; text-decoration:line-through; }
      .eg-step.done .eg-check { color:#22d3ee; }
      .eg-num {
        width:28px; height:28px; flex-shrink:0;
        border-radius:50%; border:1.5px solid #1e2d45; background:#161e2e;
        display:flex; align-items:center; justify-content:center;
        font-size:12px; font-weight:700; color:#38bdf8;
        font-family:'JetBrains Mono',monospace;
        transition: background .2s, color .2s, border-color .2s;
      }
      .eg-text { flex:1; font-size:14px; line-height:1.65; color:#cbd5e1; transition:color .2s; }
      .eg-text strong { color:#e2e8f0; font-weight:600; }
      .eg-tag {
        display:inline-flex; align-items:center;
        background:rgba(56,189,248,.1); border:1px solid rgba(56,189,248,.2);
        border-radius:6px; padding:1px 7px;
        font-size:12px; color:#38bdf8;
        font-family:'JetBrains Mono',monospace; font-weight:500;
      }
      .eg-check { width:16px; height:16px; margin-top:6px; flex-shrink:0; color:#64748b; transition:color .2s; }
      .eg-progress-wrap {
        margin-top:30px; height:4px; border-radius:99px;
        background:#161e2e; border:1px solid #1e2d45; overflow:hidden;
      }
      .eg-progress-bar {
        height:100%; width:0%; border-radius:99px;
        background:linear-gradient(90deg,#38bdf8,#818cf8);
        transition:width .4s ease;
      }
      .eg-progress-label {
        margin-top:10px; font-size:12px; color:#64748b;
        font-family:'JetBrains Mono',monospace;
        display:flex; justify-content:space-between;
      }
      .eg-count { color:#38bdf8; }
      .eg-reset {
        margin-top:24px; width:100%; padding:11px;
        background:transparent; border:1px solid #1e2d45;
        border-radius:10px; color:#64748b;
        font-family:'Sora',sans-serif; font-size:13px;
        cursor:pointer; letter-spacing:.02em;
        transition: border-color .2s, color .2s, background .2s;
      }
      .eg-reset:hover { border-color:rgba(56,189,248,.3); color:#38bdf8; background:rgba(56,189,248,.04); }
    `;
    document.head.appendChild(style);
  }

  /* ── 3. BUILD DOM ── */
  const wrap = document.createElement('div');
  wrap.className = 'eg-wrap';

  // Header
  const header = document.createElement('div');
  header.className = 'eg-header';
  header.innerHTML = `
    <div class="eg-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </div>
    <div>
      <div class="eg-title">${config.title}</div>
      <div class="eg-subtitle">${config.subtitle}</div>
    </div>`;
  wrap.appendChild(header);

  // Steps
  const list = document.createElement('ul');
  list.className = 'eg-list';
  config.steps.forEach((text, i) => {
    const li = document.createElement('li');
    li.className = 'eg-step';
    li.innerHTML = `
      <div class="eg-num">${i + 1}</div>
      <p class="eg-text">${text}</p>
      <svg class="eg-check" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>`;
    li.addEventListener('click', () => { li.classList.toggle('done'); updateProgress(); });
    list.appendChild(li);
  });
  wrap.appendChild(list);

  // Progress
  const progressWrap = document.createElement('div');
  progressWrap.className = 'eg-progress-wrap';
  const bar = document.createElement('div');
  bar.className = 'eg-progress-bar';
  progressWrap.appendChild(bar);
  wrap.appendChild(progressWrap);

  const label = document.createElement('div');
  label.className = 'eg-progress-label';
  label.innerHTML = `<span>Progress</span><span class="eg-count">0 / ${config.steps.length}</span>`;
  wrap.appendChild(label);

  // Reset
  const resetBtn = document.createElement('button');
  resetBtn.className = 'eg-reset';
  resetBtn.textContent = '↺ Reset Progress';
  resetBtn.addEventListener('click', () => {
    list.querySelectorAll('.eg-step').forEach(el => el.classList.remove('done'));
    updateProgress();
  });
  wrap.appendChild(resetBtn);

  /* ── 4. PRIVATE HELPERS ── */
  function updateProgress() {
    const total = config.steps.length;
    const done  = list.querySelectorAll('.eg-step.done').length;
    bar.style.width = (done / total * 100) + '%';
    label.querySelector('.eg-count').textContent = `${done} / ${total}`;
  }

  /* ── 5. RETURN container ── */
  return wrap;
}


/* ══════════════════════════════════════
   USAGE
   const guide = createEdgeGuide();
   document.body.appendChild(guide);
   // or: someDiv.appendChild(guide);
══════════════════════════════════════ */
Object.assign(document.body.style, {
  margin: '0', minHeight: '100vh',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '40px 20px', boxSizing: 'border-box',
  background: '#0b0f1a',
  backgroundImage: `
    radial-gradient(ellipse 60% 40% at 80% 20%, rgba(56,189,248,.07) 0%, transparent 70%),
    radial-gradient(ellipse 40% 30% at 10% 80%, rgba(129,140,248,.06) 0%, transparent 60%)`,
});

const guide = createEdgeGuide();
document.body.appendChild(guide);
</script>
</body>
</html>