/* Closer website chat widget. Embed:
   <script src="https://YOUR_APP_URL/widget.js" data-closer-id="PUBLIC_WIDGET_ID"></script> */
(function () {
  var s = document.currentScript;
  var id = s && s.getAttribute("data-closer-id");
  if (!id || document.getElementById("closer-widget")) return;
  var api = new URL(s.src).origin + "/api/widget/message";

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
  }
  var key = "closer_sid_" + id, sid;
  try {
    sid = localStorage.getItem(key);
    if (!sid) { sid = uuid(); localStorage.setItem(key, sid); }
  } catch (e) { sid = uuid(); }

  var host = document.createElement("div");
  host.id = "closer-widget";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>:host{all:initial}*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}' +
    ".fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:#0A0A0A;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2);display:grid;place-items:center;z-index:2147483646}" +
    ".panel{position:fixed;right:20px;bottom:88px;width:370px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 110px);background:#fff;color:#0A0A0A;border:1px solid #E5E7EB;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.16);display:flex;flex-direction:column;overflow:hidden;z-index:2147483647}" +
    ".panel[hidden]{display:none}.hd{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid #E5E7EB;font-weight:600;font-size:14px}" +
    ".hd small{display:block;font-weight:400;color:#6B7280;font-size:12px}.x{border:0;background:none;font-size:22px;cursor:pointer;color:#6B7280;line-height:1}" +
    ".log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".m{max-width:84%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}" +
    ".u{align-self:flex-end;background:#0A0A0A;color:#fff}.b{align-self:flex-start;background:#F5F5F5;border:1px solid #E5E7EB}.n{align-self:center;color:#6B7280;font-size:12px;text-align:center}" +
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid #E5E7EB}input{flex:1;min-width:0;height:40px;padding:0 12px;border:1px solid #E5E7EB;border-radius:8px;font-size:16px}" +
    ".send{height:40px;padding:0 14px;border:0;border-radius:8px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer}" +
    "button:focus-visible,input:focus-visible{outline:2px solid #2563EB;outline-offset:2px}button:disabled{opacity:.5;cursor:default}" +
    "@media(max-width:480px){.panel{right:8px;bottom:84px}.fab{right:12px;bottom:12px}}</style>" +
    '<button class="fab" type="button" aria-label="Open chat" aria-expanded="false"><svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true"><path d="M22 7.5A9.5 9.5 0 1 0 22 20.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><circle cx="21" cy="14" r="2.6" fill="#2563EB"/></svg></button>' +
    '<section class="panel" role="dialog" aria-label="Chat with Closer" hidden>' +
    '<div class="hd"><div>Closer<small>Replies instantly</small></div><button class="x" type="button" aria-label="Close chat">&times;</button></div>' +
    '<div class="log" role="log" aria-live="polite"></div>' +
    '<form><input type="text" maxlength="2000" placeholder="Type your message" aria-label="Your message" autocomplete="off"><button class="send" type="submit">Send</button></form></section>';

  var fab = root.querySelector(".fab"), panel = root.querySelector(".panel"), log = root.querySelector(".log");
  var form = root.querySelector("form"), input = root.querySelector("input"), sendBtn = root.querySelector(".send");
  var greeted = false, pending = false;

  function add(cls, text) {
    var d = document.createElement("div");
    d.className = cls;
    d.textContent = text; // textContent only: replies are never parsed as HTML
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function toggle(open) {
    panel.hidden = !open;
    fab.setAttribute("aria-expanded", String(open));
    if (open) {
      if (!greeted) { greeted = true; add("m b", "Hi, I'm Closer. What are you looking for?"); }
      input.focus();
    } else fab.focus();
  }
  function send(text) {
    pending = true; sendBtn.disabled = true;
    add("m u", text);
    var typing = add("n", "Closer is typing…");
    fetch(api, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widget_id: id, session_id: sid, message: text }),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
      .then(function (o) {
        typing.remove();
        if (o.status === 429) add("n", "You're sending messages quickly. Please wait a moment.");
        else if (o.status >= 400) add("n", "Something went wrong. Please try again.");
        else if (o.d.paused) add("n", "An agent will reply here shortly.");
        else add("m b", o.d.reply);
      })
      .catch(function () { typing.remove(); add("n", "Something went wrong. Please try again."); })
      .then(function () { pending = false; sendBtn.disabled = false; input.focus(); });
  }

  fab.addEventListener("click", function () { toggle(panel.hidden); });
  root.querySelector(".x").addEventListener("click", function () { toggle(false); });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") toggle(false); });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || pending) return;
    input.value = "";
    send(text);
  });
  document.body.appendChild(host);
})();
