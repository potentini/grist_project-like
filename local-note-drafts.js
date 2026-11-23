/* Text-only local recovery. This module never writes to Grist. */
window.LocalNoteDrafts = function (form, panel) {
  let session = null;
  let lockedFields = [];
  let locked = false;
  const storage = () => window.localStorage;
  function status(text) { if (session) session.status.textContent = text; }
  function remove(key, expected) {
    if (storage().getItem(key) === expected) storage().removeItem(key);
  }
  function flush() {
    const s = session;
    if (!s || !s.prefix) return;
    try {
      const fields = s.fields.filter(f => f.control.value !== f.base)
        .map(f => ({ field: f.field, ref: f.ref, base: f.base, value: f.control.value }));
      const extension = s.extension?.capture() || null;
      if (!fields.length && !extension) {
        if (s.saved) remove(s.key, s.saved);
        s.saved = null;
        status('Aucune modification de texte à conserver.');
        return true;
      }
      const value = JSON.stringify({ version: extension ? 2 : 1, date: new Date().toISOString(), fields, ...(extension ? { extension } : {}) });
      storage().setItem(s.key, value);
      s.saved = value;
      status('Brouillon local conservé à ' + new Date().toLocaleTimeString('fr-FR') + ' sur ce navigateur. Non enregistré dans Grist.');
      return true;
    } catch {
      status('Brouillon local indisponible (stockage refusé ou plein). Gardez cette saisie ouverte et copiez vos textes avant de quitter.');
      return false;
    }
  }
  form.addEventListener('input', e => {
    if (session?.fields.some(f => f.control === e.target)) flush();
  });
  form.addEventListener('notecomposerchange', flush);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  return {
    start({ scope, table, row, context, fields, extension = null }) {
      session = null;
      panel.replaceChildren();
      panel.hidden = !fields.length;
      if (!fields.length) return;
      const p = document.createElement('p');
      p.setAttribute('role', 'status');
      panel.append(p);
      const prefix = scope ? 'grist_note_draft_v1:' + JSON.stringify([scope, table, row ?? ['new', context]]) + ':' : null;
      session = { prefix, key: prefix + crypto.randomUUID(), fields, status: p, used: [], saved: null, extension };
      if (!prefix) {
        status('Brouillon local indisponible : document Grist non identifié.');
        return;
      }
      status('Les modifications de texte seront conservées sur ce navigateur. Annuler conserve le brouillon ; seul Enregistrer écrit dans Grist.');
      try {
        const prior = [];
        for (let i = 0; i < storage().length; i++) {
          const key = storage().key(i);
          if (!key?.startsWith(prefix)) continue;
          try {
            const raw = storage().getItem(key), draft = JSON.parse(raw);
            if ([1, 2].includes(draft?.version) && Array.isArray(draft.fields) && (draft.fields.length || draft.extension) &&
                draft.fields.every(f => f && typeof f.field === 'string' && typeof f.value === 'string' && typeof f.base === 'string'))
              prior.push({ key, raw, draft });
          } catch { /* An invalid record must not prevent editing. */ }
        }
        prior.sort((a, b) => String(b.draft.date).localeCompare(String(a.draft.date)));
        for (const entry of prior) {
          const box = document.createElement('section');
          box.className = 'note-draft-recovery';
          const caption = document.createElement('p');
          caption.textContent = 'Brouillon retrouvé — ' + (Number.isFinite(Date.parse(entry.draft.date)) ? new Date(entry.draft.date).toLocaleString('fr-FR') : 'date inconnue');
          const compatible = entry.draft.fields.filter(stored => typeof stored.value === 'string' && fields.some(f => f.field === stored.field && f.ref === stored.ref));
          const changed = compatible.some(stored => fields.find(f => f.field === stored.field).base !== stored.base);
          const note = document.createElement('p');
          note.textContent = (changed ? 'Le texte Grist a changé depuis ce brouillon. Comparez-le avec le formulaire avant de reprendre. ' : '') + 'Seuls les textes sont repris ; vérifiez les dates et rattachements, notamment pour une création.';
          const preview = document.createElement('details'), summary = document.createElement('summary'), text = document.createElement('pre');
          summary.textContent = 'Voir les textes du brouillon';
          text.textContent = entry.draft.fields.filter(f => typeof f.value === 'string').map(f => f.field + '\n' + f.value).join('\n\n');
          preview.append(summary, text);
          const recover = document.createElement('button'), discard = document.createElement('button');
          recover.type = discard.type = 'button';
          recover.textContent = 'Reprendre le brouillon';
          recover.disabled = compatible.length !== entry.draft.fields.length ||
            (entry.draft.version === 2 && !extension?.compatible(entry.draft.extension));
          if (entry.draft.version === 2) {
            note.textContent = (changed ? 'Le texte Grist a changé. Comparez avant de reprendre. ' : '') +
              'Ce brouillon contient les points et leurs associations. Les autres dates et rattachements du formulaire restent à vérifier.';
            text.textContent += '\n\n' + (extension?.preview(entry.draft.extension) || JSON.stringify(entry.draft.extension, null, 2));
          }
          if (recover.disabled) note.textContent = 'Le mapping a changé : reprise automatique indisponible. Copiez les textes utiles depuis l’aperçu.';
          discard.textContent = 'Supprimer ce brouillon';
          recover.onclick = () => {
            if (locked) return;
            // Preserve any newer text already typed before choosing an older recovery.
            if (session.saved) {
              session.key = prefix + crypto.randomUUID();
              session.saved = null;
            }
            for (const stored of compatible) fields.find(f => f.field === stored.field).control.value = stored.value;
            if (entry.draft.version === 2) extension.restore(entry.draft.extension);
            session.used.push(entry);
            box.remove();
            flush();
          };
          discard.onclick = () => {
            if (locked) return;
            try { remove(entry.key, entry.raw); box.remove(); }
            catch { status('Impossible de supprimer ce brouillon local.'); }
          };
          box.append(caption, note, preview, recover, discard);
          panel.append(box);
        }
      } catch { status('Brouillon local indisponible : le stockage de ce navigateur est inaccessible.'); }
    },
    flush,
    finish() { flush(); session = null; panel.hidden = true; },
    lock(value) {
      locked = value;
      if (locked) lockedFields = session?.fields || [];
      for (const f of lockedFields) f.control.readOnly = locked;
      if (!locked) lockedFields = [];
    },
    saved() {
      const s = session;
      if (!s) return;
      try {
        if (s.saved) remove(s.key, s.saved);
        for (const entry of s.used) remove(entry.key, entry.raw);
      } catch { /* The Grist save succeeded; never report a false write failure. */ }
      session = null;
      panel.hidden = true;
    },
  };
};
