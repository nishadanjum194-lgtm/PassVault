const $=s=>document.querySelector(s);
(async()=>{
  const {token=''}=await chrome.storage.local.get('token');
  $('#token').value=token;
})();
$('#save').onclick=async()=>{
  const t=$('#token').value.trim();
  await chrome.storage.local.set({token:t});
  const host=location.hostname;
  const url='http://127.0.0.1:47823/?site='+encodeURIComponent(host);
  try{
    const r=await fetch(url,{headers:{Authorization:'Bearer '+t}});
    const data=await r.json();
    $('#res').innerHTML=data.map(e=>`<div><b>${e.site}</b> ${e.username}<br><code>${e.password}</code></div>`).join('')||'No matches';
  }catch(e){$('#res').textContent=e.message;}
};
