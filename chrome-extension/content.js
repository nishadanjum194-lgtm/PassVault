// Auto-capture credentials on form submit and save to PassVault.
(function () {
  const KEY = (location.hostname || 'page').toLowerCase();

  function creds(form) {
    const inputs = [...form.querySelectorAll('input')];
    const pass = inputs.find(i => i.type === 'password' && i.value);
    if (!pass) return null;
    const user = inputs.find(i => i !== pass && (i.type === 'text' || i.type === 'email' || /user|email|login/i.test(i.name + i.id)) && i.value);
    return user ? { username: user.value, password: pass.value } : null;
  }

  function toast(msg) {
    const d = document.createElement('div');
    d.textContent = msg;
    Object.assign(d.style, { position: 'fixed', top: '12px', right: '12px', zIndex: 2147483647, background: '#222', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '13px' });
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }

  async function save(username, password) {
    const { token = '' } = await chrome.storage.local.get('token');
    if (!token) { toast('PassVault: no token set'); return; }
    if (!confirm('Save password for ' + KEY + ' to PassVault?')) return;
    try {
      const r = await fetch('http://127.0.0.1:47823/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ site: KEY, username, password }),
        keepalive: true
      });
      if (r.ok) toast('PassVault: saved ' + KEY);
      else toast('PassVault: save failed (' + r.status + ')');
    } catch (e) { toast('PassVault: ' + e.message); }
  }

  document.addEventListener('submit', e => {
    const form = e.target;
    if (!form || !form.querySelectorAll) return;
    const c = creds(form);
    if (c) save(c.username, c.password);
  }, true);
})();
