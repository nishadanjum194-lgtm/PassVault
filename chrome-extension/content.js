// Offer to save submitted login credentials to the local PassVault app.
(function () {
  const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
  const KEY = (location.hostname || 'page').toLowerCase();

  function getCredentials(form) {
    const inputs = Array.from(form.querySelectorAll('input'));
    const password = inputs.find(input => input.type === 'password' && input.value);
    if (!password) return null;
    const username = inputs.find(input =>
      input !== password &&
      (input.type === 'text' || input.type === 'email' || /user|email|login/i.test(input.name + input.id)) &&
      input.value
    );
    return username ? { username: username.value, password: password.value } : null;
  }

  function toast(message) {
    const element = document.createElement('div');
    element.textContent = message;
    Object.assign(element.style, {
      position: 'fixed', top: '12px', right: '12px', zIndex: 2147483647,
      background: '#222', color: '#fff', padding: '8px 12px',
      borderRadius: '6px', fontSize: '13px'
    });
    document.body.appendChild(element);
    setTimeout(() => element.remove(), 2500);
  }

  async function save(username, password) {
    try {
      const { token = '' } = await extensionApi.storage.local.get('token');
      if (!token) { toast('PassVault: open the app and copy its API token into the extension settings.'); return; }

      let existing = false;
      try {
        const check = await fetch('http://127.0.0.1:47823/?site=' + encodeURIComponent(KEY), {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (check.ok) {
          const entries = await check.json();
          existing = entries.some(entry => entry.username === username);
        }
      } catch { /* The desktop app may be closed. */ }

      const prompt = existing
        ? 'Update the saved password for ' + username + ' on ' + KEY + '?'
        : 'Save this login for ' + username + ' on ' + KEY + ' to PassVault?';
      if (!confirm(prompt)) return;

      const response = await fetch('http://127.0.0.1:47823/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ site: KEY, username, password }),
        keepalive: true
      });
      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        toast('PassVault: ' + (result.updated ? 'updated ' : 'saved ') + KEY);
      } else {
        toast('PassVault: save failed (' + response.status + ')');
      }
    } catch (error) {
      toast('PassVault: ' + error.message);
    }
  }

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form || typeof form.querySelectorAll !== 'function') return;
    const credentials = getCredentials(form);
    if (credentials) void save(credentials.username, credentials.password);
  }, true);
})();
