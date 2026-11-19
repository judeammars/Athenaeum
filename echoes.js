/* Athenaeum · Leave an Echo
   Counts are public; per-browser visitor UUID is stored only in this browser and
   sent to limited Supabase RPCs. Raw voter records are not exposed by the API. */
const ECHO_CHOICES=[
  {id:'feather',name:'A Feather',meaning:'Your words touched me.',symbol:'🪶'},
  {id:'bookmark',name:'A Bookmark',meaning:'A story worth keeping.',symbol:'🔖'},
  {id:'spark',name:'A Spark',meaning:"You've inspired me.",symbol:'✨'},
  {id:'flower',name:'A Flower',meaning:'What a lovely creation.',symbol:'🌸'}
];
const ECHO_TOKEN_KEY='athenaeum-echo-visitor-v1';
let savedEchoVisitor;
const echoBusy=new Set();

function echoVisitor(){
  if(savedEchoVisitor!==undefined)return savedEchoVisitor;
  savedEchoVisitor=null;
  try{
    let value=localStorage.getItem(ECHO_TOKEN_KEY);
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if(!value||!uuid.test(value)){
      if(!window.crypto?.getRandomValues)return null;
      if(window.crypto.randomUUID)value=window.crypto.randomUUID();
      else{
        const bytes=new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
        const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0'));
        value=[hex.slice(0,4).join(''),hex.slice(4,6).join(''),hex.slice(6,8).join(''),hex.slice(8,10).join(''),hex.slice(10).join('')].join('-');
      }
      localStorage.setItem(ECHO_TOKEN_KEY,value);
    }
    savedEchoVisitor=value;
  }catch(err){console.warn('Echo browser storage unavailable',err);}
  return savedEchoVisitor;
}

function echoMarkup(workId){
  return '<section class="echo-panel" data-echo-panel data-work-id="'+esc(workId)+'" aria-label="Leave an Echo">'+
    '<div class="echo-heading"><span class="echo-kicker">ATHENAEUM · A LITTLE APPRECIATION</span>'+
    '<h2>Leave an Echo</h2><p>Some stories deserve to be felt, not merely read.</p></div>'+
    '<div class="echo-grid">'+ECHO_CHOICES.map(x=>
      '<button type="button" class="echo-choice" data-echo-reaction="'+x.id+'" disabled aria-pressed="false" aria-label="'+x.name+'">'+
      '<span class="echo-icon" aria-hidden="true">'+x.symbol+'</span>'+
      '<span class="echo-name">'+x.name+'</span><span class="echo-meaning">'+esc(x.meaning)+'</span>'+
      '<span class="echo-count" data-echo-count>…</span></button>'
    ).join('')+'</div>'+
    '<p class="echo-feedback" data-echo-feedback role="status" aria-live="polite">Memuat reaksi karya...</p></section>';
}
function echoPanels(id){
  return [...document.querySelectorAll('[data-echo-panel]')].filter(el=>el.dataset.workId===id);
}
function echoMessage(id,text){
  echoPanels(id).forEach(p=>{const n=p.querySelector('[data-echo-feedback]');if(n)n.textContent=text;});
}
async function refreshWorkEchoes(id){
  if(!supabase)return;
  const token=echoVisitor();
  const {data,error}=await supabase.rpc('get_work_echoes',{p_work_id:id,p_visitor_id:token});
  if(error)throw error;
  const values=new Map((data||[]).map(x=>[x.reaction,x]));
  echoPanels(id).forEach(panel=>{
    panel.querySelectorAll('[data-echo-reaction]').forEach(button=>{
      const val=values.get(button.dataset.echoReaction);
      const selected=!!val?.reacted,amount=Number(val?.total||0);
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
      button.setAttribute('aria-label',button.querySelector('.echo-name').textContent+
        ', '+amount+' reaksi, '+(selected?'klik untuk batalkan':'klik untuk memberikan reaksi'));
      button.disabled=!token||echoBusy.has(id);
      const number=button.querySelector('[data-echo-count]');
      if(number)number.textContent=new Intl.NumberFormat('id-ID').format(amount);
    });
  });
  echoMessage(id,!token?'Aktifkan penyimpanan browser untuk memberikan Echo.':
    [...values.values()].some(x=>x.reacted)?'Your echoes have been left upon these pages. ♡':
    'Tap a symbol to leave your appreciation.');
}
function mountWorkEchoes(id){
  refreshWorkEchoes(id).catch(err=>{
    console.error('Could not load Echo reactions',err);
    echoMessage(id,'Reaksi belum dapat dimuat. Coba buka ulang karya ini.');
  });
}
function echoCelebrate(id,reaction){
  echoPanels(id).forEach(panel=>{
    const btn=panel.querySelector('[data-echo-reaction="'+reaction+'"]');
    if(!btn)return;
    btn.classList.remove('echo-celebrate');
    void btn.offsetWidth;
    btn.classList.add('echo-celebrate');
    btn.addEventListener('animationend',()=>btn.classList.remove('echo-celebrate'),{once:true});
  });
}
async function toggleWorkEcho(button){
  const panel=button.closest('[data-echo-panel]');
  if(!panel||!supabase)return;
  const id=panel.dataset.workId,reaction=button.dataset.echoReaction;
  if(!ECHO_CHOICES.some(x=>x.id===reaction)||echoBusy.has(id))return;
  const token=echoVisitor();
  if(!token){echoMessage(id,'Browser tidak mengizinkan penyimpanan lokal untuk Echo.');return;}
  echoBusy.add(id);
  echoPanels(id).forEach(panel=>{
    panel.setAttribute('aria-busy','true');
    panel.querySelectorAll('[data-echo-reaction]').forEach(btn=>btn.disabled=true);
  });
  let saved=false;
  try{
    const {data,error}=await supabase.rpc('toggle_work_echo',{p_work_id:id,p_visitor_id:token,p_reaction:reaction});
    if(error)throw error;
    saved=true;
    echoBusy.delete(id);
    await refreshWorkEchoes(id);
    if(data===true)echoCelebrate(id,reaction);
  }catch(err){
    console.error('Leave an Echo failed',err);
    echoMessage(id,saved?'Echo tersimpan, tetapi jumlah belum diperbarui. Buka ulang karya ini.':
      'Echo belum tersimpan. Periksa koneksi lalu coba lagi.');
    echoBusy.delete(id);
    echoPanels(id).forEach(panel=>panel.querySelectorAll('[data-echo-reaction]').forEach(btn=>btn.disabled=false));
  }finally{
    echoPanels(id).forEach(panel=>panel.removeAttribute('aria-busy'));
  }
}
