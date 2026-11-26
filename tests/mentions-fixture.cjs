const base = require('../demo.json');
function make(refs = true) {
  const db = structuredClone(base);
  db.data.projects[0].Titre = 'Auto-évaluation Hcéres';
  db.data.projects[1].Titre = 'Projet externe';
  db.data.streams[0].Titre = 'Dossier';
  db.data.streams.push({...db.data.streams[0],id:2,Code:'C002',Titre:'Chantier externe',Projet:'P002'});
  db.data.tasks.push({...db.data.tasks[0],id:2,Code:'T002',Titre:'Tâche externe',Chantier:'C002'});
  db.data.notes[0].Contenu = 'Accueil et tour de table.\n\nLe calendrier doit être confirmé avant vendredi.\n\nProchaine séance lundi.';
  db.data.notes.push({...db.data.notes[0],id:2,Code:'N002',Titre:'Autre réunion',Contenu:'Autres échanges',Projet:'P002',Chantiers:'',Taches:''});
  db.tables.push({id:6,tableId:'Points',label:'Points'});
  for (const [colId,type] of [['Code','Text'],['Titre','Text'],['Contenu','Text'],['Decision','Text'],['NoteOrigine','Text'],['Projets','Text'],['Chantiers','Text'],['Taches','Text'],['Ordre','Numeric'],['Archive','Bool']])
    db.meta.push({id:1000+db.meta.length,parentId:6,table:'Points',colId,label:colId,type,isFormula:false});
  db.data.points=[{id:1,Code:'D001',Titre:'Point existant',Contenu:'Échanges initiaux',Decision:'Décision conservée',NoteOrigine:'N001',Projets:'P001',Chantiers:'',Taches:'',Ordre:1,Archive:false}];
  db.meta.push({id:2000,parentId:5,table:'Actions',colId:'PointOrigine',label:'PointOrigine',type:'Text',isFormula:false});
  db.data.actions[0].PointOrigine='D001';
  db.meta.push({id:2001,parentId:4,table:'Notes',colId:'Nom',label:'Nom',type:'Text',isFormula:false});
  if (refs) {
    const fields={streams:{Projet:'projects'},tasks:{Chantier:'streams'},actions:{Projet:'projects',Chantier:'streams',Tache:'tasks',NoteOrigine:'notes',PointOrigine:'points'},notes:{Projet:'projects',Chantiers:'streams',Taches:'tasks'},points:{NoteOrigine:'notes',Projets:'projects',Chantiers:'streams',Taches:'tasks'}};
    const kinds=['projects','streams','tasks','notes','actions','points'];
    for(const [kind,links] of Object.entries(fields))for(const [field,target] of Object.entries(links)){
      const m=db.meta.find(c=>c.table===db.tables[kinds.indexOf(kind)].tableId&&c.colId===field);
      if(!m)continue;
      const list=['Projets','Chantiers','Taches'].includes(field);
      m.type=(list?'RefList:':'Ref:')+db.tables[kinds.indexOf(target)].tableId;
      for(const row of db.data[kind]){
        const codes=String(row[field]||'').split(',').map(v=>v.trim());
        const ids=db.data[target].filter(r=>codes.includes(r.Code)).map(r=>r.id);
        row[field]=list?['L',...ids]:ids[0]||0;
      }
    }
  }
  return db;
}
function setup(fixture) {
  const kinds=['projects','streams','tasks','notes','actions','points'];
  const doc=new URLSearchParams(location.search).get('doc')||'mentions-doc';
  const db=JSON.parse(sessionStorage.getItem('mentions-db:'+doc)||'null')||structuredClone(fixture);
  const mapping=Object.fromEntries(kinds.map((k,i)=>[k,{table:db.tables[i].tableId,fields:Object.fromEntries(db.meta.filter(c=>c.parentId===i+1).map(c=>[c.colId,c.colId]))}]));
  const kindForTable = table => kinds[db.tables.findIndex(t=>t.tableId===table)] ||
    (table === fixture.teamTable ? 'team' : table === fixture.instanceTable ? 'instances' : undefined);
  const optionStore = fixture.persistOptions ? 'mentions-options:'+doc : null;
  if (fixture.unmappedNoteColumn) delete mapping.notes.fields[fixture.unmappedNoteColumn];
  let opts = (optionStore && JSON.parse(localStorage.getItem(optionStore))) || {projectWorkspaceMappingV1:mapping}, cb;
  window.testDb=db;window.writes=[];window.batches=[];window.reads=0;window.rejectWrite=false;window.loseAck=false;
  window.persistDb=()=>sessionStorage.setItem('mentions-db:'+doc,JSON.stringify(db));
  window.grist={ready(){},onOptions(f){cb=f;f(opts)},onRecords(){},selectedTable:{getTableId:async()=>null},getOption:async k=>opts[k],setOption:async(k,v)=>{opts[k]=v;if(optionStore)localStorage.setItem(optionStore,JSON.stringify(opts));cb(opts)},docApi:{
    getDocName:async()=>doc,
    fetchTable:async table=>{
      window.reads++;
      const kind=kindForTable(table);
      return structuredClone(table==='_grist_Tables'?db.tables:table==='_grist_Tables_column'?db.meta:db.data[kind]||[]);
    },
    applyUserActions:async actions=>{
      if(window.rejectWrite)throw Error('Accès refusé');
      if(window.beforeApply){const fn=window.beforeApply;window.beforeApply=null;fn(actions)}
      const next=structuredClone(db.data),retValues=[];
      for(const [op,table,id,fields]of actions){
        const rows=next[kindForTable(table)];
        if(!rows)throw Error('Table introuvable');
        for(const column of Object.keys(fields)){
          const m=db.meta.find(c=>c.table===table&&c.colId===column);
          if(!m||m.isFormula)throw Error('Colonne absente ou calculée : '+column);
        }
        if(op==='AddRecord'){
          const newId=id??Math.max(0,...rows.map(r=>r.id))+1;
          if(rows.some(r=>r.id===newId))throw Error('Collision d’identifiant');
          rows.push({id:newId,...fields});retValues.push(newId);
        }else if(op==='UpdateRecord'){
          const row=rows.find(r=>r.id===id);if(!row)throw Error('Ligne disparue');Object.assign(row,fields);retValues.push(null);
        }else throw Error('Action non prise en charge');
      }
      db.data=next;window.batches.push(structuredClone(actions));window.writes.push(...structuredClone(actions));window.persistDb();
      if(window.loseAck){window.loseAck=false;throw Error('Réponse réseau perdue après validation')}
      return {retValues};
    },
  }};
}
module.exports={make,setup};
