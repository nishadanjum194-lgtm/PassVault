const $ = selector => document.querySelector(selector);
const status = $('#status');
const auth = $('#auth');
const main = $('#main');
const list = $('#list');

async function renderAuth() {
  try {
    const exists = await window.pv.exists();
    if (exists) {
      auth.innerHTML = '<div class="glass card authbox"><div class="tag">Encrypted Vault</div><h2>Unlock</h2><p>Enter your master password.</p><div class="row"><input type="password" id="mp" placeholder="Master password" autocomplete="current-password"><button id="unlock">Unlock</button></div></div>';
      $('#unlock').onclick = async () => {
        try {
          await window.pv.unlock($('#mp').value);
          $('#mp').value = '';
          status.textContent = 'unlocked';
          await showMain();
        } catch (error) { alert(error.message); }
      };
    } else {
      auth.innerHTML = '<div class="glass card authbox"><div class="tag">New Vault</div><h2>Create Vault</h2><p>Choose a strong master password (at least 12 characters). It is never stored.</p><div class="row"><input type="password" id="mp" placeholder="Master password" autocomplete="new-password"><button id="create">Create</button></div></div>';
      $('#create').onclick = async () => {
        try {
          await window.pv.create($('#mp').value);
          $('#mp').value = '';
          status.textContent = 'vault created';
          await showMain();
        } catch (error) { alert(error.message); }
      };
    }
  } catch (error) {
    status.textContent = 'Vault error: ' + error.message;
  }
}

async function showMain() {
  auth.style.display = 'none';
  main.style.display = 'block';
  await refresh();
}

async function refresh() {
  const query = ($('#search')?.value || '').toLowerCase();
  const entries = await window.pv.list();
  const filtered = query
    ? entries.filter(entry => (entry.site || '').toLowerCase().includes(query) ||
      (entry.username || '').toLowerCase().includes(query))
    : entries;

  list.replaceChildren();
  for (const entry of filtered) {
    const row = document.createElement('div');
    row.className = 'entry';

    const meta = document.createElement('div');
    meta.className = 'meta';
    const site = document.createElement('div');
    site.className = 'site';
    site.textContent = entry.site;
    const username = document.createElement('div');
    username.className = 'user';
    username.textContent = entry.username;
    meta.append(site, username);

    const actions = document.createElement('div');
    actions.className = 'row';
    const password = document.createElement('span');
    password.className = 'pw';
    password.textContent = '••••••';

    const showButton = document.createElement('button');
    showButton.className = 'show ghost';
    showButton.textContent = 'Show';
    let visible = false;
    showButton.addEventListener('click', async () => {
      if (visible) {
        password.textContent = '••••••';
        showButton.textContent = 'Show';
        visible = false;
        return;
      }
      try {
        const secret = await window.pv.get(entry.id);
        password.textContent = secret.password;
        showButton.textContent = 'Hide';
        visible = true;
      } catch (error) {
        status.textContent = 'Could not reveal password: ' + error.message;
      }
    });

    const deleteButton = document.createElement('button');
    deleteButton.className = 'del danger';
    deleteButton.textContent = 'Del';
    deleteButton.addEventListener('click', async () => {
      if (!confirm('Delete the saved password for ' + entry.site + '?')) return;
      try {
        await window.pv.del(entry.id);
        await refresh();
      } catch (error) { status.textContent = 'Could not delete entry: ' + error.message; }
    });

    actions.append(password, showButton, deleteButton);
    row.append(meta, actions);
    list.appendChild(row);
  }
}

document.addEventListener('input', event => {
  if (event.target?.id === 'search') refresh().catch(error => { status.textContent = error.message; });
});

$('#gen').onclick = async () => {
  try { $('#pass').value = await window.pv.gen({ len: 20 }); }
  catch (error) { status.textContent = 'Could not generate password: ' + error.message; }
};

$('#showToken').onclick = async () => {
  try {
    const token = await window.pv.token();
    await navigator.clipboard.writeText(token);
    status.textContent = 'API token copied to clipboard.';
  } catch (error) { status.textContent = 'Could not copy API token: ' + error.message; }
};

$('#add').onclick = async () => {
  const entry = { site: $('#site').value.trim(), username: $('#user').value.trim(), password: $('#pass').value };
  if (!entry.site || !entry.username || !entry.password) {
    status.textContent = 'Enter a site, username and password.';
    return;
  }
  try {
    await window.pv.add(entry);
    $('#site').value = '';
    $('#user').value = '';
    $('#pass').value = '';
    status.textContent = 'Entry saved.';
    await refresh();
  } catch (error) { status.textContent = 'Could not save entry: ' + error.message; }
};

renderAuth();
