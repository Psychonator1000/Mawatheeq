// Opens the app at once with the screen it showed last time, before the app itself has loaded (lib/instant.ts saves it
// and takes it away as soon as the live page is ready). Shown only for the same signed-in session on this browser and
// the same page address; anything unexpected and the app simply opens as before.
(function () {
  try {
    var KEY = 'mawatheeq.instant.v1', SESSION = 'mawatheeq.local-session.v1';
    var token = localStorage.getItem(SESSION), raw = localStorage.getItem(KEY);
    if (!token || !raw) return;
    var h = 2166136261;
    for (var i = 0; i < token.length; i++) h = Math.imul(h ^ token.charCodeAt(i), 16777619);
    var snap = JSON.parse(raw);
    if (!snap || snap.v !== 1 || snap.tag !== (h >>> 0).toString(36) || snap.hash !== location.hash || typeof snap.html !== 'string') return;
    if (Date.now() - snap.at > 14 * 864e5) return;
    // A screen kept by another version of the app (its stylesheet has another name) is not shown.
    var first = document.querySelector('link[rel=stylesheet]'), build = first ? first.getAttribute('href') || '' : '';
    if (snap.build !== build) return;
    var root = document.documentElement;
    for (var k in snap.attrs) if (Object.prototype.hasOwnProperty.call(snap.attrs, k)) root.setAttribute(k, snap.attrs[k]);
    (snap.styles || []).forEach(function (css) { var s = document.createElement('style'); s.setAttribute('data-instant-style', ''); s.textContent = css; document.head.appendChild(s); });
    var layer = document.createElement('div');
    layer.id = 'instant-screen'; layer.setAttribute('aria-hidden', 'true'); layer.setAttribute('inert', '');
    layer.innerHTML = snap.html;
    document.body.appendChild(layer);
  } catch (e) { /* The app opens as before. */ }
})();
