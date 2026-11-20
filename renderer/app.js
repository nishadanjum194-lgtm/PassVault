const $ = (selector) => document.querySelector(selector);
const status = $('#status');
const auth = $('#auth');
const main = $('#main');
const list = $('#list');

async function renderAuth() {
  const exists = await window.pv.exists();
  auth.style.display = 'block';
  main.style.display = 'none';
  auth.replaceChildren();
  const card = document.createElement('div');
  card.className = 'glass card authbox';
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = exists ? 'Encrypted Vault' : 'New Vault';
  const heading = document.createElement('h2');
  heading.textContent = exists ? 'Unlock' : 'Create Vault';
  const description = document.createElement('p');
  description.textContent = exists ? 'Enter your master password.' : 'Choose a master password with at least 12 characters.';
  const row = document.createElement('div');
  row.className = 'row';
  const input = document.createElement('input');
  input.type = 'password';
  input.id = 'mp';
  input.autocomplete = exists ? 'current-password' : 'new-password';
  input.placeholder = 'Master password';
  const button = document.createElement('button');
  button.textContent = exists ? 'Unlock' : 'Create';
  button.addEventListener('click', async () => {
    try {
      if (exists) await window.pv.unlock(input.value);
      else await window.pv.create(input.value);
      status.textContent = 'unlocked';
      await showMain();
    } catch (error) {
      alert(error.message);
    }
  });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') button.click(); });
  row.append(input, button);
  card.append(tag, heading, description, row);
  auth.append(card);
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
    ? entries.filter((entry) => (entry.site || '').toLowerCase().includes(query) || (entry.username || '').toLowerCase().includes(query))
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
    const show = document.createElement('button');
    show.className = 'show ghost';
    show.textContent = 'Show';
    show.addEventListener('click', async () => {
      try {
        const fullEntry = await window.pv.get(entry.id);
        password.textContent = password.textContent === '••••••' ? fullEntry.password : '••••••';
      } catch (error) { alert(error.message); }
    });
    const remove = document.createElement('button');
    remove.className = 'del danger';
    remove.textContent = 'Del';
    remove.addEventListener('click', async () => {
      try { await window.pv.del(entry.id); await refresh(); }
      catch (error) { alert(error.message); }
    });
    actions.append(password, show, remove);
    row.append(meta, actions);
    list.append(row);
  }
}
document.addEventListener('input', (event) => {
  if (event.target && event.target.id === 'search') refresh().catch((error) => alert(error.message));
});
$('#gen').addEventListener('click', async () => {
  $('#pass').value = await window.pv.gen({ len: 20 });
});
$('#showToken').addEventListener('click', async () => {
  try {
    const token = await window.pv.token();
    await navigator.clipboard.writeText(token);
    alert('API token copied to clipboard. Treat it like a password.');
  } catch (error) { alert(error.message); }
});
$('#add').addEventListener('click', async () => {
  try {
    await window.pv.add({ site: $('#site').value, username: $('#user').value, password: $('#pass').value });
    $('#site').value = '';
    $('#user').value = '';
    $('#pass').value = '';
    await refresh();
  } catch (error) { alert(error.message); }
});
window.pv.onLocked(() => {
  status.textContent = 'locked';
  renderAuth().catch((error) => { status.textContent = error.message; });
});
renderAuth().catch((error) => { status.textContent = error.message; });
