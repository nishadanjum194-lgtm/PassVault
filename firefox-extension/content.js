// Capture a credential only after an explicit confirmation from the user.
(function () {
  const browserApi = globalThis.browser || globalThis.chrome;
  const host = location.hostname.toLowerCase();

  function getCredentials(form) {
    const inputs = Array.from(form.querySelectorAll('input'));
    const password = inputs.find((input) => input.type === 'password' && input.value);
    if (!password) return null;
    const username = inputs.find((input) =>
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
    document.body.append(element);
    setTimeout(() => element.remove(), 2500);
  }

  async function save(username, password) {
    const { token = '' } = await browserApi.storage.local.get('token');
    if (!token) { toast('PassVault: configure the app token in the extension popup.'); return; }
    if (!window.confirm('Save credentials for ' + host + ' to PassVault?')) return;
    try {
      const response = await fetch('http://127.0.0.1:47823/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ site: host, username, password })
      });
      if (response.ok) toast('PassVault: saved ' + host);
      else toast('PassVault: save failed (' + response.status + ')');
    } catch (error) {
      toast('PassVault: ' + error.message);
    }
  }

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form || !form.querySelectorAll) return;
    const credentials = getCredentials(form);
    if (credentials) save(credentials.username, credentials.password);
  }, true);
})();
