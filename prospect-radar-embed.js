/**
 * ProspectRadar — Embeddable Widget Snippet
 * ==========================================
 * Drop ONE <script> tag on any website.
 *
 * MINIMUM SETUP:
 *   <script
 *     src="https://your-cdn.com/prospect-radar-embed.js"
 *     data-widget-url="https://your-host.com/prospect-radar-v3.html"
 *     data-proxy="https://your-proxy.com"
 *     data-exa-key="exa-key-..."
 *   ></script>
 *
 * ALL OPTIONS:
 *   data-widget-url   URL of your hosted prospect-radar-v3.html (required)
 *   data-proxy        Backend proxy URL (recommended for production)
 *   data-exa-key      Exa.ai API key (can set server-side via proxy)
 *   data-anthropic-key  Anthropic API key (dev only — use proxy in prod)
 *   data-position     "bottom-right" | "bottom-left" | "inline:#selector"
 *   data-label        Button label (default: "Find Prospects")
 *   data-icon         Button icon (default: "⬡")
 *   data-accent       Hex accent colour (default: "#818cf8")
 *   data-width        Panel width px (default: 1100)
 *   data-height       Panel height px (default: 680)
 *   data-z-index      Z-index (default: 9999)
 *   data-theme        "dark" | "light" (default: "dark")
 *
 * PROGRAMMATIC API (after load):
 *   ProspectRadar.open()
 *   ProspectRadar.close()
 *   ProspectRadar.toggle()
 *   ProspectRadar.version  // "3.0.0"
 */
(function () {
  'use strict';

  const script = document.currentScript ||
    [...document.querySelectorAll('script')].find(s => s.src && s.src.includes('prospect-radar-embed'));

  const C = {
    widgetUrl:    script?.dataset?.widgetUrl     || window.PROSPECT_RADAR_WIDGET_URL || '',
    proxy:        script?.dataset?.proxy         || window.PROXY_URL || '',
    exaKey:       script?.dataset?.exaKey        || window.PR_EXA_KEY || '',
    anthropicKey: script?.dataset?.anthropicKey  || window.PR_ANTHROPIC_KEY || '',
    position:     script?.dataset?.position      || 'bottom-right',
    label:        script?.dataset?.label         || 'Find Prospects',
    icon:         script?.dataset?.icon          || '⬡',
    accent:       script?.dataset?.accent        || '#818cf8',
    width:        parseInt(script?.dataset?.width  || '1100'),
    height:       parseInt(script?.dataset?.height || '680'),
    zIndex:       parseInt(script?.dataset?.zIndex || '9999'),
    theme:        script?.dataset?.theme         || 'dark',
  };

  if (!C.widgetUrl) {
    console.error('[ProspectRadar] data-widget-url is required. See DEPLOYMENT.md');
    return;
  }

  /* ── CSS ── */
  const css = `
.pr-fab{
  position:fixed;cursor:pointer;z-index:${C.zIndex};
  display:flex;align-items:center;gap:8px;
  padding:12px 22px;background:${C.accent};color:#000;
  font-weight:700;font-size:14px;border:none;border-radius:50px;
  box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 0 0 ${C.accent}40;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  transition:all .2s;letter-spacing:.3px;white-space:nowrap;outline:none;
  animation:pr-glow 3s ease-in-out infinite;
}
@keyframes pr-glow{0%,100%{box-shadow:0 4px 20px rgba(0,0,0,.35),0 0 0 0 ${C.accent}40}50%{box-shadow:0 4px 24px rgba(0,0,0,.4),0 0 0 8px ${C.accent}00}}
.pr-fab:hover{transform:translateY(-2px);filter:brightness(1.1)}
.pr-fab:active{transform:translateY(0)}
.pr-fab-icon{font-size:16px}
.pr-fab.pr-open .pr-fab-icon{animation:pr-spin .7s linear infinite}
@keyframes pr-spin{to{transform:rotate(360deg)}}
.pr-panel{
  position:fixed;z-index:${C.zIndex + 1};
  background:#07070f;border-radius:20px;
  border:1px solid rgba(129,140,248,.25);
  box-shadow:0 24px 64px rgba(0,0,0,.65),0 0 0 1px rgba(129,140,248,.07);
  overflow:hidden;
  opacity:0;pointer-events:none;
  transform:scale(.94) translateY(14px);
  transition:opacity .22s ease,transform .25s cubic-bezier(.34,1.56,.64,1);
  width:min(${C.width}px,95vw);height:min(${C.height}px,90vh);
  resize:both;
}
.pr-panel.pr-open{opacity:1;pointer-events:all;transform:scale(1) translateY(0)}
.pr-panel-br{bottom:88px;right:24px;transform-origin:bottom right}
.pr-panel-bl{bottom:88px;left:24px;transform-origin:bottom left}
.pr-fab-br{bottom:22px;right:24px}
.pr-fab-bl{bottom:22px;left:24px}
.pr-topbar{
  height:26px;background:rgba(13,13,28,.97);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 12px;cursor:move;border-bottom:1px solid rgba(129,140,248,.1);
  user-select:none;flex-shrink:0;
}
.pr-dots{display:flex;gap:5px}
.pr-dot{width:9px;height:9px;border-radius:50%}
.pr-close{font-size:11px;color:rgba(255,255,255,.35);cursor:pointer;padding:2px 8px;border-radius:4px;transition:.15s;font-family:monospace}
.pr-close:hover{color:#fff;background:rgba(251,113,133,.2)}
.pr-title{font-size:10px;color:rgba(255,255,255,.25);font-family:monospace;letter-spacing:.5px}
.pr-panel iframe{width:100%;height:calc(100% - 26px);border:none;display:block}
.pr-inline{width:100%;border-radius:16px;overflow:hidden;border:1px solid rgba(129,140,248,.2);box-shadow:0 8px 32px rgba(0,0,0,.4)}
.pr-inline iframe{width:100%;height:${C.height}px;border:none;display:block}
@media(max-width:600px){
  .pr-panel{width:100vw!important;height:100vh!important;top:0!important;left:0!important;right:0!important;bottom:0!important;border-radius:0!important;resize:none!important}
}`;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Build iframe URL ── */
  function buildURL() {
    const u = new URL(C.widgetUrl, location.href);
    return u.toString();
  }

  /* ── Config message to iframe ── */
  function sendConfig(iframeEl) {
    const msg = { type: 'PR_CONFIG', proxy: C.proxy, exaKey: C.exaKey, anthropicKey: C.anthropicKey, theme: C.theme };
    let tries = 0;
    const iv = setInterval(() => {
      try { iframeEl.contentWindow.postMessage(msg, '*'); } catch (e) {}
      if (++tries > 25) clearInterval(iv);
    }, 400);
    window.addEventListener('message', e => { if (e.data?.type === 'PR_READY') clearInterval(iv); });
  }

  /* ── Draggable ── */
  function makeDraggable(panel, handle) {
    let sx, sy, sl, st;
    function down(e) {
      if (e.target.classList.contains('pr-close')) return;
      sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect();
      sl = r.left; st = r.top;
      panel.style.transition = 'none';
      panel.style.left = sl + 'px'; panel.style.top = st + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      e.preventDefault();
    }
    function move(e) {
      panel.style.left = Math.max(0, sl + e.clientX - sx) + 'px';
      panel.style.top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, st + e.clientY - sy)) + 'px';
    }
    function up() {
      panel.style.transition = '';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    }
    handle.addEventListener('mousedown', down);
    handle.addEventListener('touchstart', e => {
      const t = e.touches[0];
      down({ clientX: t.clientX, clientY: t.clientY, target: e.target, preventDefault: () => e.preventDefault() });
    });
  }

  /* ── FAB Mode ── */
  function createFAB() {
    const pos = C.position === 'bottom-left' ? 'bl' : 'br';
    const fab = document.createElement('button');
    fab.className = `pr-fab pr-fab-${pos}`;
    fab.setAttribute('aria-label', 'Open ProspectRadar');
    fab.innerHTML = `<span class="pr-fab-icon">${C.icon}</span><span>${C.label}</span>`;

    let panel = null, isOpen = false;

    function buildPanel() {
      panel = document.createElement('div');
      panel.className = `pr-panel pr-panel-${pos}`;

      const topbar = document.createElement('div');
      topbar.className = 'pr-topbar';
      topbar.innerHTML = `<div class="pr-dots"><div class="pr-dot" style="background:#fb7185"></div><div class="pr-dot" style="background:#fbbf24"></div><div class="pr-dot" style="background:#34d399"></div></div><span class="pr-title">PROSPECTRADAR</span><span class="pr-close">✕ close</span>`;
      panel.appendChild(topbar);

      const iframe = document.createElement('iframe');
      iframe.src = buildURL();
      iframe.title = 'ProspectRadar';
      iframe.allow = 'clipboard-write';
      panel.appendChild(iframe);
      document.body.appendChild(panel);

      topbar.querySelector('.pr-close').addEventListener('click', toggle);
      makeDraggable(panel, topbar);
      iframe.addEventListener('load', () => sendConfig(iframe));
      window.addEventListener('message', e => { if (e.data?.type === 'PR_CLOSE') toggle(); });
    }

    function toggle() {
      isOpen = !isOpen;
      if (isOpen && !panel) buildPanel();
      fab.classList.toggle('pr-open', isOpen);
      if (panel) panel.classList.toggle('pr-open', isOpen);
      fab.querySelector('.pr-fab-icon').textContent = isOpen ? '✕' : C.icon;
      fab.querySelector('span:last-child').textContent = isOpen ? 'Close' : C.label;
    }

    fab.addEventListener('click', toggle);
    document.body.appendChild(fab);

    window.ProspectRadar = {
      version: '3.0.0', config: C,
      open: () => { if (!isOpen) toggle(); },
      close: () => { if (isOpen) toggle(); },
      toggle,
    };
  }

  /* ── Inline Mode ── */
  function createInline(selector) {
    const target = document.querySelector(selector);
    if (!target) { console.error(`[ProspectRadar] inline target not found: ${selector}`); return; }
    const wrap = document.createElement('div');
    wrap.className = 'pr-inline';
    const iframe = document.createElement('iframe');
    iframe.src = buildURL();
    iframe.title = 'ProspectRadar';
    iframe.allow = 'clipboard-write';
    wrap.appendChild(iframe);
    target.appendChild(wrap);
    iframe.addEventListener('load', () => sendConfig(iframe));
    window.ProspectRadar = { version: '3.0.0', config: C, open: ()=>{}, close: ()=>{}, toggle: ()=>{} };
  }

  /* ── Init ── */
  function init() {
    if (C.position.startsWith('inline:')) {
      createInline(C.position.replace('inline:', ''));
    } else {
      createFAB();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  console.log('[ProspectRadar] embed v3.0.0 loaded');
})();
