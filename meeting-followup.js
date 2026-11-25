/* Read-only meeting follow-up. No document writes or changes to the host filters. */
(() => {
  window.createMeetingFollowup = (ctx) => {
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const unique = rows => [...new Map(rows.map(row => [row.id,row])).values()];
    const dialog = document.createElement('dialog');
    dialog.id = 'meetingFollowup';
    dialog.setAttribute('aria-labelledby','meetingFollowupTitle');
    dialog.innerHTML = `
      <div class="followup-header"><h2 id="meetingFollowupTitle">Suivi des notes et réunions</h2><button id="meetingFollowupClose" type="button">Fermer</button></div>
      <p class="followup-hint">Ce suivi utilise ses propres critères ; les filtres de la liste ne s’y appliquent pas.</p>
      <div class="followup-controls">
        <label>Suivi par<select id="meetingFollowupMode"><option value="instance">Instance</option><option value="project">Projet</option></select></label>
        <label class="followup-target"><span id="meetingFollowupTargetLabel">Instance</span><select id="meetingFollowupTarget"></select></label>
        <label class="followup-search">Rechercher<input id="meetingFollowupSearch" type="search" placeholder="Dans les échanges…" /></label>
        <label>Ordre<select id="meetingFollowupOrder"><option value="desc">Plus récent d’abord</option><option value="asc">Plus ancien d’abord</option></select></label>
        <label class="followup-archived"><input id="meetingFollowupArchived" type="checkbox" /> Inclure les archivés</label>
      </div>
      <p id="meetingFollowupStatus" role="status" aria-live="polite"></p>
      <div id="meetingFollowupBody" tabindex="0" aria-label="Échanges et points de discussion"></div>`;
    document.body.append(dialog);
    const $ = id => dialog.querySelector('#meetingFollowup'+id);
    const mode=$('Mode'), target=$('Target'), search=$('Search'), order=$('Order'), includeArchived=$('Archived'), body=$('Body'), status=$('Status');
    let returnFocus=null, returnScroll=null, navigating=false;
    const available = (kind,row) => includeArchived.checked || !ctx.archived(kind,row);
    const notes = () => (ctx.data().notes||[]).filter(row=>available('notes',row));
    const points = () => (ctx.data().points||[]).filter(row=>available('points',row));
    function instances(note) {
      const meta=ctx.column('notes','Instance');
      return ctx.values(ctx.value('notes',note,'Instance')).filter(v=>v!=null && v!==0 && String(v).trim()).map(value=>({
        key: /^Ref/.test(meta?.type||'') ? `ref:${meta.type.split(':')[1]}:${value}` : `text:${String(value).trim()}`,
        label: /^Ref/.test(meta?.type||'') ? ctx.referenceText(meta,value,null) : String(value).trim(),
      }));
    }
    function dateInfo(note) {
      const raw=note && (ctx.dateText(ctx.value('notes',note,'Date')) || ctx.display('notes',note,'DateSource'));
      if(!raw)return {label:'Date non renseignée',time:null};
      const iso=String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/), fr=String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      const parts=iso ? [iso[1],iso[2],iso[3]] : fr ? [fr[3],fr[2],fr[1]] : null;
      if(!parts)return {label:String(raw),time:null};
      const time=Date.UTC(+parts[0],+parts[1]-1,+parts[2]), parsed=new Date(time);
      if(parsed.getUTCFullYear()!==+parts[0] || parsed.getUTCMonth()!==+parts[1]-1 || parsed.getUTCDate()!==+parts[2])return {label:String(raw),time:null};
      return {label:`${parts[2]}/${parts[1]}/${parts[0]}`,time};
    }
    function sourceNote(point) { return ctx.targets('points',point,'NoteOrigine')[0] || null; }
    function explicitPointLinks(point) {
      return ['Projets','Chantiers','Taches'].some(f=>ctx.values(ctx.value('points',point,f)).some(v=>v!==0 && String(v??'').trim()));
    }
    function pointScope(point,note) {
      const direct=ctx.pointProjects(point);
      return {projects:unique(direct.length || explicitPointLinks(point) ? direct : note ? ctx.noteProjects(note) : []), inherited:!explicitPointLinks(point) && !!note};
    }
    function metadata(kind,row,fields) {
      return fields.map(field=>{
        const targetKind={Projet:'projects',Projets:'projects',Chantier:'streams',Chantiers:'streams',Tache:'tasks',Taches:'tasks'}[field];
        const value=targetKind
          ? ctx.targets(kind,row,field).map(target=>ctx.title(targetKind,target)).join(', ') || (ctx.values(ctx.value(kind,row,field)).some(v=>v!==0 && String(v??'').trim())?'Rattachement non retrouvé':'')
          : ctx.display(kind,row,field);
        return value ? `${ctx.fieldLabel(kind,field)} : ${value}` : '';
      }).filter(Boolean).join(' · ');
    }
    function entries() {
      const result=[], meetingRows=notes(), pointRows=points();
      const byNote=new Map();
      for(const point of pointRows) {
        const note=sourceNote(point), key=note?.id ?? 0;
        if(!byNote.has(key))byNote.set(key,[]);
        byNote.get(key).push(point);
      }
      for(const note of meetingRows) {
        const associated=byNote.get(note.id)||[], projects=unique(ctx.noteProjects(note));
        const content=ctx.display('notes',note,'Contenu');
        if(content || projects.length || !associated.length)result.push({kind:'notes',row:note,note,projects,content,decision:'',inherited:false});
        const reported = (ctx.forwardedPoints?.(note) || []).filter(point => available("points", point) && !associated.some(row => row.id === point.id));
        for(const point of [...associated, ...reported]) {
          const scope=pointScope(point,note);
          result.push({kind:'points',row:point,note,reported:reported.includes(point),...scope,content:ctx.display('points',point,'Contenu'),decision:ctx.display('points',point,'Decision')});
        }
      }
      // Orphan points remain discoverable by their own project, with explicit missing provenance.
      for(const point of byNote.get(0)||[]) {
        const scope=pointScope(point,null);
        result.push({kind:'points',row:point,note:null,...scope,content:ctx.display('points',point,'Contenu'),decision:ctx.display('points',point,'Decision')});
      }
      return result;
    }
    function populateTarget(preferred) {
      const choices=new Map();
      if(mode.value==='instance') {
        let without=false;
        for(const note of notes()) {
          const values=instances(note);
          if(!values.length)without=true;
          values.forEach(instance=>choices.set(instance.key,instance.label));
        }
        if(without)choices.set('none','Sans instance');
      } else {
        for(const project of ctx.data().projects||[])choices.set(String(project.id),ctx.title('projects',project));
      }
      const sorted=[...choices].sort((a,b)=>a[0]==='none'?1:b[0]==='none'?-1:a[1].localeCompare(b[1],'fr',{numeric:true}));
      target.innerHTML=sorted.map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('');
      if(preferred && choices.has(String(preferred)))target.value=String(preferred);
      $('TargetLabel').textContent=mode.value==='instance'?'Instance':'Projet';
      target.dispatchEvent(new Event('change'));
    }
    function sourceButton(kind,id,label) {
      return `<button type="button" class="followup-source" data-followup-kind="${kind}" data-followup-id="${id}">${esc(label)}</button>`;
    }
    function compareMeetings(a,b) {
      const x=dateInfo(a.note).time,y=dateInfo(b.note).time;
      if(x===null && y!==null)return 1;
      if(y===null && x!==null)return -1;
      if(x!==y)return order.value==='asc'?x-y:y-x;
      return (a.note?.id??0)-(b.note?.id??0);
    }
    function render() {
      let selected=entries().filter(entry=> mode.value==='instance'
        ? entry.note && (target.value==='none' ? !instances(entry.note).length : instances(entry.note).some(i=>i.key===target.value))
        : entry.projects.some(project=>String(project.id)===target.value));
      const query=ctx.normalize(search.value);
      if(query)selected=selected.filter(entry=>ctx.normalize([
        ctx.title(entry.kind,entry.row),entry.content,entry.decision,entry.note?ctx.title('notes',entry.note):'',dateInfo(entry.note).label,
        entry.note?metadata('notes',entry.note,['Code','Instance','ParticipantsInternes','ParticipantsExternes','Type','Etat']):'',
        metadata(entry.kind,entry.row,entry.kind==='notes'?['Chantiers','Taches']:['Projets','Chantiers','Taches']),
        ...entry.projects.map(p=>ctx.title('projects',p)),
      ].join(' ')).includes(query));
      const meetingIds=new Set(selected.filter(e=>e.note).map(e=>e.note.id)), pointIds=new Set(selected.filter(e=>e.kind==='points').map(e=>e.row.id));
      status.textContent=`${meetingIds.size} réunion(s) · ${pointIds.size} point(s) de discussion`;
      // Sort meetings globally; project groups belong inside their source meeting.
      const meetings=new Map();
      for(const entry of selected) {
        const noteKey=entry.note?.id??0;
        if(!meetings.has(noteKey))meetings.set(noteKey,{note:entry.note,groups:new Map(),entries:[]});
        const meeting=meetings.get(noteKey);
        meeting.entries.push(entry);
        const keys=mode.value==='instance' ? entry.projects.length?entry.projects.map(p=>[String(p.id),ctx.title('projects',p)]):[['none','Sans projet / Notes générales']] : [['project',null]];
        for(const [key,label] of keys) {
          if(!meeting.groups.has(key))meeting.groups.set(key,{label,entries:[]});
          meeting.groups.get(key).entries.push(entry);
        }
      }
      body.innerHTML=[...meetings.values()].sort(compareMeetings).map(meeting=>{
          const note=meeting.note, when=dateInfo(note);
          const meetingMeta=note?metadata('notes',note,['Code','Instance','Type','ParticipantsInternes','ParticipantsExternes','Etat']):'Réunion d’origine non renseignée ou introuvable';
          const groups=[...meeting.groups.values()].sort((a,b)=>a.label===null?0:a.label.localeCompare(b.label,'fr',{numeric:true})).map(group=>{
          const cards=group.entries.sort((a,b)=>(a.kind==='notes'?-1:b.kind==='notes'?1:Number(ctx.value('points',a.row,'Ordre')||a.row.id)-Number(ctx.value('points',b.row,'Ordre')||b.row.id))).map(entry=>{
            const heading=entry.kind==='notes'?'Notes de réunion':ctx.title('points',entry.row);
            const links=metadata(entry.kind,entry.row,entry.kind==='notes'?['Chantiers','Taches']:['Projets','Chantiers','Taches']);
            return `<article class="followup-entry" data-followup-entry="${entry.kind}:${entry.row.id}">
              <div class="followup-entry-heading"><h5>${esc(heading)}</h5>${entry.kind==='points'?sourceButton('points',entry.row.id,'Ouvrir le point'):''}</div>
              ${links?`<p class="followup-meta">${esc(links)}</p>`:''}
              ${entry.reported?'<p class="followup-meta">Point reporté</p>':''}
              ${entry.inherited&&entry.projects.length?'<p class="followup-meta">Projet associé via la réunion</p>':''}
              ${ctx.archived(entry.kind,entry.row)?'<p class="followup-meta">Archivé</p>':''}
              ${entry.content?`<div class="followup-text">${esc(entry.content)}</div>`:entry.kind==='notes'?'<p class="followup-meta">Aucune note générale renseignée.</p>':''}
              ${entry.decision?`<p class="followup-decision"><strong>Décision</strong><span class="followup-text">${esc(entry.decision)}</span></p>`:''}
            </article>`;
          }).join('');
          return `<section class="followup-group">${group.label?`<h3>${esc(group.label)}</h3>`:''}${cards}</section>`;
          }).join('');
          return `<section class="followup-meeting" data-followup-meeting="${note?.id??0}">
            <div class="followup-meeting-heading"><h4>${esc(when.label)} — ${esc(note?ctx.title('notes',note):'Réunion non retrouvée')}</h4>${note?sourceButton('notes',note.id,'Ouvrir la réunion'):''}</div>
            <p class="followup-meta">${esc(meetingMeta)}</p>
            ${note&&ctx.archived('notes',note)?'<p class="followup-meta">Réunion archivée</p>':''}
            ${mode.value==='project'&&note&&!meeting.entries.some(e=>e.kind==='notes')?'<p class="followup-meta">Réunion associée via ses points de discussion</p>':''}${groups}</section>`;
        }).join('') || '<p class="empty">Aucune note ni aucun point pour ces critères.</p>';
      if(selected.some(e=>e.projects.length>1))status.textContent+=' · Un élément lié à plusieurs projets peut apparaître dans plusieurs groupes.';
      if(mode.value==='instance') {
        const orphans=points().filter(point=>!sourceNote(point)).length;
        if(orphans)status.textContent+=` · ${orphans} point(s) sans réunion retrouvée ne peuvent pas être classés par instance.`;
      }
      body.scrollTop=0;
    }
    function open(button) {
      if(ctx.view()!=='notes')return;
      if(ctx.busy()){ctx.message('Terminez la modification en cours avant d’ouvrir le suivi.');return;}
      returnFocus=button;
      returnScroll=['list','detail'].map(id=>[id,document.getElementById(id).scrollTop]);
      navigating=false;search.value='';order.value='desc';includeArchived.checked=ctx.showArchived();
      const selected=ctx.selection(), row=(ctx.data()[selected?.k]||[]).find(r=>r.id===selected?.id);
      const note=selected?.k==='notes'?row:selected?.k==='points'&&row?sourceNote(row):null;
      const currentInstance=note&&instances(note)[0];
      const project=row&&ctx.projectOf(selected.k,row);
      const canInstance=!!ctx.config('notes').fields?.Instance;
      mode.querySelector('[value=instance]').disabled=!canInstance;
      dialog.querySelector('.followup-hint').textContent='Ce suivi utilise ses propres critères ; les filtres de la liste ne s’y appliquent pas.' + (canInstance?'':' Le champ Instance n’est pas mappé : seul le suivi par projet est disponible.');
      mode.value=canInstance&&(currentInstance||!project)?'instance':'project';
      populateTarget(mode.value==='instance'?currentInstance?.key:project?.id);
      dialog.showModal();
      mode.focus();
    }
    document.addEventListener('click',event=>{
      const button=event.target.closest('[data-meeting-followup]');
      if(button){event.preventDefault();open(button);}
    });
    $('Close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{
      target.closest('.reference-picker')?.dispatchEvent(new Event('pickerclose'));
      if(!navigating) {
        for(const [id,top] of returnScroll||[])document.getElementById(id).scrollTop=top;
        if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
      }
    });
    ctx.searchableSelect(target, {label:'Instance ou projet', listId:'meetingFollowupTargetOptions', placeholder:'Choisir ou rechercher…', floating:true});
    mode.onchange=()=>populateTarget();
    target.onchange=render;order.onchange=render;search.oninput=render;
    includeArchived.onchange=()=>populateTarget(target.value);
    body.onclick=event=>{
      const button=event.target.closest('[data-followup-kind]');
      if(!button)return;
      const kind=button.dataset.followupKind,id=Number(button.dataset.followupId);
      if(!['notes','points'].includes(kind)||!(ctx.data()[kind]||[]).some(row=>row.id===id))return;
      navigating=true;dialog.close();ctx.openRecord(kind,id);
    };
  };
})();
