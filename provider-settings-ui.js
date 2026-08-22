(() => {
  'use strict';

  const keys = {
    base: 'generic_openai_base_url', key: 'generic_openai_api_key', llm: 'generic_openai_llm_model',
    tts: 'generic_openai_tts_model', stt: 'generic_openai_stt_model',
    orLlm: 'openrouter_llm_model', orTts: 'openrouter_tts_model', orStt: 'openrouter_stt_model'
  };
  const read = (k, d = '') => localStorage.getItem(k) ?? d;
  const normalize = v => { v = String(v || '').trim().replace(/\/+$/, ''); return v && !/\/v1$/i.test(v) ? `${v}/v1` : v; };

  function style() {
    if (document.getElementById('provider-settings-ui-style')) return;
    const s = document.createElement('style'); s.id = 'provider-settings-ui-style';
    s.textContent = `
      /* Provider settings must remain usable on short desktop/laptop screens. */
      #settings-modal .modal-content {
        display: flex !important;
        flex-direction: column !important;
        max-height: min(92vh, 900px) !important;
        min-height: 0 !important;
        overflow: hidden !important;
      }
      #settings-modal .modal-scroll {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        padding-right: 6px;
      }
      #settings-modal .modal-buttons-footer {
        flex: 0 0 auto !important;
        position: relative !important;
        z-index: 2;
        background: inherit;
      }
      #provider-settings-ui {
        width: 100%;
        min-width: 0;
        padding-bottom: 10px;
      }
      #provider-settings-ui .psui {
        width: 100%;
        min-width: 0;
      }
      #provider-settings-ui input {
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }
      #provider-settings-ui .psui-row {
        display: flex;
        align-items: stretch;
        width: 100%;
        min-width: 0;
      }
      #provider-settings-ui .psui-row input {
        flex: 1 1 auto;
      }
      #provider-settings-ui .psui-btn {
        flex: 0 0 auto;
      }
      .psui{border-top:1px solid rgba(127,127,127,.18);margin-top:12px;padding-top:12px}.psui h4{margin:0 0 8px;font-size:13px}.psui-note{font-size:11px;color:#777;display:block;margin:4px 0 8px}.psui-row{display:flex;gap:8px;margin:6px 0}.psui-row input{flex:1;min-width:0}.psui-btn{white-space:nowrap}.psui-status{font-size:11px;min-height:16px;display:block;margin-top:5px}.psui-ok{color:#238636}.psui-err{color:#c62828}
      @media (max-width: 600px) {
        #settings-modal .modal-content { max-height: 94vh !important; width: calc(100vw - 20px) !important; }
        #provider-settings-ui .psui-row { flex-direction: column; }
        #provider-settings-ui .psui-row .psui-btn { width: 100%; }
      }
    `;
    document.head.appendChild(s);
  }

  function input(id, label, value, type='text', placeholder='') {
    const sec = document.createElement('div'); sec.className='setting-section';
    const p = document.createElement('p'); p.textContent=label; sec.appendChild(p);
    const el = document.createElement('input'); el.id=id; el.type=type; el.value=value||''; el.placeholder=placeholder; el.autocomplete='off'; el.spellcheck=false; sec.appendChild(el); return sec;
  }

  async function models(base, key) {
    const r = await fetch(`${normalize(base)}/models`, {headers:key?{Authorization:`Bearer ${key}`}:{}, cache:'no-store'});
    if(!r.ok) throw new Error(`HTTP ${r.status}`); const d=await r.json(); return Array.isArray(d?.data)?d.data:[];
  }
  function addModel(sec, id, label, value, refreshFn){
    const p=document.createElement('p');p.textContent=label;sec.appendChild(p);
    const row=document.createElement('div');row.className='psui-row';
    const el=document.createElement('input');el.id=id;el.value=value||'';el.placeholder='Model ID (enter manually or Refresh)';el.setAttribute('list',`${id}-list`);
    const dl=document.createElement('datalist');dl.id=`${id}-list`;
    const b=document.createElement('button');b.type='button';b.className='btn-secondary psui-btn';b.textContent='Refresh';b.onclick=refreshFn;
    row.append(el,b);sec.appendChild(row);sec.appendChild(dl);return el;
  }
  function fill(id, ms){ const dl=document.getElementById(`${id}-list`); if(!dl)return; dl.innerHTML=''; for(const m of ms){const x=m?.id||m?.name;if(!x)continue;const o=document.createElement('option');o.value=x;o.label=m?.name?`${m.name} — ${x}`:x;dl.appendChild(o);} if(ms.length===1&&!document.getElementById(id).value)document.getElementById(id).value=ms[0]?.id||ms[0]?.name||''; }

  function inject(){
    if(document.getElementById('provider-settings-ui')) return true;
    const modal=document.querySelector('#settings-modal .modal-scroll'); if(!modal)return false; style();
    const wrap=document.createElement('div'); wrap.id='provider-settings-ui'; wrap.className='psui';
    const head=document.createElement('h4'); head.textContent='Advanced Provider Configuration'; wrap.appendChild(head);
    const note=document.createElement('span'); note.className='psui-note'; note.textContent='Configure each service independently. Local OpenAI-compatible servers such as llama.cpp use port 8080.'; wrap.appendChild(note);

    const generic=document.createElement('div'); generic.className='psui'; generic.innerHTML='<h4>OpenAI-Compatible / Local / Custom Server</h4>';
    generic.appendChild(input('psui-generic-base', 'Base URL', read(keys.base,'http://127.0.0.1:8080/v1'), 'text','http://127.0.0.1:8080/v1'));
    generic.appendChild(input('psui-generic-key', 'API Key', read(keys.key,''), 'password','Optional for local servers'));
    const st=document.createElement('span'); st.id='psui-generic-status'; st.className='psui-status'; generic.appendChild(st);
    addModel(generic,'psui-generic-llm','LLM Model',read(keys.llm,''),async()=>{try{const m=await models(document.getElementById('psui-generic-base').value,document.getElementById('psui-generic-key').value);fill('psui-generic-llm',m);st.textContent=`${m.length} model(s) loaded`;st.className='psui-status psui-ok';}catch(e){st.textContent=e.message;st.className='psui-status psui-err';}});
    addModel(generic,'psui-generic-tts','TTS Model',read(keys.tts,''),async()=>{try{const m=await models(document.getElementById('psui-generic-base').value,document.getElementById('psui-generic-key').value);fill('psui-generic-tts',m);st.textContent=`${m.length} model(s) loaded; choose a TTS-capable model`;st.className='psui-status psui-ok';}catch(e){st.textContent=e.message;st.className='psui-status psui-err';}});
    addModel(generic,'psui-generic-stt','STT / Transcription Model',read(keys.stt,''),async()=>{try{const m=await models(document.getElementById('psui-generic-base').value,document.getElementById('psui-generic-key').value);fill('psui-generic-stt',m);st.textContent=`${m.length} model(s) loaded; choose a transcription-capable model`;st.className='psui-status psui-ok';}catch(e){st.textContent=e.message;st.className='psui-status psui-err';}});
    const detect=document.createElement('button');detect.type='button';detect.className='btn-secondary psui-btn';detect.textContent='Detect Local Server';detect.onclick=async()=>{for(const u of ['http://127.0.0.1:8080/v1','http://localhost:8080/v1','http://192.168.88.50:8080/v1']){try{const m=await models(u,document.getElementById('psui-generic-key').value);document.getElementById('psui-generic-base').value=u;fill('psui-generic-llm',m);fill('psui-generic-tts',m);fill('psui-generic-stt',m);st.textContent=`Connected: ${u} — ${m.length} model(s)`;st.className='psui-status psui-ok';return;}catch(_){}}st.textContent='No local OpenAI-compatible server found on port 8080.';st.className='psui-status psui-err';}; generic.appendChild(detect);

    const or=document.createElement('div'); or.className='psui'; or.innerHTML='<h4>OpenRouter Models</h4><span class="psui-note">Enter model IDs manually or refresh the live OpenRouter catalog.</span>';
    addModel(or,'psui-or-llm','LLM Model',read(keys.orLlm,''),async()=>{try{const r=await fetch('https://openrouter.ai/api/v1/models');const d=await r.json();fill('psui-or-llm',Array.isArray(d?.data)?d.data:[]);}catch(e){}});
    addModel(or,'psui-or-tts','TTS Model',read(keys.orTts,''),async()=>{try{const r=await fetch('https://openrouter.ai/api/v1/models?output_modalities=audio');const d=await r.json();fill('psui-or-tts',Array.isArray(d?.data)?d.data:[]);}catch(e){}});
    addModel(or,'psui-or-stt','STT / Transcription Model',read(keys.orStt,''),async()=>{try{const r=await fetch('https://openrouter.ai/api/v1/models?output_modalities=transcription');const d=await r.json();fill('psui-or-stt',Array.isArray(d?.data)?d.data:[]);}catch(e){}});

    const saveNote=document.createElement('span');saveNote.className='psui-note';saveNote.textContent='These values are stored locally in this browser and are used by the provider bridge.'; or.appendChild(saveNote);
    wrap.append(generic,or); modal.appendChild(wrap);

    const save=document.getElementById('save-settings');
    save?.addEventListener('click',()=>{ localStorage.setItem(keys.base,normalize(document.getElementById('psui-generic-base').value)); localStorage.setItem(keys.key,document.getElementById('psui-generic-key').value); localStorage.setItem(keys.llm,document.getElementById('psui-generic-llm').value); localStorage.setItem(keys.tts,document.getElementById('psui-generic-tts').value); localStorage.setItem(keys.stt,document.getElementById('psui-generic-stt').value); localStorage.setItem(keys.orLlm,document.getElementById('psui-or-llm').value); localStorage.setItem(keys.orTts,document.getElementById('psui-or-tts').value); localStorage.setItem(keys.orStt,document.getElementById('psui-or-stt').value); });
    return true;
  }
  const obs=new MutationObserver(inject);obs.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject,{once:true});else inject();
})();
