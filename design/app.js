(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const TODAY = '2026-10-22';
  const STORE = 'daynote-design-v1';
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
  const seed = () => {
    const make = (id,date,time,title,body,color,label,extra={}) => ({id,date,time,title,body,color,label,pinned:false,archived:false,deleted:false,items:[],...extra});
    return [
      make('morning',TODAY,'09:15','A slower morning','Open the windows. Make a good cup of coffee.\n\nA small reminder to leave a little breathing room in the day.','sand','Personal',{pinned:true}),
      make('week-list',TODAY,'11:40','Little things, this week','','sage','Personal',{items:[{text:'Pick up a new notebook',done:true},{text:'Call home',done:false},{text:'Take a walk without my phone',done:false},{text:'Try that new coffee place',done:false}]}),
      make('idea',TODAY,'14:05','An idea worth keeping','What if finding an old thought felt as easy as remembering the day?\n\nLess organizing. More remembering.','plain','Ideas'),
      make('project','2026-10-21','16:30','A few thoughts on the project','Keep it simple enough to use every day.\n\n• A quick place to capture things\n• Dates that make sense\n• Everything in one quiet space','lavender','Work',{pinned:true}),
      make('reading','2026-10-21','20:10','From today’s reading','“Almost everything will work again if you unplug it for a few minutes, including you.”\n\n— Anne Lamott','plain','Personal'),
      make('weekend','2026-10-21','08:25','For the weekend','Breakfast somewhere new. A long walk. Maybe finally finish the book on my bedside table.','rose','Ideas'),
      make('home','2026-10-18','10:05','Around the house','','plain','Personal',{items:[{text:'Water the plants',done:true},{text:'Clear the desk',done:true},{text:'Sort the drawer of cables',done:false}]}),
      make('october','2026-10-02','18:20','October, a little more intentionally','Make room for the things I keep saying I want to do. Start with one small thing each day.','blue','Personal'),
      make('bookmarks','2026-10-01','12:00','Things to look into','Local-first apps\nA better backup routine\nA shelf for the corner of the room','plain','Ideas'),
      make('september','2026-09-30','17:45','September in a sentence','A busy month, with some very good small moments. More of those, please.','sage','Personal'),
      make('garden','2026-09-14','09:30','A tiny balcony garden','Basil, mint, and something that flowers. Start small. Find pots with drainage.','sand','Ideas'),
      make('archived','2026-10-14','15:10','Notes from the last catch-up','The first version should feel calm, familiar, and easy to come back to.','lavender','Work',{archived:true}),
      make('deleted','2026-10-12','13:15','An old shopping list','Milk, bread, lemons.','plain','Personal',{deleted:true})
    ];
  };
  let notes = seed();
  try { const stored=JSON.parse(localStorage.getItem(STORE)); if(stored?.version===1 && Array.isArray(stored.notes)) notes=stored.notes; } catch {}
  let state={scope:'all',label:'',group:'day',layout:'grid',range:'all',date:'',search:''};
  let calendarMonth = new Date('2026-10-01T12:00:00Z');
  let draft=null, timer=null, toastTimer=null, mode='normal';
  const unsavedDrafts=new Map();
  const editor=$('editor');
  const dateObject = date => new Date(`${date}T12:00:00Z`);
  const isoDate = date => date.toISOString().slice(0,10);
  const dateFormat = (date,options) => dateObject(date).toLocaleDateString('en-GB',{...options,timeZone:'UTC'});
  const shortDate = date => dateFormat(date,{day:'numeric',month:'short'});
  const longDate = date => dateFormat(date,{day:'numeric',month:'short',year:'numeric'});
  const weekStart = date => {const d=dateObject(date);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return isoDate(d);};
  const weekEnd = date => {const d=dateObject(weekStart(date));d.setUTCDate(d.getUTCDate()+6);return isoDate(d);};
  const notify = message => { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500); };
  function persist(next) {
    try {localStorage.setItem(STORE,JSON.stringify({version:1,notes:next}));notes=next;return true;}
    catch {notify('Browser storage is unavailable. Your change has not been saved.');return false;}
  }
  function updateNote(id,change,message) {
    const next=notes.map(note=>note.id===id?{...note,...change}:note);
    if(persist(next)){render();if(message)notify(message);}
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme=theme;
    $('theme-button').innerHTML=icon(theme==='dark'?'sun':'moon');
    $('theme-button').setAttribute('aria-label',theme==='dark'?'Switch to light appearance':'Switch to dark appearance');
    try{localStorage.setItem('daynote-design-theme',theme);}catch{}
  }
  let savedTheme='light';try{savedTheme=localStorage.getItem('daynote-design-theme')||'light';}catch{}
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
    const label=key===TODAY?'Today':key==='2026-10-21'?'Yesterday':dateFormat(key,{weekday:'long'});
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
    const visible=selectedNotes();
    const titles={all:'All notes',pinned:'Pinned',archive:'Archive',trash:'Trash'};
    $('page-title').textContent=state.label||titles[state.scope];
    $('page-description').textContent=state.scope==='archive'?'Out of the way. Always here when you need them.':state.scope==='trash'?'A second chance for things you let go.':state.scope==='pinned'?'The things you want to keep close.':state.label?'A little space for your '+state.label.toLowerCase()+'.':'A place for everything on your mind.';
    $('all-count').textContent=notes.filter(n=>!n.archived&&!n.deleted).length;
    document.querySelectorAll('[data-scope]').forEach(button=>{button.classList.toggle('active',button.dataset.scope===state.scope&&!state.label);button.setAttribute('aria-current',button.classList.contains('active')?'page':'false');});
    document.querySelectorAll('[data-label]').forEach(button=>button.classList.toggle('active',button.dataset.label===state.label));
    document.querySelectorAll('[data-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.group===state.group)));
    ['grid','list'].forEach(type=>{$(type+'-button').classList.toggle('active',state.layout===type);$(type+'-button').setAttribute('aria-pressed',String(state.layout===type));});
    $('date-filter').value=state.range;$('custom-date').hidden=state.range!=='custom';$('custom-date').value=state.date;
    const hasFilter=Boolean(state.search||state.range!=='all');
    $('filter-summary').hidden=!hasFilter;
    if(hasFilter)$('filter-summary').innerHTML=`<span>${visible.length} ${visible.length===1?'note':'notes'}${state.search?' matching “'+esc(state.search)+'”':''}${state.range==='custom'&&state.date?' · '+longDate(state.date):''}</span><button id="clear-filters">Clear filters</button>`;
    const groups=new Map();visible.forEach(note=>{const key=state.group==='day'?note.date:state.group==='week'?weekStart(note.date):note.date.slice(0,7);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(note);});
    $('notes-feed').innerHTML=groups.size?[...groups].map(([key,items])=>{const [title,date]=groupHeading(key);items.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.date.localeCompare(a.date)||b.time.localeCompare(a.time)||a.id.localeCompare(b.id));return `<section class="note-group"><div class="group-heading"><h2>${title}</h2>${date?`<span class="group-date">${date}</span>`:''}<span class="group-quantity" aria-label="${items.length} notes">${items.length}</span></div><div class="note-grid ${state.layout==='list'?'list':''}">${items.map(card).join('')}</div></section>`;}).join(''):`<div class="empty-state"><div class="empty-symbol">${icon(state.scope==='trash'?'trash':'notes')}</div><h2>${state.search?'No notes found':state.scope==='trash'?'A clean slate':'A little room for a thought'}</h2><p>${state.search?'Try another word, label, or date.':state.scope==='trash'?'Notes you move to trash will appear here.':'There are no notes in this view yet.'}</p><button class="text-button" id="empty-clear">${hasFilter?'Show all dates':state.scope==='all'?'Create a note':'Go to all notes'}</button></div>`;
    $('composer').hidden=state.scope==='trash';renderCalendar();
  }
  function renderCalendar() {
    $('calendar-title').textContent=calendarMonth.toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
    const year=calendarMonth.getUTCFullYear(),month=calendarMonth.getUTCMonth();
    const first=new Date(Date.UTC(year,month,1,12));const offset=(first.getUTCDay()+6)%7;
    const total=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
    const days=new Set(notes.filter(inScope).filter(n=>!state.label||n.label===state.label).map(n=>n.date));
    $('calendar-days').innerHTML='<span></span>'.repeat(offset)+Array.from({length:total},(_,i)=>{const date=isoDate(new Date(Date.UTC(year,month,i+1,12)));const selected=state.range==='custom'&&state.date===date;return `<button data-date="${date}" class="${date===TODAY?'today ':''}${days.has(date)?'has-notes ':''}${selected?'selected':''}" aria-label="${longDate(date)}${days.has(date)?', has notes':''}" aria-pressed="${selected}">${i+1}</button>`;}).join('');
  }
  function syncNav(){const collapsed=matchMedia('(max-width:780px)').matches&&!$('sidebar').classList.contains('open');$('sidebar').inert=collapsed;$('sidebar').setAttribute('aria-hidden',String(collapsed));}
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
  $('notes-feed').onclick=event=>{
    if(event.target.closest('#empty-clear')){if(state.search||state.range!=='all')clearFilters();else if(state.scope!=='all'){state.scope='all';state.label='';render();}else openEditor();return;}
    const button=event.target.closest('[data-action]');if(!button)return;
    const note=notes.find(n=>n.id===button.dataset.id);if(!note)return;
    const action=button.dataset.action;
    if(action==='open'){if(note.deleted){notify('Restore this note before editing it.');return;}openEditor(note);}
    if(action==='pin')updateNote(note.id,{pinned:!note.pinned},note.pinned?'Note unpinned':'Pinned within its date group');
    if(action==='archive')updateNote(note.id,{archived:!note.archived},note.archived?'Note returned to all notes':'Note archived');
    if(action==='trash')updateNote(note.id,{deleted:true},'Note moved to Trash');
    if(action==='restore')updateNote(note.id,{deleted:false},'Note restored');
    if(action==='delete'&&confirm('Permanently delete this sample note? This cannot be undone.')){if(persist(notes.filter(n=>n.id!==note.id))){render();notify('Sample note permanently deleted');}}
  };
  $('notes-feed').onchange=event=>{const box=event.target.closest('[data-check]');if(!box)return;const note=notes.find(n=>n.id===box.dataset.check);const items=copy(note.items);items[Number(box.dataset.index)].done=box.checked;updateNote(note.id,{items});};
  function openEditor(note) {
    clearTimeout(timer);
    const base=note||{id:'note-'+Date.now().toString(36),date:TODAY,time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}),title:'',body:'',color:'plain',label:'',pinned:false,archived:false,deleted:false,items:[]};
    draft=copy(unsavedDrafts.get(base.id)||base);
    $('note-title').value=draft.title;$('note-body').value=draft.body;$('note-label').value=draft.label;
    $('save-status').textContent=note?'Saved in this preview':'Not yet saved';
    $('note-date').textContent=`Created ${longDate(draft.date)} · ${draft.time} · India time`;
    $('save-problem').hidden=true;
    renderEditorOptions();renderChecklist();editor.showModal();
    $('note-title').focus();
  }
  function renderEditorOptions() {
    editor.style.background=`var(--card-${draft.color})`;
    $('editor-pin').setAttribute('aria-label',draft.pinned?'Unpin note':'Pin note');
    $('editor-pin').setAttribute('aria-pressed',String(draft.pinned));
    $('editor-pin').style.color=draft.pinned?'var(--text)':'';
    $('editor-archive').setAttribute('aria-label',draft.archived?'Unarchive note':'Archive note');
    $('editor-archive').innerHTML=icon(draft.archived?'restore':'archive');
    $('swatches').innerHTML=['plain','sand','sage','lavender','rose','blue'].map(color=>`<button type="button" class="swatch" data-color="${color}" style="background:var(--card-${color})" aria-label="${color} note color" aria-pressed="${draft.color===color}">${draft.color===color?icon('check'):''}</button>`).join('');
  }
  function renderChecklist() {
    const enabled=draft.kind==='checklist'||draft.items.length>0;
    $('note-body').hidden=enabled;$('checklist-editor').hidden=!enabled;$('add-item').hidden=!enabled;
    $('toggle-checklist').setAttribute('aria-label',enabled?'Switch to text note':'Switch to checklist');
    $('checklist-editor').innerHTML=draft.items.map((item,index)=>`<div class="check-edit-row"><input type="checkbox" aria-label="Complete item ${index+1}" data-edit-check="${index}" ${item.done?'checked':''}><input type="text" aria-label="Checklist item ${index+1}" data-edit-text="${index}" value="${esc(item.text)}"><button type="button" class="icon-button" data-remove-item="${index}" aria-label="Remove item ${index+1}">${icon('close')}</button></div>`).join('');
  }
  function readDraft(){if(!draft)return;draft.title=$('note-title').value;draft.body=$('note-body').value;draft.label=$('note-label').value;}
  const meaningful=note=>note.title.trim()||note.body.trim()||note.items.some(i=>i.text.trim());
  function saveDraft() {
    clearTimeout(timer);if(!draft)return true;readDraft();
    if(!meaningful(draft)&&!draft.deleted){
      if(notes.some(n=>n.id===draft.id)){
        $('save-status').textContent='Empty note · not saved';$('save-problem').hidden=false;
        $('save-problem').innerHTML='<strong>This note is empty</strong><p>Add some text, or move the note to Trash. Your last saved version is still available.</p>';
        return false;
      }
      $('save-status').textContent='Empty note · not saved';return true;
    }
    if(mode!=='normal'){
      unsavedDrafts.set(draft.id,copy(draft));$('save-status').textContent='Unsaved changes';$('save-problem').hidden=false;
      $('save-problem').innerHTML=mode==='error'?'<strong>Could not save your changes</strong><p>Your draft is still open here. Reconnect and try again before closing the app.</p><button type="button" data-recover="retry">Try again</button>':'<strong>Another edit was found</strong><p>The saved note has not been overwritten. Keep your draft as a separate note to preserve both versions.</p><button type="button" data-recover="copy">Save a separate note</button>';
      return false;
    }
    const saved={...copy(draft),items:draft.items.filter(i=>i.text.trim())};
    const exists=notes.some(n=>n.id===draft.id);
    const next=exists?notes.map(n=>n.id===saved.id?saved:n):[...notes,saved];
    if(!persist(next)){unsavedDrafts.set(draft.id,copy(draft));$('save-status').textContent='Not saved';return false;}
    unsavedDrafts.delete(draft.id);$('save-problem').hidden=true;$('save-status').textContent='Saved in this preview';render();return true;
  }
  function scheduleSave(){readDraft();$('save-status').textContent='Saving…';clearTimeout(timer);timer=setTimeout(saveDraft,650);}
  function finishEditor(){const saved=saveDraft();if(!saved){notify('Your draft is still open. Resolve the save message first.');return;}const filtered=state.range!=='all'||state.scope!=='all'||state.label||state.search;if(filtered&&draft&&!selectedNotes().some(n=>n.id===draft.id)&&meaningful(draft))notify('Saved to its original date. Clear filters to see it.');draft=null;editor.close();}
  $('new-note').onclick=()=>openEditor();$('composer').onclick=()=>openEditor();
  $('note-title').oninput=scheduleSave;$('note-body').oninput=scheduleSave;$('note-label').onchange=scheduleSave;
  $('swatches').onclick=event=>{const button=event.target.closest('[data-color]');if(button){draft.color=button.dataset.color;renderEditorOptions();scheduleSave();}};
  $('editor-pin').onclick=()=>{draft.pinned=!draft.pinned;renderEditorOptions();scheduleSave();};
  $('editor-close').onclick=finishEditor;
  $('editor-form').onsubmit=event=>{event.preventDefault();finishEditor();};
  editor.addEventListener('cancel',event=>{event.preventDefault();finishEditor();});
  $('editor-archive').onclick=()=>{draft.archived=!draft.archived;if(saveDraft()){draft=null;editor.close();notify('Note moved');}else draft.archived=!draft.archived;};
  $('editor-trash').onclick=()=>{draft.deleted=true;if(saveDraft()){draft=null;editor.close();notify('Note moved to Trash');}else draft.deleted=false;};
  $('toggle-checklist').onclick=()=>{readDraft();const enabled=draft.kind==='checklist'||draft.items.length;if(enabled){draft.body=draft.items.map(i=>i.text).join('\n');draft.items=[];draft.kind='text';$('note-body').value=draft.body;}else{draft.items=(draft.body?draft.body.split('\n').filter(Boolean):['']).map(text=>({text,done:false}));draft.body='';draft.kind='checklist';$('note-body').value='';}renderChecklist();scheduleSave();};
  $('add-item').onclick=()=>{draft.items.push({text:'',done:false});renderChecklist();$('checklist-editor').querySelectorAll('input[type=text]').item(draft.items.length-1).focus();};
  $('checklist-editor').oninput=event=>{if(event.target.matches('[data-edit-text]')){draft.items[Number(event.target.dataset.editText)].text=event.target.value;scheduleSave();}};
  $('checklist-editor').onchange=event=>{if(event.target.matches('[data-edit-check]')){draft.items[Number(event.target.dataset.editCheck)].done=event.target.checked;scheduleSave();}};
  $('checklist-editor').onclick=event=>{const button=event.target.closest('[data-remove-item]');if(button){draft.items.splice(Number(button.dataset.removeItem),1);renderChecklist();scheduleSave();}};
  $('save-problem').onclick=event=>{const button=event.target.closest('[data-recover]');if(!button)return;if(button.dataset.recover==='copy'){unsavedDrafts.delete(draft.id);draft.id='copy-'+Date.now().toString(36);draft.title=(draft.title||'Untitled note')+' (my version)';$('note-title').value=draft.title;notify('Both versions are preserved in this preview');}mode='normal';$('demo-state').value='normal';saveDraft();};
  $('guide-button').onclick=()=>$('guide').showModal();
  $('guide-close').onclick=()=>$('guide').close();$('start-exploring').onclick=()=>$('guide').close();
  $('demo-state').onchange=event=>mode=event.target.value;
  $('reset-demo').onclick=()=>{if(confirm('Reset sample notes and remove your changes in this design preview?')){if(persist(seed())){unsavedDrafts.clear();state={scope:'all',label:'',group:'day',layout:'grid',range:'all',date:'',search:''};$('search').value='';mode='normal';$('demo-state').value=mode;render();$('guide').close();notify('Sample notes reset');}}};
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!editor.open&&!$('guide').open){event.preventDefault();$('search').focus();}});
  window.addEventListener('beforeunload',event=>{if(editor.open&&draft&&(mode!=='normal'||$('save-status').textContent==='Saving…')){event.preventDefault();event.returnValue='';}});
  render();
})();
