const $=s=>document.querySelector(s);
const status=$('#status'); const auth=$('#auth'); const main=$('#main'); const list=$('#list');

async function renderAuth(){
  const exists=await window.pv.exists();
  if(exists){
    auth.innerHTML=`<div class="glass card authbox"><div class="tag">Encrypted Vault</div><h2>Unlock</h2><p>Enter your master password.</p><div class="row"><input type="password" id="mp" placeholder="Master password"><button id="unlock">Unlock</button></div></div>`;
    $('#unlock').onclick=async()=>{try{await window.pv.unlock($('#mp').value); status.textContent='unlocked'; showMain();}catch(e){alert(e.message);}};
  } else {
    auth.innerHTML=`<div class="glass card authbox"><div class="tag">New Vault</div><h2>Create Vault</h2><p>Choose a strong master password. It is never stored.</p><div class="row"><input type="password" id="mp" placeholder="Master password"><button id="create">Create</button></div></div>`;
    $('#create').onclick=async()=>{try{await window.pv.create($('#mp').value); status.textContent='vault created'; showMain();}catch(e){alert(e.message);}};
  }
}
async function showMain(){ auth.style.display='none'; main.style.display='block'; await refresh(); }
async function refresh(){
  const q=($('#search')&&$('#search').value||'').toLowerCase();
  const entries=await window.pv.list();
  const filtered=q?entries.filter(e=>(e.site||'').toLowerCase().includes(q)||(e.username||'').toLowerCase().includes(q)):entries;
  list.innerHTML='';
  for(const e of filtered){
    const d=document.createElement('div'); d.className='entry';
    d.innerHTML=`<div class="meta"><div class="site">${e.site}</div><div class="user">${e.username}</div></div><div class="row"><span class="pw">••••••</span><button data-id="${e.id}" class="show ghost">Show</button><button data-id="${e.id}" class="del danger">Del</button></div>`;
    list.appendChild(d);
  }
  list.querySelectorAll('.show').forEach(b=>b.onclick=async()=>{const e=await window.pv.get(b.dataset.id); const span=b.parentElement.querySelector('.pw'); span.textContent=e.password;});
  list.querySelectorAll('.del').forEach(b=>b.onclick=async()=>{await window.pv.del(b.dataset.id); refresh();});
}
document.addEventListener('input',e=>{if(e.target&&e.target.id==='search')refresh();});
$('#gen').onclick=async()=>{$('#pass').value=await window.pv.gen({len:20});};
$('#showToken').onclick=async()=>{const t=await window.pv.token(); navigator.clipboard.writeText(t); alert('Token copied: '+t);};
$('#add').onclick=async()=>{await window.pv.add({site:$('#site').value,username:$('#user').value,password:$('#pass').value}); $('#site').value=$('#user').value=$('#pass').value=''; refresh();};
renderAuth();
EOF