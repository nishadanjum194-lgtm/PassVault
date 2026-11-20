const extensionApi = typeof browser !== 'undefined' ? browser : chrome;
const tokenInput = document.getElementById('token');
const result = document.getElementById('res');
const saveButton = document.getElementById('save');

(async () => {
  try {
    const { token = '' } = await extensionApi.storage.local.get('token');
    tokenInput.value = token;
  } catch (error) {
    result.textContent = 'Could not load token: ' + error.message;
  }
})();

saveButton.addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    result.textContent = 'Paste the API token from the PassVault desktop app.';
    return;
  }
  try {
    await extensionApi.storage.local.set({ token });
    result.textContent = 'Token saved. Submitted logins will ask before saving or updating.';
  } catch (error) {
    result.textContent = 'Could not save token: ' + error.message;
  }
});
