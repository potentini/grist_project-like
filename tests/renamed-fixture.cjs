module.exports = fixture=>{
 const name=localStorage.getItem('notes-name')||'Notes';
 const db=structuredClone(fixture), kinds=['projects','streams','tasks','notes','actions'];
 window.writes=[];window.failures=[];window.testDb=db;
 const mapping=Object.fromEntries(kinds.map((k,i)=>[k,{table:fixture.tables[i].tableId,fields:Object.fromEntries(fixture.meta.filter(c=>c.parentId===i+1).map(c=>[c.colId,c.colId]))}]));
 if(localStorage.getItem('stale-column')==='1'){mapping.notes.table=name;mapping.notes.fields.Contenu='Notes';}
 window.addNativeNote=()=>db.data.notes.push({id:99,Code:'N099',Titre:'Réunion créée dans Grist'});
 window.renameNoteColumn=()=>{const c=db.meta.find(c=>c.parentId===4&&c.colId==='Contenu');c.colId='CompteRendu';for(const row of db.data.notes){row.CompteRendu=row.Contenu;delete row.Contenu}};
 window.breakRef=()=>{const c=db.meta.find(c=>c.table==='Actions'&&c.colId==='NoteOrigine');c.type='Ref:Notes'};
 let opts=JSON.parse(localStorage.getItem('opts')||'null')||{projectWorkspaceMappingV1:mapping};let cb;
 const rename=newName=>{
  const t=db.tables.find(t=>t.id===4),old=t.tableId;t.tableId=newName;t.label=newName;
  for(const c of db.meta){if(c.table===old)c.table=newName;if(c.type?.endsWith(':'+old))c.type=c.type.replace(':'+old,':'+newName)}
  localStorage.setItem('notes-name',newName);
 };
 rename(name);window.renameNotes=rename;
 const find=table=>{const t=db.tables.find(t=>t.tableId===table);if(!t)throw Error("[Sandbox] KeyError '"+table+"'");return db.data[kinds[t.id-1]]};
 window.grist={ready(){},onOptions(f){cb=f;f(opts)},onRecords(){},selectedTable:{getTableId:async()=>null},getOption:async key=>opts[key],setOption:async(key,value)=>{opts={...opts,[key]:value};localStorage.setItem('opts',JSON.stringify(opts));cb(opts)},docApi:{fetchTable:async table=>table==='_grist_Tables'?db.tables:table==='_grist_Tables_column'?db.meta:find(table),applyUserActions:async actions=>{const retValues=[];for(const [op,table,id,fields] of actions){const rows=find(table);for(const key of Object.keys(fields)){if(!db.meta.some(c=>c.table===table&&c.colId===key))throw Error("[Sandbox] KeyError '"+key+"'")}if(op==='AddRecord')rows.push({id:Math.max(0,...rows.map(r=>r.id))+1,...fields});else if(op==='UpdateRecord')Object.assign(rows.find(r=>r.id===id),fields);retValues.push(op==='AddRecord'?rows.at(-1).id:null);window.writes.push([op,table,id,fields])}return {retValues}}}};
};
