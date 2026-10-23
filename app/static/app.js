(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let TODAY = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

  const paths = {
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    notes:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    pin:'<path d="m9 3 6 0-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6"/>',
    archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M8 15h1M13 15h1"/>',
    edit:'<path d="m15 4 5 5M4 20l5-1L21 7a2.2 2.2 0 0 0-4-4L5 15l-1 5Z"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    list:'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
    moon:'<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
    left:'<path d="m14 6-6 6 6 6"/>',right:'<path d="m10 6 6 6-6 6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    tag:'<path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7" cy="7" r="1"/>',
    checklist:'<path d="M10 6h11M10 12h11M10 18h11M3 5l1 1 2-2M3 11l1 1 2-2M3 17l1 1 2-2"/>',
    restore:'<path d="M3 10a9 9 0 1 1 0 6M3 4v6h6M12 7v5l3 2"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.notes}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = value => JSON.parse(JSON.stringify(value));
  let notes=[];
  let state={scope:'all',label:'',group:'day',layout:'grid',range:'all',date:'',search:''};
  let calendarMonth=new Date(TODAY.slice(0,7)+'-01T12:00:00Z');
  let draft=null,timer=null,toastTimer=null,csrf='',loggedIn=false;
  let activeCount=0,totalMatches=0,hasMore=false,queryKey='',calendarKey='',queryGeneration=0,loadTimer;
  let calendarDays=new Set(),pendingSave=null,editSequence=0,saveChain=Promise.resolve();
  const editor=$('editor');
  const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,'0')).join('');
  const dateObject = date => new Date(`${date}T12:00:00Z`);
  const isoDate = date => date.toISOString().slice(0,10);
  const dateFormat = (date,options) => dateObject(date).toLocaleDateString('en-GB',{...options,timeZone:'UTC'});
  const shortDate = date => dateFormat(date,{day:'numeric',month:'short'});
  const longDate = date => dateFormat(date,{day:'numeric',month:'short',year:'numeric'});
  const weekStart = date => {const d=dateObject(date);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return isoDate(d);};
  const weekEnd = date => {const d=dateObject(weekStart(date));d.setUTCDate(d.getUTCDate()+6);return isoDate(d);};
  const notify = message => { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500); };
  function setTheme(theme) {
    document.documentElement.dataset.theme=theme;
    $('theme-button').innerHTML=icon(theme==='dark'?'sun':'moon');
    $('theme-button').setAttribute('aria-label',theme==='dark'?'Switch to light appearance':'Switch to dark appearance');
    try{localStorage.setItem('daynote-theme',theme);}catch{}
  }
  let savedTheme='light';try{savedTheme=localStorage.getItem('daynote-theme')||'light';}catch{}
  setTheme(savedTheme);
  const staticIcons={'menu-toggle':'menu','calendar-prev':'left','calendar-next':'right','grid-button':'grid','list-button':'list','editor-close':'close','editor-pin':'pin','editor-archive':'archive','editor-trash':'trash','toggle-checklist':'checklist','guide-close':'close'};
  Object.entries(staticIcons).forEach(([id,name])=>$(id).innerHTML=icon(name));
  function inScope(note) {
    if(state.scope==='trash')return note.deleted;
    if(state.scope==='archive')return note.archived&&!note.deleted;
    return !note.archived&&!note.deleted&&(state.scope!=='pinned'||note.pinned);
  }
  function selectedNotes() {
    return notes.filter(note=>{
      if(!inScope(note)||state.label&&note.label!==state.label)return false;
      const text=[note.title,note.body,...note.items.map(item=>item.text)].join(' ').toLowerCase();
      if(state.search&&!text.includes(state.search.toLowerCase()))return false;
      if(state.range==='today'&&note.date!==TODAY)return false;
      if(state.range==='week'&&(note.date<weekStart(TODAY)||note.date>weekEnd(TODAY)))return false;
      if(state.range==='month'&&!note.date.startsWith(TODAY.slice(0,7)))return false;
      if(state.range==='custom'&&state.date&&note.date!==state.date)return false;
      return true;
    }).sort((a,b)=>b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||a.id.localeCompare(b.id));
  }
  function groupHeading(key) {
    if(state.group==='month')return [dateFormat(key+'-01',{month:'long',year:'numeric'}),''];
    if(state.group==='week'){
      const end=weekEnd(key);const a=dateObject(key),b=dateObject(end);
      const range=a.getUTCFullYear()!==b.getUTCFullYear()?`${longDate(key)} – ${longDate(end)}`:a.getUTCMonth()!==b.getUTCMonth()?`${shortDate(key)} – ${longDate(end)}`:`${a.getUTCDate()}–${longDate(end)}`;
      return [range,key===weekStart(TODAY)?'This week':''];
    }
    const label=key===TODAY?'Today':key===isoDate(new Date(dateObject(TODAY).getTime()-86400000))?'Yesterday':dateFormat(key,{weekday:'long'});
    return [label,dateFormat(key,{day:'numeric',month:'short',year:'numeric'})];
  }
  const actionButton=(action,id,name,label,active=false)=>`<button class="icon-button${active?' is-pinned':''}" data-action="${action}" data-id="${esc(id)}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`;
  function card(note) {
    const checks=note.items.length?`<ul class="note-checklist">${note.items.slice(0,4).map((item,index)=>`<li><label><input type="checkbox" data-check="${esc(note.id)}" data-index="${index}" ${item.done?'checked':''} ${state.scope==='trash'?'disabled':''}><span class="${item.done?'checked':''}">${esc(item.text)}</span></label></li>`).join('')}</ul>${note.items.length>4?`<button class="more-items" data-action="open" data-id="${esc(note.id)}">+ ${note.items.length-4} more items</button>`:''}`:'';
    const content=checks||`<button class="card-content" data-action="open" data-id="${esc(note.id)}" aria-label="Open ${esc(note.title||'untitled note')}">${esc(note.body)}</button>`;
    const actions=state.scope==='trash'?actionButton('restore',note.id,'restore','Restore note')+actionButton('delete',note.id,'trash','Delete permanently'):actionButton('pin',note.id,'pin',note.pinned?'Unpin note':'Pin note',note.pinned)+actionButton('archive',note.id,note.archived?'restore':'archive',note.archived?'Unarchive note':'Archive note')+actionButton('trash',note.id,'trash','Move note to trash');
    return `<article class="note-card tone-${esc(note.color)}"><div class="card-title-row"><button class="card-title" data-action="open" data-id="${esc(note.id)}">${esc(note.title||'Untitled note')}</button>${note.pinned?icon('pin').replace('<svg ','<svg class="card-pin-indicator" '):''}</div>${content}${note.label?`<span class="card-label">${esc(note.label)}</span>`:''}<div class="card-bottom"><time class="card-time" datetime="${note.date}T${note.time}">${state.group==='day'?note.time:shortDate(note.date)+' · '+note.time}</time><div class="card-actions">${actions}</div></div></article>`;
  }
  function render() {
    ensureQuery();
    const visible=selectedNotes();
    const titles={all:'All notes',pinned:'Pinned',archive:'Archive',trash:'Trash'};
    $('page-title').textContent=state.label||titles[state.scope];
    $('page-description').textContent=state.scope==='archive'?'Out of the way. Always here when you need them.':state.scope==='trash'?'A second chance for things you let go.':state.scope==='pinned'?'The things you want to keep close.':state.label?'A little space for your '+state.label.toLowerCase()+'.':'A place for everything on your mind.';
    $('all-count').textContent=activeCount;
    document.querySelectorAll('[data-scope]').forEach(button=>{button.classList.toggle('active',button.dataset.scope===state.scope&&!state.label);button.setAttribute('aria-current',button.classList.contains('active')?'page':'false');});
    document.querySelectorAll('[data-label]').forEach(button=>button.classList.toggle('active',button.dataset.label===state.label));
    document.querySelectorAll('[data-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.group===state.group)));
    ['grid','list'].forEach(type=>{$(type+'-button').classList.toggle('active',state.layout===type);$(type+'-button').setAttribute('aria-pressed',String(state.layout===type));});
    $('date-filter').value=state.range;$('custom-date').hidden=state.range!=='custom';$('custom-date').value=state.date;
    const hasFilter=Boolean(state.search||state.range!=='all');
    $('filter-summary').hidden=!hasFilter;
    if(hasFilter)$('filter-summary').innerHTML=`<span>${totalMatches} ${totalMatches===1?'note':'notes'}${state.search?' matching “'+esc(state.search)+'”':''}${state.range==='custom'&&state.date?' · '+longDate(state.date):''}</span><button id="clear-filters">Clear filters</button>`;
    const groups=new Map();visible.forEach(note=>{const key=state.group==='day'?note.date:state.group==='week'?weekStart(note.date):note.date.slice(0,7);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(note);});
    $('notes-feed').innerHTML=groups.size?[...groups].map(([key,items])=>{const [title,date]=groupHeading(key);items.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||a.id.localeCompare(b.id));return `<section class="note-group"><div class="group-heading"><h2>${title}</h2>${date?`<span class="group-date">${date}</span>`:''}<span class="group-quantity" aria-label="${items.length} notes">${items.length}</span></div><div class="note-grid ${state.layout==='list'?'list':''}">${items.map(card).join('')}</div></section>`;}).join(''):`<div class="empty-state"><div class="empty-symbol">${icon(state.scope==='trash'?'trash':'notes')}</div><h2>${state.search?'No notes found':state.scope==='trash'?'A clean slate':'A little room for a thought'}</h2><p>${state.search?'Try another word, label, or date.':state.scope==='trash'?'Notes you move to trash will appear here.':'There are no notes in this view yet.'}</p><button class="text-button" id="empty-clear">${hasFilter?'Show all dates':state.scope==='all'?'Create a note':'Go to all notes'}</button></div>`;
    $('composer').hidden=state.scope==='trash';$('load-more').hidden=!hasMore;renderCalendar();
  }
  function renderCalendar() {
    $('calendar-title').textContent=calendarMonth.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
    const year=calendarMonth.getUTCFullYear(),month=calendarMonth.getUTCMonth();
    const first=new Date(Date.UTC(year,month,1,12));const offset=(first.getUTCDay()+6)%7;
    const total=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
    ensureCalendar();const days=calendarDays;
    $('calendar-days').innerHTML='<span></span>'.repeat(offset)+Array.from({length:total},(_,i)=>{const date=isoDate(new Date(Date.UTC(year,month,i+1,12)));const selected=state.range==='custom'&&state.date===date;return `<button data-date="${date}" class="${date===TODAY?'today ':''}${days.has(date)?'has-notes ':''}${selected?'selected':''}" aria-label="${longDate(date)}${days.has(date)?', has notes':''}" aria-pressed="${selected}">${i+1}</button>`;}).join('');
  }
  function syncNav(){const collapsed=!loggedIn||(matchMedia('(max-width:780px)').matches&&!$('sidebar').classList.contains('open'));$('sidebar').inert=collapsed;$('sidebar').setAttribute('aria-hidden',String(collapsed));}
  function closeNav(){ $('sidebar').classList.remove('open');$('nav-scrim').hidden=true;$('menu-toggle').setAttribute('aria-expanded','false');syncNav(); }
  $('menu-toggle').setAttribute('aria-controls','sidebar');$('menu-toggle').setAttribute('aria-expanded','false');
  $('menu-toggle').onclick=()=>{const open=$('sidebar').classList.toggle('open');$('nav-scrim').hidden=!open;$('menu-toggle').setAttribute('aria-expanded',String(open));syncNav();};
  window.addEventListener('resize',syncNav);syncNav();
  $('nav-scrim').onclick=closeNav;
  $('main-nav').onclick=event=>{const button=event.target.closest('[data-scope]');if(button){state.scope=button.dataset.scope;state.label='';closeNav();render();}};
  $('label-nav').onclick=event=>{const button=event.target.closest('[data-label]');if(button){state.label=state.label===button.dataset.label?'':button.dataset.label;state.scope='all';closeNav();render();}};
  document.querySelectorAll('[data-group]').forEach(button=>button.onclick=()=>{state.group=button.dataset.group;render();});
  ['grid','list'].forEach(type=>$(type+'-button').onclick=()=>{state.layout=type;render();});
  $('date-filter').onchange=event=>{state.range=event.target.value;if(state.range==='custom'&&!state.date)state.date=TODAY;render();};
  $('custom-date').onchange=event=>{state.date=event.target.value;render();};
  $('search').oninput=event=>{state.search=event.target.value;render();};
  $('filter-summary').onclick=event=>{if(event.target.closest('#clear-filters'))clearFilters();};
  function clearFilters(){state.search='';state.range='all';state.date='';$('search').value='';render();}
  $('calendar-prev').onclick=()=>{calendarMonth.setUTCMonth(calendarMonth.getUTCMonth()-1);renderCalendar();};
  $('calendar-next').onclick=()=>{calendarMonth.setUTCMonth(calendarMonth.getUTCMonth()+1);renderCalendar();};
  $('calendar-days').onclick=event=>{const button=event.target.closest('[data-date]');if(button){state.date=button.dataset.date;state.range='custom';closeNav();render();}};
  $('theme-button').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
  const draftKey='daynote-unsaved-v1';
  const noteBusy=new Set();
  let setupRequired=false;
  const setupToken=new URLSearchParams(location.hash.slice(1)).get('setup')||'';
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  async function api(path,options={}) {
    let response;
    try {
      response=await fetch(path,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Daynote-Request':'1',...(csrf?{'X-CSRF-Token':csrf}:{}),...options.headers}});
    } catch {throw Object.assign(new Error('Cannot reach your Raspberry Pi. Your draft has not been confirmed saved.'),{network:true});}
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===401&&path!=='/api/login'){if(editor.open){rememberDraft();editor.close();draft=null;pendingSave=null;}setAuth(false);}
      const detail=result.detail;
      throw Object.assign(new Error(typeof detail==='string'?detail:detail?.message||'The request could not be completed.'),{status:response.status,detail});
    }
    return result;
  }
  function setAuth(value){
    loggedIn=value;$('auth-screen').hidden=value;
    document.querySelectorAll('.topbar,.sidebar,main').forEach(el=>el.inert=!value);
    if(value)syncNav();else if(!setupRequired){$('auth-title').textContent='Welcome back.';$('auth-description').textContent='Sign in to your notes on your Raspberry Pi.';$('name-label').hidden=true;$('setup-label').hidden=true;$('password-help').hidden=true;$('auth-password').minLength=1;$('auth-password').autocomplete='current-password';$('auth-submit').textContent='Sign in';}
  }
  function queryParams(){
    const p=new URLSearchParams({scope:state.scope,limit:'200'});
    if(state.label)p.set('label',state.label);
    if(state.search)p.set('q',state.search);
    let start='',end='';
    if(state.range==='today'){start=end=TODAY;}
    if(state.range==='week'){start=weekStart(TODAY);end=weekEnd(TODAY);}
    if(state.range==='month'){start=TODAY.slice(0,7)+'-01';const d=dateObject(start);d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);end=isoDate(d);}
    if(state.range==='custom'&&state.date)start=end=state.date;
    if(start)p.set('start',start);if(end)p.set('end',end);
    return p;
  }
  function ensureQuery(){
    if(!loggedIn)return;
    const key=queryParams().toString();
    if(key!==queryKey){queryKey=key;const generation=++queryGeneration;clearTimeout(loadTimer);loadTimer=setTimeout(()=>fetchNotes(key,generation),state.search?200:0);}
  }
  async function fetchNotes(key=queryKey,generation=++queryGeneration,append=false){
    if(!loggedIn)return;
    $('connection-status').hidden=false;$('connection-status').textContent='Loading notes…';
    try{
      const result=await api('/api/notes?'+key+(append?'&offset='+notes.length:''));
      if(generation!==queryGeneration||key!==queryKey)return;
      notes=append?[...new Map([...notes,...result.notes].map(n=>[n.id,n])).values()]:result.notes;
      activeCount=result.active_count;totalMatches=result.total;hasMore=result.has_more;
      $('connection-status').hidden=true;render();
    }catch(error){if(generation===queryGeneration){$('connection-status').textContent=error.message+' Use Settings → Refresh notes to try again.';}}
  }
  async function refreshNotes(){clearTimeout(loadTimer);queryKey=queryParams().toString();calendarKey='';await fetchNotes(queryKey,++queryGeneration);}
  function ensureCalendar(){
    if(!loggedIn)return;
    const month=isoDate(calendarMonth).slice(0,7);const key=new URLSearchParams({month,scope:state.scope,label:state.label}).toString();
    if(calendarKey===key)return;calendarKey=key;
    api('/api/calendar?'+key).then(result=>{if(calendarKey===key){calendarDays=new Set(result.dates);renderCalendar();}}).catch(()=>{if(calendarKey===key)calendarDays=new Set();});
  }
  function payload(note,mutation=uid()){
    return {mutation_id:mutation,base_revision:note.revision||0,title:note.title,body:note.body,color:note.color,label:note.label,kind:note.kind||'text',pinned:note.pinned,archived:note.archived,deleted:note.deleted,items:note.items.map(i=>({id:i.id||uid(),text:i.text,done:i.done}))};
  }
  function contentSignature(note){const p=payload(note,'comparison');delete p.mutation_id;delete p.base_revision;return JSON.stringify(p);}
  async function updateNote(id,change,message){
    if(noteBusy.has(id))return;
    const note=notes.find(n=>n.id===id);if(!note)return;
    noteBusy.add(id);document.querySelectorAll(`[data-id="${id}"], [data-check="${id}"]`).forEach(el=>el.disabled=true);
    try{await api('/api/notes/'+id,{method:'PUT',body:JSON.stringify(payload({...note,...change}))});await refreshNotes();if(message)notify(message);}
    catch(error){notify(error.status===409?'Another edit was saved. The latest version has been loaded.':error.message);await refreshNotes();}
    finally{noteBusy.delete(id);render();}
  }
  $('load-more').onclick=()=>fetchNotes(queryKey,++queryGeneration,true);
  $('notes-feed').onclick=async event=>{
    if(event.target.closest('#empty-clear')){if(state.search||state.range!=='all')clearFilters();else if(state.scope!=='all'){state.scope='all';state.label='';render();}else openEditor();return;}
    const button=event.target.closest('[data-action]');if(!button)return;
    const note=notes.find(n=>n.id===button.dataset.id);if(!note)return;
    const action=button.dataset.action;
    if(action==='open'){if(note.deleted){notify('Restore this note before editing it.');return;}openEditor(note);}
    if(action==='pin')await updateNote(note.id,{pinned:!note.pinned},note.pinned?'Note unpinned':'Pinned within its date group');
    if(action==='archive')await updateNote(note.id,{archived:!note.archived},note.archived?'Note returned to all notes':'Note archived');
    if(action==='trash')await updateNote(note.id,{deleted:true},'Note moved to Trash');
    if(action==='restore')await updateNote(note.id,{deleted:false},'Note restored');
    if(action==='delete'&&confirm('Permanently delete this note? This cannot be undone.')){
      try{await api('/api/notes/'+note.id,{method:'DELETE',body:JSON.stringify({base_revision:note.revision,mutation_id:uid()})});notify('Note permanently deleted');await refreshNotes();}
      catch(error){notify(error.message);await refreshNotes();}
    }
  };
  $('notes-feed').onchange=event=>{const box=event.target.closest('[data-check]');if(!box)return;const note=notes.find(n=>n.id===box.dataset.check);const items=copy(note.items);items[Number(box.dataset.index)].done=box.checked;updateNote(note.id,{items});};
  function rememberDraft(){
    if(!draft||!meaningful(draft))return;
    try{localStorage.setItem(draftKey,JSON.stringify({draft,pending:pendingSave}));}catch{$('save-status').textContent='Unsaved · local recovery unavailable';}
  }
  function forgetDraft(){try{localStorage.removeItem(draftKey);}catch{}$('recover-draft').hidden=true;}
  function checkRecovery(){try{$('recover-draft').hidden=!localStorage.getItem(draftKey);}catch{}}
  const meaningful=note=>note.title.trim()||note.body.trim()||note.items.some(i=>i.text.trim());
  function openEditor(note,recovery){
    clearTimeout(timer);pendingSave=recovery?.pending||null;editSequence=0;
    draft=copy(recovery?.draft||note||{id:uid(),revision:0,date:TODAY,time:new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(new Date()),title:'',body:'',kind:'text',color:'plain',label:'',pinned:false,archived:false,deleted:false,items:[]});
    draft.items=draft.items.map(i=>({...i,id:i.id||uid()}));
    $('note-title').value=draft.title;$('note-body').value=draft.body;$('note-label').value=draft.label;
    $('save-status').textContent=recovery?'Recovered draft · not yet saved':draft.revision?'Saved on your Pi':'Not yet saved';
    $('note-date').textContent=draft.revision?`Created ${longDate(draft.date)} · ${draft.time} · India time`:'Will use today’s date when first saved';
    $('save-problem').hidden=true;renderEditorOptions();renderChecklist();editor.showModal();$('note-title').focus();
  }
  function renderEditorOptions(){
    editor.style.background=`var(--card-${draft.color})`;
    $('editor-pin').setAttribute('aria-label',draft.pinned?'Unpin note':'Pin note');$('editor-pin').setAttribute('aria-pressed',String(draft.pinned));
    $('editor-pin').style.color=draft.pinned?'var(--text)':'';
    $('editor-archive').setAttribute('aria-label',draft.archived?'Unarchive note':'Archive note');$('editor-archive').innerHTML=icon(draft.archived?'restore':'archive');
    $('swatches').innerHTML=['plain','sand','sage','lavender','rose','blue'].map(color=>`<button type="button" class="swatch" data-color="${color}" style="background:var(--card-${color})" aria-label="${color} note color" aria-pressed="${draft.color===color}">${draft.color===color?icon('check'):''}</button>`).join('');
  }
  function renderChecklist(){
    const enabled=draft.kind==='checklist'||draft.items.length>0;$('note-body').hidden=enabled;$('checklist-editor').hidden=!enabled;$('add-item').hidden=!enabled;
    $('toggle-checklist').setAttribute('aria-label',enabled?'Switch to text note':'Switch to checklist');
    $('checklist-editor').innerHTML=draft.items.map((item,index)=>`<div class="check-edit-row"><input type="checkbox" aria-label="Complete item ${index+1}" data-edit-check="${index}" ${item.done?'checked':''}><input type="text" aria-label="Checklist item ${index+1}" maxlength="5000" data-edit-text="${index}" value="${esc(item.text)}"><button type="button" class="icon-button" data-remove-item="${index}" aria-label="Remove item ${index+1}">${icon('close')}</button></div>`).join('');
  }
  function readDraft(){if(!draft)return;draft.title=$('note-title').value;draft.body=$('note-body').value;draft.label=$('note-label').value;}
  function saveDraft(){
    clearTimeout(timer);
    const job=async()=>{
      if(!draft)return true;
      readDraft();
      if(!meaningful(draft)&&!draft.deleted){
        if(draft.revision){showSaveProblem(new Error('This note is empty. Add some text or move it to Trash.'));return false;}
        $('save-status').textContent='Empty note · not saved';return true;
      }
      for(let attempt=0;attempt<5;attempt++){
        const saved=notes.find(n=>n.id===draft.id);
        if(!pendingSave&&saved&&contentSignature(saved)===contentSignature(draft)){$('save-status').textContent='Saved on your Pi';forgetDraft();return true;}
        if(!pendingSave){readDraft();pendingSave={id:draft.id,sequence:editSequence,body:payload(draft)};rememberDraft();}
        const pending=pendingSave;
        try{
          $('save-status').textContent='Saving…';
          const result=await api('/api/notes/'+pending.id,{method:'PUT',body:JSON.stringify(pending.body)});
          if(!draft||draft.id!==pending.id)return false;
          draft.revision=result.revision;draft.date=result.date;draft.time=result.time;draft.createdAt=result.createdAt;draft.updatedAt=result.updatedAt;
          notes=notes.filter(n=>n.id!==result.id).concat(result);pendingSave=null;
          $('note-date').textContent=`Created ${longDate(result.date)} · ${result.time} · India time`;
          if(editSequence===pending.sequence){$('save-status').textContent='Saved on your Pi';$('save-problem').hidden=true;forgetDraft();await refreshNotes();if(editSequence!==pending.sequence){readDraft();rememberDraft();continue;}return true;}
          readDraft();rememberDraft();
        }catch(error){showSaveProblem(error);rememberDraft();return false;}
      }
      scheduleSave();return false;
    };
    saveChain=saveChain.catch(()=>false).then(job);return saveChain;
  }
  function showSaveProblem(error){
    $('save-status').textContent='Unsaved changes';$('save-problem').hidden=false;
    if(error.status===409){
      $('save-problem').innerHTML='<strong>Another edit was found</strong><p>Your draft is still here. Save it as a separate note to preserve both versions.</p><button type="button" data-recover="copy">Save a separate note</button>';
    }else{
      $('save-problem').innerHTML=`<strong>Could not save your changes</strong><p>${esc(error.message)}</p><button type="button" data-recover="retry">Try again</button>`;
    }
  }
  function scheduleSave(){readDraft();editSequence++;$('save-status').textContent='Saving…';rememberDraft();clearTimeout(timer);timer=setTimeout(saveDraft,650);}
  async function finishEditor(){
    if(!await saveDraft()){notify('Your draft is still open. Resolve the save message first.');return;}
    const hiddenByFilter=state.range!=='all'||state.scope!=='all'||state.label||state.search;
    if(hiddenByFilter&&draft&&!selectedNotes().some(n=>n.id===draft.id)&&meaningful(draft))notify('Saved to its original date. Clear filters to see it.');
    forgetDraft();draft=null;pendingSave=null;editor.close();
  }
  $('new-note').onclick=()=>openEditor();$('composer').onclick=()=>openEditor();
  $('note-title').oninput=scheduleSave;$('note-body').oninput=scheduleSave;$('note-label').onchange=scheduleSave;
  $('note-body').maxLength=100000;
  $('swatches').onclick=event=>{const button=event.target.closest('[data-color]');if(button){draft.color=button.dataset.color;renderEditorOptions();scheduleSave();}};
  $('editor-pin').onclick=()=>{draft.pinned=!draft.pinned;renderEditorOptions();scheduleSave();};
  $('editor-close').onclick=finishEditor;$('editor-form').onsubmit=event=>{event.preventDefault();finishEditor();};
  editor.addEventListener('cancel',event=>{event.preventDefault();finishEditor();});
  $('editor-archive').onclick=async()=>{draft.archived=!draft.archived;editSequence++;if(await saveDraft()){forgetDraft();draft=null;editor.close();notify('Note moved');}};
  $('editor-trash').onclick=async()=>{draft.deleted=true;editSequence++;if(await saveDraft()){forgetDraft();draft=null;editor.close();notify('Note moved to Trash');}};
  $('toggle-checklist').onclick=()=>{readDraft();const enabled=draft.kind==='checklist'||draft.items.length;if(enabled){draft.body=draft.items.map(i=>i.text).join('\n');draft.items=[];draft.kind='text';$('note-body').value=draft.body;}else{draft.items=(draft.body?draft.body.split('\n').filter(Boolean):['']).slice(0,200).map(text=>({id:uid(),text,done:false}));draft.body='';draft.kind='checklist';$('note-body').value='';}renderChecklist();scheduleSave();};
  $('add-item').onclick=()=>{if(draft.items.length>=200){notify('A checklist can have up to 200 items.');return;}draft.items.push({id:uid(),text:'',done:false});renderChecklist();$('checklist-editor').querySelectorAll('input[type=text]').item(draft.items.length-1).focus();scheduleSave();};
  $('checklist-editor').oninput=event=>{if(event.target.matches('[data-edit-text]')){draft.items[Number(event.target.dataset.editText)].text=event.target.value;scheduleSave();}};
  $('checklist-editor').onchange=event=>{if(event.target.matches('[data-edit-check]')){draft.items[Number(event.target.dataset.editCheck)].done=event.target.checked;scheduleSave();}};
  $('checklist-editor').onclick=event=>{const button=event.target.closest('[data-remove-item]');if(button){draft.items.splice(Number(button.dataset.removeItem),1);renderChecklist();scheduleSave();}};
  $('save-problem').onclick=async event=>{const button=event.target.closest('[data-recover]');if(!button)return;if(button.dataset.recover==='copy'){draft.id=uid();draft.revision=0;draft.date=TODAY;draft.title=(draft.title||'Untitled note').slice(0,185)+' (my version)';$('note-title').value=draft.title;pendingSave=null;editSequence++;}await saveDraft();};
  $('recover-draft-button').onclick=()=>{try{const recovery=JSON.parse(localStorage.getItem(draftKey));if(recovery?.draft)openEditor(null,recovery);}catch{notify('The recovered draft could not be read.');}};
  $('discard-draft-button').onclick=()=>{if(confirm('Discard the unsaved draft stored on this device?'))forgetDraft();};
  $('guide-button').onclick=()=>$('guide').showModal();$('guide-close').onclick=()=>$('guide').close();
  $('refresh-notes').onclick=async()=>{$('guide').close();await refreshNotes();};
  $('logout').onclick=async()=>{
    try{if(localStorage.getItem(draftKey)&&!confirm('Signing out removes the unsaved draft on this device. Continue?'))return;}catch{}
    try{await api('/api/logout',{method:'POST',body:'{}'});forgetDraft();notes=[];csrf='';queryKey='';calendarKey='';$('guide').close();setAuth(false);$('auth-password').value='';$('auth-password').focus();}
    catch(error){notify(error.message);}
  };
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!editor.open&&!$('guide').open&&loggedIn){event.preventDefault();$('search').focus();}});
  window.addEventListener('beforeunload',event=>{if(editor.open&&draft&&meaningful(draft)&&$('save-status').textContent!=='Saved on your Pi'){rememberDraft();event.preventDefault();event.returnValue='';}});
  window.addEventListener('focus',()=>{if(loggedIn&&!editor.open)refreshNotes();});
  function updateToday(today){TODAY=today;$('eyebrow').textContent=dateFormat(TODAY,{weekday:'long',day:'numeric',month:'long'}).toUpperCase();}
  async function init(){
    $('auth-screen').hidden=true;
    document.querySelectorAll('.topbar,.sidebar,main').forEach(el=>el.inert=true);
    try{
      const result=await api('/api/session');
      if(result.authenticated){
        $('logout').hidden=Boolean(result.personal_mode);
        csrf=result.csrf;setAuth(true);updateToday(result.today);$('owner-name').textContent=result.display_name+"’s workspace";$('owner-avatar').textContent=result.display_name[0].toUpperCase();
        checkRecovery();queryKey=queryParams().toString();await fetchNotes(queryKey,++queryGeneration);
      }else{
        setupRequired=result.setup_required;setAuth(false);$('auth-title').textContent=setupRequired?'A space of your own.':'Welcome back.';
        $('auth-description').textContent=setupRequired?'Create your private workspace on your Raspberry Pi.':'Sign in to your notes on your Raspberry Pi.';
        $('name-label').hidden=!setupRequired;$('setup-label').hidden=!setupRequired||Boolean(setupToken);$('setup-code').value=setupToken;
        $('password-help').hidden=!setupRequired;$('auth-password').minLength=setupRequired?12:1;
        $('auth-password').autocomplete=setupRequired?'new-password':'current-password';$('auth-submit').textContent=setupRequired?'Create workspace':'Sign in';
      }
    }catch(error){$('connection-status').hidden=false;$('connection-status').textContent=error.message+' Reload this page to try again.';}
  }
  $('auth-form').onsubmit=async event=>{
    event.preventDefault();$('auth-submit').disabled=true;$('auth-error').hidden=true;
    const body=setupRequired?{password:$('auth-password').value,display_name:$('auth-name').value,token:$('setup-code').value}:{password:$('auth-password').value};
    try{await api(setupRequired?'/api/setup':'/api/login',{method:'POST',body:JSON.stringify(body)});$('auth-password').value='';setupRequired=false;await init();}
    catch(error){$('auth-error').hidden=false;$('auth-error').textContent=error.message;}
    finally{$('auth-submit').disabled=false;}
  };
  setInterval(()=>{if(loggedIn){const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());if(today!==TODAY){updateToday(today);render();}}},30000);
  init();
})();
