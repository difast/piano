/* Диагностика страницы админ-кабинета: без React. Пишет в лог бэкенда строки [admin_debug] — что загрузилось и что видно на экране. */
(function () {
  var api = ((window.__APP_CONFIG__ && window.__APP_CONFIG__.apiUrl) || '').replace(/\/$/, '');
  var t0 = Date.now();
  function send(step, extra) {
    try {
      var root = document.getElementById('root');
      var body = document.body;
      var props = {
        step: step, ms: Date.now() - t0, path: location.pathname, page: document.documentElement.getAttribute('data-page') || '',
        rootHtml: root ? root.innerHTML.length : -1, rootKids: root ? root.children.length : -1,
        text: body ? String(body.innerText || '').replace(/\s+/g, ' ').slice(0, 160) : '',
        bg: body ? getComputedStyle(body).backgroundColor : '', vw: innerWidth, vh: innerHeight,
        sheets: document.styleSheets.length, scripts: Array.prototype.map.call(document.scripts, function (s) { return (s.src || 'inline').replace(location.origin, ''); }).join(' '),
        ua: navigator.userAgent.slice(0, 160),
      };
      for (var k in extra || {}) props[k] = extra[k];
      fetch(api + '/api/events', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'admin_debug', props: props }) }).catch(function () {});
    } catch (e) { /* диагностика не должна ломать страницу */ }
  }
  window.__adminDebug = send;
  window.addEventListener('error', function (e) { send('error', { message: String(e.message || (e.target && (e.target.src || e.target.href)) || '').slice(0, 300) }); }, true);
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; send('rejection', { message: String(r && (r.message || r)).slice(0, 300) }); });
  send('html');
  [1000, 3000, 8000].forEach(function (d) { setTimeout(function () { send('after ' + d / 1000 + 's'); }, d); });
})();
