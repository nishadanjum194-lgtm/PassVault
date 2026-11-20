const $ = (selector) => document.querySelector(selector);
(async () => {
  const { token = '' } = await chrome.storage.local.get('token');
  $('#token').value = token;
})();
$('#save').addEventListener('click', async () => {
  const token = $('#token').value.trim();
  await chrome.storage.local.set({ token });
  const host = location.hostname.toLowerCase();
  const url = 'http://127.0.0.1:47823/?site=' + encodeURIComponent(host);
  const result = $('#res');
  result.replaceChildren();
  try {
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('Request failed (' + response.status + ')');
    const entries = await response.json();
    if (!entries.length) {
      result.textContent = 'No matching credentials.';
      return;
    }
    for (const entry of entries) {
      const item = document.createElement('div');
      const heading = document.createElement('b');
      heading.textContent = entry.site;
      const username = document.createElement('span');
      username.textContent = ' ' + entry.username;
      const password = document.createElement('code');
      password.textContent = entry.password;
      item.append(heading, username, document.createElement('br'), password);
      result.append(item);
    }
  } catch (error) {
    result.textContent = error.message;
  }
});
