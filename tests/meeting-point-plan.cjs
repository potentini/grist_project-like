const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fixture = require('./mentions-fixture.cjs');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../meeting-point-plan.js'), 'utf8'), sandbox);
const planner = sandbox.window.MeetingPointPlan;
for (const refs of [true, false]) {
  const db = fixture.make(refs), kinds = ['projects', 'streams', 'tasks', 'notes', 'actions', 'points'];
  // Real documents often calculate the displayed meeting title and optional point fields.
  for (const [table, field] of [['Notes', 'Titre'], ['Points', 'Code'], ['Points', 'Decision']])
    db.meta.find(m => m.table === table && m.colId === field).isFormula = true;
  const cfg = k => ({ table: db.tables[kinds.indexOf(k)].tableId, fields: Object.fromEntries(
    db.meta.filter(m => m.table === db.tables[kinds.indexOf(k)].tableId).map(m => [m.colId, m.colId])) });
  const col = (k, f) => db.meta.find(m => m.table === cfg(k).table && m.colId === f);
  const ctx = { kind: 'notes', record: null, fields: { Code: 'N003', Nom: 'Séance libre', Contenu: '' },
    state: { blocks: [{ id: null, title: 'Sujet', content: 'Échanges', decision: '', refs: [] }] },
    fresh: db.data, cfg, col, inactive: () => false };
  const plan = planner.make(ctx), added = plan.actions[1][3];
  assert.equal(plan.actions.length, 2);
  assert.equal(added.NoteOrigine, refs ? 3 : 'N003');
  for (const field of ['Code', 'Decision']) assert.equal(Object.hasOwn(added, field), false);
  assert.equal(Object.hasOwn(plan.actions[0][3], 'Titre'), false);
  for (const field of ['Projets', 'Chantiers', 'Taches'])
    assert.equal(JSON.stringify(added[field]), JSON.stringify(refs ? ['L'] : ''));
  // The same protection also holds when an optional association itself is calculated.
  col('points', 'Projets').isFormula = true;
  assert.equal(Object.hasOwn(planner.make(ctx).actions[1][3], 'Projets'), false);
  if (refs) {
    db.meta = db.meta.filter(m => !(m.table === 'Notes' && m.colId === 'Code'));
    ctx.fields = { Nom: 'Sans code', Contenu: '' };
    assert.equal(planner.make(ctx).actions[1][3].NoteOrigine, 3);
    col('points', 'Projets').isFormula = false;
    col('points', 'Projets').type = 'Ref:Projets';
    assert.equal(planner.make(ctx).actions[1][3].Projets, 0);
    ctx.state.blocks[0].refs = [{kind:'projects', id:1}];
    assert.equal(planner.make(ctx).actions[1][3].Projets, 1);
    ctx.state.blocks[0].refs.push({kind:'projects', id:2});
    assert.throws(() => planner.make(ctx), /un seul rattachement/);
  }
}
console.log('PASS calculated meeting title and optional point fields, explicit empty associations, native origin without a code');
