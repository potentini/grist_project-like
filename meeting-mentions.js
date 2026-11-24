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
      return !initial || ['title', 'content', 'decision'].some(f => b[f] !== initial[f]) || !same(b.refs, initial.refs) || !same(b.forwards || [], initial.forwards || []);
    };
    let blocks = copy(initialBlocks), touched = false, pending = null, locked = false, dead = false;
    const inlineMentions = new Map();
    let pointBaseRefs = copy(ctx.initialRefs || []);
    let timer, trigger = null, active = 0, options = [], proposal = null, composing = false;
    const listeners = [], observed = new WeakSet(), controlsBeforeLock = new Map();
    const root = document.createElement('section');
    root.className = 'meeting-mentions';
    const hint = document.createElement('p');
    hint.className = 'mention-hint';
    hint.textContent = ctx.kind === 'notes'
      ? 'Tapez @ pour rattacher un paragraphe à un projet, un chantier ou une tâche. Cliquez sur une mention pour la modifier. À l’enregistrement, chaque paragraphe marqué devient un point. Une ligne vide sépare les paragraphes.'
      : 'Tapez @ dans les échanges pour ajouter un rattachement à ce point, sans créer de nouveau point.';
    if (ctx.forwardSchema) hint.textContent += ' Tapez # pour reporter un point vers une réunion existante.';
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
    const meetingIndex = (ctx.meetings || []).map(meeting => ({ ...meeting, search: norm(meeting.search) }));
    const meetingLabel = id => meetingIndex.find(meeting => meeting.id === id)?.label || 'Réunion #' + id;
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
    function token(text) {
      return text.match(ctx.forwardSchema ? /(?:^|[\s(])([@#])([^@#\n]{0,80})$/ : /(?:^|[\s(])(@)([^@\n]{0,80})$/);
    }
    const searchWords = query => norm(query).split(/\s+/).filter(Boolean);
    const matchesQuery = (candidate, words) => words.every(word => candidate.search.includes(word));
    function mentionsIn(text) {
      if (!inlineMentions.size) return [];
      return [...text.matchAll(/[@#]\[[^\]\n]+\]/g)].flatMap(match => {
        const mention = inlineMentions.get(match[0]);
        return mention ? [{ ...mention, text: match[0], start: match.index, end: match.index + match[0].length }] : [];
      });
    }
    function mentionText(marker, label, link) {
      const safeLabel = label.replace(/[\]\r\n]/g, ' ').trim() || 'Sans titre';
      let text = marker + '[' + safeLabel + ']';
      const base = text;
      for (let suffix = 2; inlineMentions.has(text) && !same(inlineMentions.get(text), link); suffix++)
        text = base.slice(0, -1) + ' · ' + suffix + ']';
      inlineMentions.set(text, link);
      return text;
    }
    function replaceMention(trigger, text) {
      const { textarea, at, caret } = trigger;
      textarea.setRangeText(text, at, caret, 'end');
      touched = true;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      closeMenu();
      textarea.focus();
      notify();
    }
    function showMenu(textarea, block, edit = false) {
      if (locked || dead || composing) return;
      const p = paragraph(textarea);
      if (textarea.selectionEnd !== p.caret) { closeMenu(); return; }
      const current = edit && mentionsIn(p.value).find(mention => p.caret >= mention.start && p.caret <= mention.end);
      const match = current ? null : token(p.value.slice(p.start, p.caret));
      if (!current && !match) { closeMenu(); return; }
      const marker = current ? current.text[0] : match[1];
      const query = current ? '' : match[2];
      if (!current && (query.startsWith('[') || query.includes(']'))) { closeMenu(); return; }
      const at = current ? current.start : p.caret - query.length - 1;
      trigger = { textarea, block, ...p, at, caret: current ? current.end : p.caret, marker, current };
      const forwarding = marker === '#';
      const source = forwarding ? meetingIndex : indexed;
      const scopeStart = block ? 0 : p.start;
      const scopeEnd = block ? p.value.length : p.end;
      const occupied = mentionsIn(p.value.slice(scopeStart, scopeEnd)).filter(mention => mention.start + scopeStart !== current?.start);
      const words = searchWords(query);
      const matches = source.filter(candidate => matchesQuery(candidate, words) &&
        (!forwarding || ctx.canForward(candidate.id, block) && !block?.forwards?.includes(candidate.id) &&
          !occupied.some(mention => mention.destination === candidate.id)));
      options = matches.slice(0, 12).map(candidate => {
        if (forwarding) return { destination: candidate, label: candidate.label, path: candidate.path };
        const full = linkFull(candidate, block, occupied);
        return { candidate, ref: {kind: candidate.kind, id: candidate.id}, label: candidate.label,
          disabled: !ctx.canLink(candidate.kind, block) || full, path: candidate.path,
          reason: full ? 'Référence simple : retirez le rattachement actuel avant d’en choisir un autre.' : '' };
      });
      if (current) options.unshift({ remove: true, label: 'Retirer cette mention' }, { search: true, label: 'Rechercher un autre choix…' });
      else if (!forwarding) options.push({ ref: null, label: ctx.kind === 'notes' && !block
        ? 'Créer un point sans rattachement' : 'Ne pas ajouter de rattachement' });
      menu.setAttribute('aria-label', forwarding ? 'Réunions destinataires' : 'Rattachements proposés');
      active = options.findIndex(o => !o.disabled);
      menu.replaceChildren();
      options.forEach((option, index) => {
        const button = document.createElement('button'); button.type = 'button';
        button.id = menu.id + '-' + index; button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(index === active)); button.disabled = !!option.disabled;
        const title = document.createElement('span'); title.textContent = option.label;
        const path = document.createElement('small');
        path.textContent = option.disabled ? option.reason || 'Rattachement non modifiable : vérifier le mapping du point.' : option.path || '';
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
      if (active >= 0) textarea.setAttribute('aria-activedescendant', menu.id + '-' + active);
      else textarea.removeAttribute('aria-activedescendant');
      if (menu.showPopover && !menu.matches(':popover-open')) menu.showPopover();
      positionMenu();
    }
    function linkFull(ref, block, occupied) {
      const base = block ? block.refs : ctx.kind === 'points' ? ctx.readRefs() : [];
      const refs = [...base, ...occupied.filter(mention => mention.ref).map(mention => mention.ref)];
      return !refs.some(r => r.kind === ref.kind && r.id === ref.id) &&
        refs.filter(r => r.kind === ref.kind).length >= (ctx.linkLimit?.(ref.kind) ?? Infinity);
    }
    function choose(index) {
      const option = options[index];
      if (locked || !trigger || !option || option.disabled) return;
      let t = trigger;
      const { ref, destination, candidate } = option;
      if (t.current && t.textarea.value !== t.value) { showMenu(t.textarea, t.block, true); return; }
      if (option.remove || option.search) {
        replaceMention(t, option.search ? t.marker : '');
        if (option.search) showMenu(t.textarea, t.block);
        return;
      }
      const p = paragraph(t.textarea);
      if (!t.current && (p.value !== t.value || p.caret !== t.caret)) {
        const match = token(p.value.slice(p.start, p.caret));
        if (!match || match[1] !== t.marker || (candidate || destination) && !matchesQuery(candidate || destination, searchWords(match[2]))) {
          showMenu(t.textarea, t.block); return;
        }
        t = { ...t, ...p, at: p.caret - match[2].length - 1 };
      }
      if (ref && !t.current) {
        const scope = t.block ? t.value : t.value.slice(t.start, t.end);
        if (linkFull(ref, t.block, mentionsIn(scope))) { showMenu(t.textarea, t.block); return; }
      }
      if (ctx.kind === 'notes' && (ref || destination)) {
        const label = destination?.label || refLabel(ref);
        const link = destination ? { destination: destination.id } : { ref };
        const text = mentionText(t.marker, label, link);
        replaceMention(t, text + (!t.current && !/^[\s.,;:!?)]/.test(t.value.slice(t.caret)) ? ' ' : ''));
        return;
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
        if (ref && !ctx.readRefs().some(r => r.kind === ref.kind && r.id === ref.id)) ctx.writeRefs([...ctx.readRefs(), ref]);
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
      title.value = extract(p.cleanParagraph).text.trim().split('\n')[0].slice(0, 120) || (p.ref ? refLabel(p.ref) : 'Nouveau point');
      label.append(title);
      const target = document.createElement('p');
      target.textContent = p.ref ? refLabel(p.ref) : 'Sans rattachement au suivi — lié à cette réunion';
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
        if (block.forwards?.length) {
          const forwards = document.createElement('div');
          forwards.className = 'mention-chips';
          for (const id of block.forwards) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Renvoi à enregistrer · ' + meetingLabel(id) + ' ×';
            button.setAttribute('aria-label', 'Retirer le renvoi vers ' + meetingLabel(id));
            button.onclick = () => {
              block.forwards = block.forwards.filter(other => other !== id);
              touched = true;
              renderBlocks();
              blockTextarea(block.uid)?.focus();
              notify();
            };
            forwards.append(button);
          }
          box.append(forwards);
        }
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
        if (e.key === 'Escape' && (!menu.hidden || timer) && token(textarea.value.slice(0, textarea.selectionStart))) {
          e.preventDefault(); e.stopPropagation(); closeMenu(); return;
        }
        if (menu.hidden || trigger?.textarea !== textarea || !options.length) return;
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
      textarea.addEventListener('click', () => { if (!locked) showMenu(textarea, block, true); });
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
    function extract(text) {
      const mentions = mentionsIn(text);
      let clean = '', cursor = 0;
      for (const mention of mentions) {
        clean += text.slice(cursor, mention.start);
        // Remove the second separator space when a mention sits between words.
        cursor = mention.end + Number(/[ \t]$/.test(clean) && text[mention.end] === ' ');
      }
      return { mentions, text: clean + text.slice(cursor) };
    }
    function applyMentions(block, mentions) {
      const refs = [...block.refs], forwards = [...(block.forwards || [])];
      for (const mention of mentions) {
        if (mention.ref && !refs.some(ref => same(ref, mention.ref))) refs.push(mention.ref);
        if (mention.destination && !forwards.includes(mention.destination)) forwards.push(mention.destination);
      }
      return { ...block, refs, ...(forwards.length ? { forwards } : {}) };
    }
    function materialize() {
      const preparedBlocks = blocks.map(block => {
        const parsed = extract(block.content);
        return parsed.mentions.length ? applyMentions({ ...block, content: parsed.text.trim() }, parsed.mentions) : block;
      });
      const parts = content.value.split(/(\n[ \t]*\n(?:[ \t]*\n)*)/);
      const remaining = [];
      for (let i = 0; i < parts.length; i += 2) {
        const parsed = extract(parts[i]);
        if (!parsed.mentions.length) { remaining.push({ i, value: parts[i] }); continue; }
        const text = parsed.text.trim();
        preparedBlocks.push(applyMentions({
          uid: 'inline:' + i, id: null, title: text.split('\n')[0].slice(0, 120) || 'Nouveau point',
          content: text, decision: '', refs: [], base: null, lockedRefs: [],
        }, parsed.mentions));
      }
      // Keep the original divider between paragraphs retained in the general notes.
      const general = remaining.map((part, index) => (index ? parts[part.i - 1] : '') + part.value).join('');
      return { preparedBlocks, general };
    }
    function forwardState(entries = blocks) {
      return entries.some(block => block.forwards?.length) || [...inlineMentions.values()].some(mention => mention.destination)
        ? { forwardSchema: ctx.forwardSchema } : {};
    }
    function snapshot() {
      const { preparedBlocks, general } = inlineMentions.size ? materialize() : { preparedBlocks: blocks, general: content.value };
      const state = { version: 1, schema: ctx.schema, blocks: copy(preparedBlocks), refs: ctx.kind === 'points' ? ctx.readRefs() : [], baseRefs: copy(pointBaseRefs), touched, pending: copy(pending), ...forwardState(preparedBlocks) };
      return { state, general };
    }
    function compatible(state) {
      return !!state && state.version === 1 && state.schema === ctx.schema && Array.isArray(state.blocks) &&
        (state.inlineMentions === undefined || Array.isArray(state.inlineMentions) && state.inlineMentions.every(entry =>
          Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] &&
          (entry[1].ref ? validRefs([entry[1].ref]) : Number.isInteger(entry[1].destination) && entry[1].destination > 0 &&
            !!ctx.forwardSchema && state.forwardSchema === ctx.forwardSchema))) &&
        new Set(state.blocks.map(b => b?.uid)).size === state.blocks.length &&
        state.blocks.every(b => b && typeof b.uid === 'string' && (b.id === null || Number.isInteger(b.id) && b.id > 0) &&
          ['title', 'content', 'decision'].every(f => typeof b[f] === 'string') && validRefs(b.refs) &&
          (b.forwards === undefined || Array.isArray(b.forwards) && b.forwards.every(id => Number.isInteger(id) && id > 0) &&
            (!b.forwards.length || !!ctx.forwardSchema && state.forwardSchema === ctx.forwardSchema)) &&
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
          baseRefs: copy(pointBaseRefs), touched, pending: copy(pending), ...forwardState(),
          ...(inlineMentions.size ? { inlineMentions: copy([...inlineMentions]) } : {}) } : null,
        compatible,
        restore(state) {
          if (!compatible(state)) throw Error('Brouillon structuré incompatible avec ce mapping.');
          inlineMentions.clear();
          for (const [text, link] of state.inlineMentions || []) inlineMentions.set(text, copy(link));
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
            ...(Array.isArray(b.refs) ? b.refs : []).map(label),
            ...(Array.isArray(b.forwards) ? b.forwards : []).map(id => "Renvoi vers " + meetingLabel(id))].join('\n')).join('\n\n') +
            (Array.isArray(state.refs) && state.refs.length ? '\nRattachements : ' + state.refs.map(label).join(' ; ') : '');
        },
      },
    };
    return api;
  }
  return { create };
})();
