/* Meeting paragraphs and point associations. All changes remain form drafts. */
window.MeetingMentions = (() => {
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const copy = value => structuredClone(value);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const kinds = ['projects', 'streams', 'tasks'];
  function create(ctx) {
    const { form, content } = ctx;
    if (!content || content.tagName !== 'TEXTAREA' || !ctx.enabled) return null;
    const initialBlocks = copy(ctx.blocks || []);
    const initialByUid = new Map(initialBlocks.map(b => [b.uid, b]));
    const blockChanged = b => {
      const initial = initialByUid.get(b.uid);
      return !initial || ['title', 'content', 'decision'].some(f => b[f] !== initial[f]) || !same(b.refs, initial.refs);
    };
    let blocks = copy(initialBlocks), touched = false, pending = null, locked = false, dead = false;
    let pointBaseRefs = copy(ctx.initialRefs || []);
    let timer, trigger = null, active = 0, options = [], proposal = null, composing = false;
    const listeners = [], observed = new WeakSet(), controlsBeforeLock = new Map();
    const root = document.createElement('section');
    root.className = 'meeting-mentions';
    const hint = document.createElement('p');
    hint.className = 'mention-hint';
    hint.textContent = ctx.kind === 'notes'
      ? 'Tapez @ pour rechercher un projet, chantier ou une tâche. Séparez les paragraphes par une ligne vide. Un point peut aussi rester sans rattachement au suivi.'
      : 'Tapez @ dans les échanges pour ajouter un rattachement à ce point, sans créer de nouveau point.';
    const notice = document.createElement('p');
    notice.className = 'mention-message'; notice.setAttribute('role', 'status');
    const toolbar = document.createElement('div'); toolbar.className = 'actions';
    const command = document.createElement('button'); command.type = 'button';
    command.textContent = ctx.kind === 'notes' ? 'Transformer le paragraphe en point' : '@ Ajouter un rattachement';
    toolbar.append(command);
    const proposalBox = document.createElement('div'); proposalBox.hidden = true;
    proposalBox.className = 'mention-proposal';
    const cards = document.createElement('div'); cards.className = 'mention-blocks';
    const pointChips = document.createElement('div'); pointChips.className = 'mention-chips';
    root.append(hint, toolbar, notice, proposalBox, pointChips, cards);
    content.after(root);
    const menu = document.createElement('div');
    menu.className = 'mention-menu'; menu.id = 'mention-menu-' + crypto.randomUUID();
    menu.setAttribute('popover', 'manual'); menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Rattachements proposés'); menu.hidden = true;
    form.append(menu);
    const indexed = ctx.candidates.map(c => ({ ...c, search: norm(c.search) }));
    const refLabel = ref => ctx.label(ref) || `${ref.kind} #${ref.id} — non retrouvé`;
    const changed = () => touched ||
      (ctx.kind === 'points' && !same(ctx.readRefs(), ctx.initialRefs));
    function notify() { form.dispatchEvent(new CustomEvent('notecomposerchange', { bubbles: true })); }
    function on(element, name, fn, capture = false) {
      element.addEventListener(name, fn, capture);
      listeners.push(() => element.removeEventListener(name, fn, capture));
    }
    function closeMenu() {
      clearTimeout(timer);
      timer = null;
      if (menu.hidePopover && menu.matches(':popover-open')) menu.hidePopover();
      menu.hidden = true;
      if (trigger?.textarea) {
        trigger.textarea.setAttribute('aria-expanded', 'false');
        trigger.textarea.removeAttribute('aria-activedescendant');
      }
      trigger = null;
    }
    function positionMenu() {
      if (!trigger || menu.hidden) return;
      const rect = trigger.textarea.getBoundingClientRect(), vv = window.visualViewport;
      const top = vv?.offsetTop || 0, bottom = top + (vv?.height || innerHeight);
      const width = Math.min(Math.max(rect.width, 240), innerWidth - 16);
      const below = bottom - rect.bottom >= Math.min(260, rect.top - top);
      Object.assign(menu.style, { position: 'fixed', inset: 'auto', margin: '0', width: width + 'px',
        left: Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px',
        maxHeight: Math.max(70, Math.min(280, below ? bottom - rect.bottom - 8 : rect.top - top - 8)) + 'px' });
      menu.style.top = (below ? rect.bottom : Math.max(top + 4, rect.top - menu.getBoundingClientRect().height)) + 'px';
    }
    function paragraph(textarea) {
      const value = textarea.value, caret = textarea.selectionStart ?? value.length;
      let start = 0, end = value.length;
      for (const match of value.matchAll(/\n[ \t]*\n/g)) {
        if (match.index + match[0].length <= caret) start = match.index + match[0].length;
        else if (match.index >= caret) { end = match.index; break; }
      }
      return { value, caret, start, end };
    }
    function showMenu(textarea, block, force = false) {
      if (locked || dead || composing) return;
      const p = paragraph(textarea);
      if (textarea.selectionEnd !== p.caret) { closeMenu(); return; }
      const match = p.value.slice(p.start, p.caret).match(/(?:^|[\s(])@([^@\n]{0,80})$/);
      if (!match && !force) { closeMenu(); return; }
      const at = match ? p.caret - match[1].length - 1 : p.caret;
      const query = match ? match[1] : '';
      trigger = { textarea, block, ...p, at, query, token: !!match };
      const words = norm(query).split(/\s+/).filter(Boolean);
      const matches = indexed.filter(c => words.every(word => c.search.includes(word)));
      options = matches.slice(0, 12).map(c => ({ ref: {kind: c.kind, id: c.id}, label: c.label,
        disabled: !ctx.canLink(c.kind, block), path: c.path }));
      options.push({ ref: null, label: ctx.kind === 'notes' && !block
        ? 'Créer un point sans rattachement' : 'Ne pas ajouter de rattachement' });
      active = Math.max(0, options.findIndex(o => !o.disabled));
      menu.replaceChildren();
      options.forEach((option, index) => {
        const button = document.createElement('button'); button.type = 'button';
        button.id = menu.id + '-' + index; button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(index === active)); button.disabled = !!option.disabled;
        const title = document.createElement('span'); title.textContent = option.label;
        const path = document.createElement('small');
        path.textContent = option.disabled ? 'Rattachement non modifiable : vérifier le mapping du point.' : option.path || '';
        button.append(title, path);
        button.onclick = () => choose(index);
        menu.append(button);
      });
      const count = document.createElement('p'); count.className = 'mention-hint';
      count.textContent = matches.length > 12 ? `${matches.length} résultats — précisez la recherche.`
        : matches.length ? `${matches.length} résultat(s)` : 'Aucun élément trouvé.';
      menu.append(count);
      menu.hidden = false;
      textarea.setAttribute('aria-controls', menu.id); textarea.setAttribute('aria-expanded', 'true');
      textarea.setAttribute('aria-activedescendant', menu.id + '-' + active);
      if (menu.showPopover && !menu.matches(':popover-open')) menu.showPopover();
      positionMenu();
    }
    function choose(index) {
      if (locked || !trigger || options[index]?.disabled) return;
      let t = trigger;
      const ref = options[index].ref;
      if (t.textarea.value !== t.value) {
        const p = paragraph(t.textarea), match = p.value.slice(p.start, p.caret).match(/(?:^|[\s(])@([^@\n]{0,80})$/);
        const candidate = ref && indexed.find(c => c.kind === ref.kind && c.id === ref.id);
        if (!match || candidate && !norm(match[1]).split(/\s+/).filter(Boolean).every(word => candidate.search.includes(word))) {
          showMenu(t.textarea, t.block); return;
        }
        t = { ...t, ...p, at: p.caret - match[1].length - 1, query: match[1], token: true };
      }
      closeMenu();
      const clean = t.value.slice(0, t.at) + t.value.slice(t.caret);
      if (ctx.kind === 'notes' && !t.block) {
        propose({ ...t, cleanParagraph: t.value.slice(t.start, t.at) + t.value.slice(t.caret, t.end), ref });
        return;
      }
      t.textarea.value = clean;
      if (t.block) {
        t.block.content = clean;
        if (ref && !t.block.refs.some(r => r.kind === ref.kind && r.id === ref.id)) t.block.refs.push(ref);
        renderBlocks();
      } else {
        if (ref) ctx.writeRefs([...ctx.readRefs(), ref]);
        renderPointChips();
      }
      touched = true;
      t.textarea.dispatchEvent(new Event('input', { bubbles: true }));
      notify();
      const next = t.block ? blockTextarea(t.block.uid) : t.textarea;
      next?.focus(); next?.setSelectionRange(t.at, t.at);
    }
    function blockTextarea(uid) {
      return [...cards.children].find(box => box.dataset.blockUid === uid)?.querySelector('[data-block-field="content"]');
    }
    function propose(p) {
      proposal = p;
      proposalBox.replaceChildren(); proposalBox.hidden = false;
      const h = document.createElement('h4'); h.textContent = 'Créer un point à partir de ce paragraphe ?';
      const preview = document.createElement('p'); preview.className = 'mention-paragraph'; preview.textContent = p.cleanParagraph;
      const label = document.createElement('label'); label.textContent = 'Titre du point';
      const title = document.createElement('input'); title.type = 'text';
      title.value = p.cleanParagraph.trim().split('\n')[0].slice(0, 120) || (p.ref ? refLabel(p.ref) : 'Nouveau point');
      label.append(title);
      const target = document.createElement('p'); target.textContent = p.ref ? refLabel(p.ref) : 'Sans rattachement au suivi — lié à cette réunion';
      const yes = document.createElement('button'), no = document.createElement('button'); yes.type = no.type = 'button';
      yes.textContent = 'Créer le point (brouillon)'; no.textContent = 'Garder en notes générales';
      yes.onclick = () => {
        if (locked) return;
        if (content.value !== p.value) { notice.textContent = 'Les notes ont changé. Recommencez la transformation de ce paragraphe.'; return; }
        if (!title.value.trim()) { title.focus(); notice.textContent = 'Donnez un titre au point.'; return; }
        blocks.push({ uid: crypto.randomUUID(), id: null, title: title.value, content: p.cleanParagraph, decision: '',
          refs: p.ref ? [p.ref] : [], base: null, lockedRefs: [] });
        content.value = p.value.slice(0, p.start) + p.value.slice(p.end);
        proposal = null; proposalBox.hidden = true; touched = true;
        renderBlocks(); content.dispatchEvent(new Event('input', { bubbles: true })); notify();
        notice.textContent = 'Point préparé : seul Enregistrer le créera dans Grist.';
        const textarea = cards.lastElementChild?.querySelector('textarea');
        textarea?.focus(); textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
      };
      no.onclick = () => { if (!locked) { proposal = null; proposalBox.hidden = true; content.focus(); } };
      proposalBox.append(h, preview, label, target, yes, no);
      title.focus(); title.select();
    }
    function renderChips(container, refs, remove, block) {
      container.replaceChildren();
      if (!refs.length) {
        const span = document.createElement('span'); span.className = 'mention-hint';
        span.textContent = 'Sans rattachement explicite au suivi — le lien à la réunion est conservé.'; container.append(span);
      }
      refs.forEach((ref, i) => {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = refLabel(ref) + ' ×'; button.setAttribute('aria-label', 'Retirer le rattachement ' + refLabel(ref));
        button.disabled = !ctx.canLink(ref.kind, block);
        button.onclick = () => { if (!locked) { remove(i); touched = true; notify(); } };
        container.append(button);
      });
    }
    function renderPointChips() {
      if (ctx.kind !== 'points') return;
      renderChips(pointChips, ctx.readRefs(), i => {
        const refs = ctx.readRefs(); refs.splice(i, 1); ctx.writeRefs(refs); renderPointChips();
      });
    }
    function startMention(textarea, block) {
      textarea.focus();
      const at = textarea.selectionStart ?? textarea.value.length;
      textarea.setRangeText((at && !/\s/.test(textarea.value[at - 1]) ? ' ' : '') + '@', at, textarea.selectionEnd ?? at, 'end');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      showMenu(textarea, block);
    }
    function renderBlocks() {
      cards.replaceChildren();
      if (ctx.kind !== 'notes') return;
      if (blocks.length) { const h = document.createElement('h3'); h.textContent = 'Points de discussion'; cards.append(h); }
      for (const block of blocks) {
        const box = document.createElement('section'); box.className = 'mention-block'; box.dataset.blockUid = block.uid;
        const caption = document.createElement('p'); caption.className = 'mention-hint';
        caption.textContent = block.id ? 'Point enregistré' : 'Nouveau point · brouillon';
        box.append(caption);
        for (const [property, field, label] of [['title', 'Titre', 'Titre du point'], ['content', 'Contenu', 'Échanges du point'], ['decision', 'Decision', 'Décision du point']]) {
          if (!ctx.hasField(field) && property === 'decision') continue;
          const wrapper = document.createElement('label'); wrapper.textContent = label;
          const control = document.createElement(property === 'title' ? 'input' : 'textarea');
          control.value = block[property]; control.dataset.blockField = property;
          control.readOnly = !ctx.writable(field);
          control.addEventListener('input', () => { block[property] = control.value; touched = true; notify(); });
          wrapper.append(control); box.append(wrapper);
          if (property === 'content' && !control.readOnly) attach(control, block);
        }
        const chips = document.createElement('div'); chips.className = 'mention-chips';
        renderChips(chips, block.refs, i => { block.refs.splice(i, 1); renderBlocks(); blockTextarea(block.uid)?.focus(); }, block);
        box.append(chips);
        const add = document.createElement('button'); add.type = 'button'; add.textContent = '@ Ajouter un rattachement';
        add.disabled = !ctx.writable('Contenu');
        add.onclick = () => {
          const textarea = box.querySelector('[data-block-field="content"]');
          textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          startMention(textarea, block);
        };
        box.append(add);
        if (!block.id) {
          const revert = document.createElement('button'); revert.type = 'button'; revert.textContent = 'Remettre dans les notes générales';
          revert.onclick = () => {
            if (locked) return;
            const text = [block.title, block.content, block.decision ? 'Décision : ' + block.decision : '',
              block.refs.length ? 'Rattachements : ' + block.refs.map(refLabel).join(' ; ') : ''].filter(Boolean).join('\n');
            content.value += (content.value.trim() ? '\n\n' : '') + text;
            blocks = blocks.filter(b => b.uid !== block.uid); touched = true;
            renderBlocks(); content.dispatchEvent(new Event('input', { bubbles: true })); notify();
          };
          box.append(revert);
        }
        cards.append(box);
      }
    }
    function attach(textarea, block) {
      if (observed.has(textarea)) return;
      observed.add(textarea);
      textarea.setAttribute('aria-autocomplete', 'list');
      textarea.setAttribute('aria-expanded', 'false');
      textarea.addEventListener('input', e => {
        if (e.isComposing || composing) return;
        clearTimeout(timer); timer = setTimeout(() => { timer = null; showMenu(textarea, block); }, 120);
      });
      textarea.addEventListener('compositionstart', () => { composing = true; closeMenu(); });
      textarea.addEventListener('compositionend', () => { composing = false; showMenu(textarea, block); });
      textarea.addEventListener('keydown', e => {
        if (e.isComposing) return;
        if (e.key === 'Escape' && (!menu.hidden || timer) && /(?:^|[\s(])@([^@\n]{0,80})$/.test(textarea.value.slice(0, textarea.selectionStart))) {
          e.preventDefault(); e.stopPropagation(); closeMenu(); return;
        }
        if (menu.hidden || trigger?.textarea !== textarea) return;
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
          e.preventDefault(); e.stopPropagation();
          if (e.key === 'Escape') { closeMenu(); return; }
          if (e.key === 'Enter') { choose(active); return; }
          const direction = e.key === 'ArrowDown' ? 1 : -1;
          for (let i = 0; i < options.length; i++) {
            active = (active + direction + options.length) % options.length;
            if (!options[active].disabled) break;
          }
          [...menu.querySelectorAll('[role="option"]')].forEach((b, i) => b.setAttribute('aria-selected', String(i === active)));
          textarea.setAttribute('aria-activedescendant', menu.id + '-' + active);
          menu.querySelectorAll('[role="option"]')[active]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Tab') closeMenu();
      });
      textarea.addEventListener('click', () => { if (!locked) showMenu(textarea, block); });
    }
    command.onclick = () => {
      if (locked) return;
      const p = paragraph(content);
      if (ctx.kind === 'notes') propose({ ...p, cleanParagraph: p.value.slice(p.start, p.end), ref: null });
      else startMention(content, null);
    };
    on(document, 'pointerdown', e => { if (!menu.contains(e.target) && e.target !== trigger?.textarea) closeMenu(); }, true);
    on(menu, 'pointerdown', e => { if (e.pointerType === 'mouse') e.preventDefault(); });
    on(window, 'resize', positionMenu);
    on(document, 'scroll', positionMenu, true);
    if (window.visualViewport) { on(window.visualViewport, 'resize', positionMenu); on(window.visualViewport, 'scroll', positionMenu); }
    on(form, 'change', () => { renderPointChips(); notify(); });
    attach(content, null); renderBlocks(); renderPointChips();
    function snapshot() {
      return { version: 1, schema: ctx.schema, blocks: copy(blocks), refs: ctx.kind === 'points' ? ctx.readRefs() : [], baseRefs: copy(pointBaseRefs), touched, pending: copy(pending) };
    }
    function compatible(state) {
      return !!state && state.version === 1 && state.schema === ctx.schema && Array.isArray(state.blocks) &&
        new Set(state.blocks.map(b => b?.uid)).size === state.blocks.length &&
        state.blocks.every(b => b && typeof b.uid === 'string' && (b.id === null || Number.isInteger(b.id) && b.id > 0) &&
          ['title', 'content', 'decision'].every(f => typeof b[f] === 'string') && validRefs(b.refs) &&
          (b.id === null || b.base && typeof b.base === 'object' && !Array.isArray(b.base) && validRefs(b.baseRefs))) && validRefs(state.refs);
    }
    function validRefs(refs) { return Array.isArray(refs) && refs.every(r => r && kinds.includes(r.kind) && Number.isInteger(r.id) && r.id > 0); }
    const api = {
      snapshot, changed,
      needsTransaction: () => ctx.kind === 'notes' ? changed() : touched,
      assertReady() { if (proposal) throw Error('Validez ou annulez la transformation du paragraphe avant d’enregistrer.'); },
      get pending() { return pending; },
      setPending(plan) { pending = copy(plan); notify(); },
      lock(value) {
        locked = value; closeMenu();
        if (locked) {
          for (const el of form.querySelectorAll('button,input,select,textarea')) {
            controlsBeforeLock.set(el, el.disabled); el.disabled = true;
          }
        } else {
          for (const [el, disabled] of controlsBeforeLock) el.disabled = disabled;
          controlsBeforeLock.clear();
        }
      },
      destroy() { dead = true; clearTimeout(timer); closeMenu(); listeners.forEach(remove => remove()); api.lock(false); root.remove(); menu.remove(); },
      draft: {
        capture: () => changed() || pending ? { version: 1, schema: ctx.schema, partial: true,
          blocks: copy(blocks.filter(blockChanged)), refs: ctx.kind === 'points' ? ctx.readRefs() : [],
          baseRefs: copy(pointBaseRefs), touched, pending: copy(pending) } : null,
        compatible,
        restore(state) {
          if (!compatible(state)) throw Error('Brouillon structuré incompatible avec ce mapping.');
          if (state.partial) {
            const stored = new Map(state.blocks.map(b => [b.uid, b]));
            blocks = initialBlocks.map(b => copy(stored.get(b.uid) || b));
            blocks.push(...copy(state.blocks.filter(b => !initialByUid.has(b.uid))));
          } else blocks = copy(state.blocks);
          touched = !!state.touched || state.blocks.some(blockChanged); pending = copy(state.pending || null); pointBaseRefs = copy(state.baseRefs || []);
          if (ctx.kind === 'points') ctx.writeRefs(state.refs);
          renderBlocks(); renderPointChips(); closeMenu(); proposal = null; proposalBox.hidden = true;
        },
        preview(state) {
          if (!state || !Array.isArray(state.blocks)) return '';
          const label = ref => ref && kinds.includes(ref.kind) && Number.isInteger(ref.id)
            ? state.schema === ctx.schema ? refLabel(ref) : ref.kind + ' #' + ref.id : 'Référence non reconnue';
          return state.blocks.filter(b => b && typeof b === 'object').map(b => [b.title, b.content, b.decision,
            ...(Array.isArray(b.refs) ? b.refs : []).map(label)].join('\n')).join('\n\n') +
            (Array.isArray(state.refs) && state.refs.length ? '\nRattachements : ' + state.refs.map(label).join(' ; ') : '');
        },
      },
    };
    return api;
  }
  return { create };
})();
