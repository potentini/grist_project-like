/* Pure transaction planning for the preview meeting editor. No network or DOM. */
window.MeetingPointPlan = (() => {
  const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
  const values = v => Array.isArray(v) ? v.filter((x, i) => !(i === 0 && x === 'L')) : v == null || v === '' ? [] : [v];
  const fieldsByKind = { projects: 'Projets', streams: 'Chantiers', tasks: 'Taches' };
  function make(ctx) {
    const { kind, record, fields, state, fresh, cfg, col } = ctx;
    const actions = [], expected = [];
    const table = k => { const t = cfg(k).table; if (!t) throw Error('Mappez la table ' + k + '.'); return t; };
    const requireColumn = (k, field, types) => {
      const m = col(k, field);
      if (!m || m.isFormula || (types && !types.some(t => t instanceof RegExp ? t.test(m.type) : t === m.type)))
        throw Error(`Mappez un champ ${k}.${field} de données modifiable${types ? ' avec un type compatible' : ''}.`);
      return m;
    };
    const requireRow = (k, id) => {
      const row = (fresh[k] || []).find(r => r.id === id);
      if (!row || ctx.inactive(k, row)) throw Error('Un élément a disparu ou a été archivé : ' + k + ' #' + id + '.');
      return row;
    };
    const code = (k, row) => {
      const value = row[cfg(k).fields?.Code];
      if (!value || (fresh[k] || []).filter(r => String(r[cfg(k).fields?.Code]) === String(value) && r.id !== row.id).length)
        throw Error('Un code unique est nécessaire dans ' + table(k) + ' pour ce lien Texte ; préférez une référence Grist.');
      return value;
    };
    const encode = (source, field, target, rows, list) => {
      const m = requireColumn(source, field, ['Text', /^Ref:/, /^RefList:/]);
      if (/^Ref(List)?:/.test(m.type)) {
        if (m.type.split(':')[1] !== table(target)) throw Error('La référence ' + source + '.' + field + ' pointe vers une autre table.');
        if (m.type.startsWith('Ref:') && rows.length > 1) throw Error('Référence simple : un seul rattachement est autorisé dans ' + source + '.' + field + '.');
        return m.type.startsWith('RefList:') ? ['L', ...rows.map(r => r.id)] : rows[0]?.id || 0;
      }
      return rows.map(r => code(target, r)).join(list ? ', ' : '');
    };
    const nextId = k => Math.max(0, ...(fresh[k] || []).map(r => r.id)) + 1;
    const baseExpected = (k, id, delta, base, extra = []) => {
      const current = requireRow(k, id), before = {};
      for (const name of new Set([...Object.keys(delta), ...extra])) {
        if (!same(current[name], base[name])) throw Error(`La ligne ${table(k)} #${id} a changé. Le brouillon est conservé ; rouvrez l’élément pour comparer.`);
        before[name] = current[name] ?? '';
      }
      expected.push({ kind: k, id, before });
    };
    const primaryId = record?.id ?? nextId(kind);
    const primaryCode = cfg(kind).fields?.Code;
    if (!record && primaryCode && fields[primaryCode] && (fresh[kind] || []).some(row => String(row[primaryCode]) === String(fields[primaryCode])))
      throw Error('Le code de la nouvelle ligne est déjà utilisé. Modifiez ce code dans le formulaire avant de réessayer.');
    if (record) baseExpected(kind, primaryId, fields, record);
    actions.push([record ? 'UpdateRecord' : 'AddRecord', table(kind), primaryId, { ...fields }]);
    if (kind === 'points') {
      for (const [target, field] of Object.entries(fieldsByKind))
        if (col('points', field)?.type.startsWith('Ref:') && state.refs.filter(r => r.kind === target).length > 1)
          throw Error('Référence simple : un seul rattachement est autorisé dans points.' + field + '.');
      for (const ref of state.refs) if (!(state.baseRefs || []).some(r => r.kind === ref.kind && r.id === ref.id)) requireRow(ref.kind, ref.id);
      const origin = col('points', 'NoteOrigine');
      if (record && origin && Object.hasOwn(fields, origin.colId) && !same(fields[origin.colId], record[origin.colId])) {
        const targetIds = values(fields[origin.colId]);
        const targetNotes = (fresh.notes || []).filter(row => targetIds.some(v => /^Ref/.test(origin.type) ? Number(v) === row.id : String(v) === String(row[cfg('notes').fields?.Code])));
        if (targetNotes.length !== 1) throw Error('La réunion d’origine du point ne peut pas être résolue.');
        const actionPoint = col('actions', 'PointOrigine');
        for (const action of fresh.actions || []) if (actionPoint && values(action[actionPoint.colId]).some(v =>
          /^Ref/.test(actionPoint.type) ? Number(v) === record.id : String(v) === String(record[cfg('points').fields?.Code]))) {
          const am = requireColumn('actions', 'NoteOrigine');
          const delta = { [am.colId]: encode('actions', 'NoteOrigine', 'notes', targetNotes, false) };
          baseExpected('actions', action.id, delta, action);
          actions.push(['UpdateRecord', table('actions'), action.id, delta]);
        }
      }
      return { version: 1, actions, expected, primaryId, newPrimary: !record };
    }
    if (state.blocks.length && table('points') === table('notes')) throw Error('Réunions et Points doivent utiliser deux tables distinctes.');
    const meeting = record ? requireRow('notes', primaryId) : { id: primaryId, ...fields };
    let pointId = nextId('points');
    const usedCodes = new Set((fresh.points || []).map(row => String(row[cfg('points').fields?.Code])));
    let order = Math.max(0, ...(fresh.points || []).map(row => Number(row[cfg('points').fields?.Ordre]) || 0));
    const forwardsByMeeting = new Map();
    for (const block of state.blocks) {
      const delta = {}, base = block.base || {};
      const id = block.id ?? pointId++;
      for (const destination of block.forwards || []) {
        if (destination === primaryId) throw Error('Choisissez une autre réunion pour ce renvoi.');
        if (!forwardsByMeeting.has(destination)) forwardsByMeeting.set(destination, new Set());
        forwardsByMeeting.get(destination).add(id);
      }
      const existing = block.id ? requireRow('points', block.id) : null;
      if (existing) {
        const origin = col('points', 'NoteOrigine');
        if (!origin || !values(existing[origin.colId]).some(v => /^Ref/.test(origin.type)
          ? Number(v) === primaryId : String(v) === String(meeting[cfg('notes').fields?.Code])))
          throw Error('Le point a changé de réunion. Le brouillon est conservé ; rouvrez les éléments concernés.');
      }
      const addText = (field, value, required = false) => {
        const m = col('points', field);
        if (existing && same(value, base[m?.colId] ?? '')) return;
        if (!existing && !required && !value && (!m || m.isFormula || m.type !== 'Text')) return;
        const column = requireColumn('points', field, ['Text']);
        delta[column.colId] = value;
      };
      if (!block.title.trim()) throw Error('Donnez un titre à chaque point.');
      addText('Titre', block.title, true);
      addText('Contenu', block.content, true);
      addText('Decision', block.decision);
      for (const [target, field] of Object.entries(fieldsByKind)) {
        const refs = block.refs.filter(r => r.kind === target);
        const baseRefs = (block.baseRefs || []).filter(r => r.kind === target);
        if (existing && same(refs, baseRefs)) continue;
        if (existing && block.lockedRefs?.includes(target)) throw Error('Un rattachement existant n’est pas résolu : ' + field + '.');
        if (!existing && !refs.length) {
          const m = col('points', field);
          // An explicit empty association must not inherit a data-column initial formula.
          if (m && !m.isFormula && (m.type === 'Text' || m.type === 'RefList:' + table(target) || m.type === 'Ref:' + table(target)))
            delta[m.colId] = encode('points', field, target, [], true);
          continue;
        }
        const selected = refs.map(ref => requireRow(target, ref.id));
        const column = requireColumn('points', field, ['Text', /^Ref:/, /^RefList:/]);
        delta[column.colId] = encode('points', field, target, selected, true);
      }
      if (existing) {
        if (!block.base || !block.baseRefs) throw Error('Le point récupéré ne possède pas son état d’origine. Copiez ses textes avant de rouvrir.');
        if (Object.keys(delta).length) {
          const origin = col('points', 'NoteOrigine');
          if (!origin) throw Error('Mappez Points.NoteOrigine.');
          baseExpected('points', block.id, delta, base, [origin.colId]);
          actions.push(['UpdateRecord', table('points'), block.id, delta]);
        }
      } else {
        const origin = requireColumn('points', 'NoteOrigine');
        delta[origin.colId] = encode('points', 'NoteOrigine', 'notes', [meeting], false);
        const cm = col('points', 'Code');
        if (cm && !cm.isFormula && cm.type === 'Text') {
          let n = 1; while (usedCodes.has('D' + String(n).padStart(3, '0'))) n++;
          const value = 'D' + String(n).padStart(3, '0'); usedCodes.add(value); delta[cm.colId] = value;
        }
        const om = col('points', 'Ordre');
        if (om && !om.isFormula && ['Int', 'Numeric'].includes(om.type)) delta[om.colId] = ++order;
        actions.push(['AddRecord', table('points'), id, delta]);
      }
    }
    if (forwardsByMeeting.size) {
      const column = requireColumn('notes', 'PointsReportes', ['RefList:' + table('points')]);
      for (const [id, pointIds] of forwardsByMeeting) {
        const destination = requireRow('notes', id);
        const existing = values(destination[column.colId]).map(Number).filter(Boolean);
        if ([...pointIds].every(pointId => existing.includes(pointId))) continue;
        const delta = { [column.colId]: ['L', ...new Set([...existing, ...pointIds])] };
        baseExpected('notes', id, delta, destination);
        actions.push(['UpdateRecord', table('notes'), id, delta]);
      }
    }
    return { version: 1, actions, expected, primaryId, newPrimary: !record };
  }
  function inspect(plan, fresh, tableKind) {
    if (!plan || plan.version !== 1 || !Array.isArray(plan.actions) || !Array.isArray(plan.expected)) return 'conflict';
    const rowFor = (table, id) => (fresh[tableKind(table)] || []).find(r => r.id === id);
    const applied = plan.actions.every(([op, table, id, fields]) => {
      const row = rowFor(table, id);
      return row && ['AddRecord', 'UpdateRecord'].includes(op) && Object.entries(fields).every(([name, value]) => same(row[name], value));
    });
    if (applied) return 'committed';
    if (plan.actions.some(([op, table, id]) => op === 'AddRecord' && rowFor(table, id))) return 'conflict';
    const unchanged = plan.expected.every(({ kind, id, before }) => {
      const row = (fresh[kind] || []).find(r => r.id === id);
      return row && Object.entries(before).every(([name, value]) => same(row[name], value));
    });
    return unchanged ? 'retry' : 'conflict';
  }
  return { make, inspect };
})();
