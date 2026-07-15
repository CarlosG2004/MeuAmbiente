(function(){
  "use strict";

  /* ============ STATE ============ */
  let items = [];
  let calcHistory = [];
  let calcExpr = "0";
  let calToday = new Date();
  let calView = { y: calToday.getFullYear(), m: calToday.getMonth() };
  let activeTab = 'lista';
  let saveTimer = null;
  const DEFAULT_PALETTE = ['#ffffff','#ff7a1a','#e8433d','#f0c419','#3ecf6e','#9bd6ef'];
  let notePalette = DEFAULT_PALETTE.slice();

  const $ = (sel, el) => (el||document).querySelector(sel);
  const $all = (sel, el) => Array.from((el||document).querySelectorAll(sel));
  const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);

  function toast(msg){
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._h); toast._h = setTimeout(()=>t.classList.remove('show'), 2400);
  }
  function escapeHtml(s){ const d=document.createElement('div'); d.textContent = s==null?'':s; return d.innerHTML; }
  function touch(it){ it.updatedAt = Date.now(); }
  function debouncedSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveItems, 500); }
  function preventFocusSteal(el){ if(el) el.addEventListener('mousedown', (e)=> e.preventDefault()); }
  function closeAllPopovers(){ $all('.popover.show').forEach(p=> p.classList.remove('show')); }
  function togglePopover(btn, pop, onOpen){
    if(!btn || !pop) return;
    btn.addEventListener('click', ()=>{
      if(onOpen) onOpen();
      const willShow = !pop.classList.contains('show');
      closeAllPopovers();
      if(willShow) pop.classList.add('show');
    });
  }
  document.addEventListener('mousedown', (e)=>{
    if(!e.target.closest('.popover-wrap')) closeAllPopovers();
  });

  /* ============ STORAGE ============ */
  async function loadAll(){
    try{ const r = await window.storage.get('items', false); items = r ? JSON.parse(r.value) : []; }
    catch(e){ items = []; }
    try{ const r = await window.storage.get('calc-history', false); calcHistory = r ? JSON.parse(r.value) : []; }
    catch(e){ calcHistory = []; }
    try{ const r = await window.storage.get('note-palette', false); notePalette = r ? JSON.parse(r.value) : DEFAULT_PALETTE.slice(); }
    catch(e){ notePalette = DEFAULT_PALETTE.slice(); }
    items.forEach(it=>{
      if(!it.updatedAt) it.updatedAt = it.createdAt;
      if(it.type==='nota' && it.note.isPrivate) it.note.unlocked = false;
    });
  }
  async function saveItems(){
    try{ await window.storage.set('items', JSON.stringify(items), false); }
    catch(e){ console.error('erro ao salvar itens', e); toast('Não consegui salvar agora.'); }
  }
  async function saveCalcHistory(){
    try{ await window.storage.set('calc-history', JSON.stringify(calcHistory), false); }
    catch(e){ console.error('erro ao salvar histórico', e); }
  }
  async function saveNotePalette(){
    try{ await window.storage.set('note-palette', JSON.stringify(notePalette), false); }
    catch(e){ console.error('erro ao salvar paleta', e); }
  }

  /* ============ SIDEBAR ============ */
  const menuBtn = $('#menuBtn'), sidebar = $('#sidebar'), overlay = $('#overlay');
  function openSidebar(){ sidebar.classList.add('open'); overlay.classList.add('show'); menuBtn.classList.add('active'); }
  function closeSidebar(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); menuBtn.classList.remove('active'); }
  menuBtn.addEventListener('click', ()=> sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
  overlay.addEventListener('click', ()=>{ closeSidebar(); closeModal(); });

  $all('.sidebar-section-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const sec = btn.parentElement;
      const wasOpen = sec.classList.contains('open');
      $all('.sidebar-section').forEach(s=>s.classList.remove('open'));
      if(!wasOpen) sec.classList.add('open');
    });
  });

  function renderRecentes(){
    const body = $('#recentesBody');
    const sorted = [...items].sort((a,b)=> b.updatedAt - a.updatedAt);
    if(sorted.length===0){ body.innerHTML = '<div class="empty-hint">Nada criado ainda.</div>'; return; }
    body.innerHTML = sorted.slice(0,30).map(it=>{
      const ic = it.type==='lista' ? '📋' : it.type==='tabela' ? '📊' : '📝';
      return `<div class="recent-item" data-open="${it.id}">${ic} ${escapeHtml(it.name)}</div>`;
    }).join('');
    $all('[data-open]', body).forEach(el=> el.addEventListener('click', ()=>{ closeSidebar(); openItem(el.dataset.open); }));
  }
  function renderPrivado(){
    const body = $('#privadoBody');
    const priv = items.filter(it=> it.type==='nota' && it.note.isPrivate);
    if(priv.length===0){ body.innerHTML = '<div class="empty-hint">Nenhuma anotação privada.</div>'; return; }
    body.innerHTML = priv.map(it=> `<div class="private-item" data-open="${it.id}">🔒 ${escapeHtml(it.name)}</div>`).join('');
    $all('[data-open]', body).forEach(el=> el.addEventListener('click', ()=>{ closeSidebar(); openItem(el.dataset.open); }));
  }

  /* ============ CALENDÁRIO ============ */
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  function renderCalendar(){
    $('#calTitle').textContent = MESES[calView.m] + ' ' + calView.y;
    const first = new Date(calView.y, calView.m, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(calView.y, calView.m+1, 0).getDate();
    let html = ['D','S','T','Q','Q','S','S'].map(d=>`<div class="dow">${d}</div>`).join('');
    for(let i=0;i<startDow;i++) html += '<div class="day blank"></div>';
    const isCurrentMonth = calToday.getFullYear()===calView.y && calToday.getMonth()===calView.m;
    const byDay = {};
    items.forEach(it=>{
      const d = new Date(it.createdAt);
      if(d.getFullYear()===calView.y && d.getMonth()===calView.m){
        (byDay[d.getDate()] = byDay[d.getDate()] || []).push(it.name);
      }
    });
    for(let d=1; d<=daysInMonth; d++){
      const isToday = isCurrentMonth && d===calToday.getDate();
      const hasItems = !!byDay[d];
      html += `<div class="day${isToday?' today':''}${hasItems?' has-items':''}" data-day="${d}">${d}${hasItems?'<span class="marker"></span>':''}</div>`;
    }
    $('#calGrid').innerHTML = html;
    $all('.day.has-items', $('#calGrid')).forEach(el=>{
      el.addEventListener('click', ()=>{
        const names = byDay[el.dataset.day];
        toast('Criado em '+el.dataset.day+'/'+(calView.m+1)+': '+names.join(', '));
      });
    });
  }
  $('#calPrev').addEventListener('click', ()=>{ calView.m--; if(calView.m<0){calView.m=11; calView.y--;} renderCalendar(); });
  $('#calNext').addEventListener('click', ()=>{ calView.m++; if(calView.m>11){calView.m=0; calView.y++;} renderCalendar(); });

  /* ============ CALCULADORA ============ */
  const CALC_KEYS = ['C','(',')','⌫','7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'];
  function renderCalcButtons(){
    $('#calcButtons').innerHTML = CALC_KEYS.map(k=>{
      const cls = (k==='=') ? 'eq' : (['+','-','*','/'].includes(k) ? 'op' : '');
      return `<button class="${cls}" data-k="${k}">${k}</button>`;
    }).join('');
    $all('#calcButtons button').forEach(b=> b.addEventListener('click', ()=> calcPress(b.dataset.k)));
  }
  function calcPress(k){
    if(k==='C'){ calcExpr = '0'; }
    else if(k==='⌫'){ calcExpr = calcExpr.length>1 ? calcExpr.slice(0,-1) : '0'; }
    else if(k==='='){
      try{
        const safe = calcExpr.replace(/[^0-9+\-*/().]/g,'');
        const result = Function('"use strict";return (' + safe + ')')();
        if(typeof result !== 'number' || !isFinite(result)) throw new Error('resultado inválido');
        calcHistory.unshift(calcExpr + ' = ' + result);
        calcHistory = calcHistory.slice(0,30);
        saveCalcHistory();
        renderCalcHistory();
        calcExpr = String(result);
      }catch(e){ calcExpr = 'Erro'; }
    } else {
      calcExpr = (calcExpr==='0' && !isNaN(k)) ? k : calcExpr + k;
    }
    $('#calcDisplay').textContent = calcExpr;
  }
  function renderCalcHistory(){
    $('#calcHistory').innerHTML = calcHistory.map(h=>`<div>${escapeHtml(h)}</div>`).join('') || '<div class="empty-hint">Sem cálculos salvos.</div>';
  }

  /* ============ WORKSPACE / TABS ============ */
  const FACES = { baixa:'🙂', media:'😟', urgente:'😠' };
  function renderWorkspaceTabs(){
    const counts = { lista:0, tabela:0, nota:0 };
    items.forEach(it=> counts[it.type]++);
    $('#workspaceTabs').innerHTML = `
      <button class="workspace-tab ${activeTab==='lista'?'active':''}" data-tab="lista">Listas <span class="count">${counts.lista}</span></button>
      <button class="workspace-tab ${activeTab==='tabela'?'active':''}" data-tab="tabela">Tabelas <span class="count">${counts.tabela}</span></button>
      <button class="workspace-tab ${activeTab==='nota'?'active':''}" data-tab="nota">Anotações <span class="count">${counts.nota}</span></button>
    `;
    $all('[data-tab]', $('#workspaceTabs')).forEach(b=> b.addEventListener('click', ()=>{
      activeTab = b.dataset.tab; renderWorkspaceTabs(); renderItemGrid();
    }));
  }
  function emptyMsg(tab){
    if(tab==='lista') return 'Nenhuma lista ainda — toque no + para criar a primeira.';
    if(tab==='tabela') return 'Nenhuma tabela ainda — toque no + para criar a primeira.';
    return 'Nenhuma anotação ainda — toque no + para criar a primeira.';
  }
  function itemCardHtml(it){
    const tagLabel = it.type==='lista'?'Lista':it.type==='tabela'?'Tabela':'Anotação';
    let meta = '';
    if(it.type==='lista') meta = (it.tasks||[]).length + ' tarefa(s) · ' + FACES[it.priority] + ' ' + it.priority;
    if(it.type==='tabela') meta = (it.sheets||[]).length + ' aba(s)';
    if(it.type==='nota') meta = it.note.isPrivate ? '🔒 privada' : 'pública';
    const face = it.type==='lista' ? `<span>${FACES[it.priority]}</span>` : '';
    return `
      <div class="item-card" data-open="${it.id}">
        ${it.pinned?'<span class="pin-badge">📌</span>':''}
        <div class="item-card-top"><span class="item-tag ${it.type}">${tagLabel}</span></div>
        <div class="item-card-name">${escapeHtml(it.name)} ${face}</div>
        <div class="item-card-meta">${meta}</div>
      </div>`;
  }
  function renderItemGrid(){
    const grid = $('#itemGrid'), empty = $('#workspaceEmpty');
    const filtered = items.filter(it=> it.type===activeTab);
    if(filtered.length===0){ grid.innerHTML=''; empty.style.display='block'; empty.textContent = emptyMsg(activeTab); return; }
    empty.style.display='none';
    const sorted = [...filtered].sort((a,b)=>{
      const pa = a.pinned?1:0, pb = b.pinned?1:0;
      if(pa!==pb) return pb-pa;
      return b.updatedAt - a.updatedAt;
    });
    grid.innerHTML = sorted.map(itemCardHtml).join('');
    $all('[data-open]', grid).forEach(el=> el.addEventListener('click', ()=> openItem(el.dataset.open)));
  }

  function findItem(id){ return items.find(i=>i.id===id); }
  function openItem(id){
    const it = findItem(id);
    if(!it) return;
    if(it.type==='lista') openListFullscreen(it);
    else if(it.type==='tabela') openTableFullscreen(it);
    else if(it.type==='nota') openNoteViewer(it);
  }
  function refreshAll(){ renderRecentes(); renderPrivado(); renderWorkspaceTabs(); renderItemGrid(); renderCalendar(); }

  function deleteItem(it){
    let ok = true;
    try{ ok = confirm('Excluir "'+it.name+'"? Essa ação não pode ser desfeita.'); }
    catch(e){ ok = true; }
    if(!ok) return;
    items = items.filter(x=>x.id!==it.id);
    saveItems(); refreshAll(); closeFullscreen();
    toast('Excluído.');
  }

  function itemSearchText(it){
    let t = it.name;
    if(it.type==='lista') t += ' ' + it.tasks.map(x=>x.text).join(' ');
    if(it.type==='tabela') t += ' ' + it.sheets.map(s=> s.cells.map(row=>row.join(' ')).join(' ')).join(' ');
    if(it.type==='nota' && !it.note.isPrivate){ const d=document.createElement('div'); d.innerHTML=it.note.content; t += ' ' + (d.textContent||''); }
    return t.toLowerCase();
  }

  /* ============ SEARCH BAR ============ */
  function bindSearch(){
    const input = $('#searchInput'), results = $('#searchResults');
    input.addEventListener('input', ()=>{
      const q = input.value.trim().toLowerCase();
      if(!q){ results.classList.remove('show'); results.innerHTML=''; return; }
      const matches = items.filter(it=> itemSearchText(it).includes(q)).slice(0,8);
      results.innerHTML = matches.length===0
        ? '<div class="search-empty">Nada encontrado.</div>'
        : matches.map(it=>{
            const ic = it.type==='lista'?'📋':it.type==='tabela'?'📊':'📝';
            const tagLabel = it.type==='lista'?'Lista':it.type==='tabela'?'Tabela':'Anotação';
            return `<div class="search-result-row" data-open="${it.id}">${ic} ${escapeHtml(it.name)}<span class="stag">${tagLabel}</span></div>`;
          }).join('');
      results.classList.add('show');
      $all('[data-open]', results).forEach(el=> el.addEventListener('click', ()=>{
        results.classList.remove('show'); input.value=''; openItem(el.dataset.open);
      }));
    });
    document.addEventListener('mousedown', (e)=>{
      if(!e.target.closest('.search-bar') && !e.target.closest('.search-results')) results.classList.remove('show');
    });
  }

  /* ============ MODAL (creation banners) ============ */
  const modalOverlay = $('#modalOverlay'), modalEl = $('#modal');
  function openModal(html){
    modalEl.innerHTML = '<button class="modal-close" id="modalCloseBtn">✕</button>' + html;
    modalOverlay.classList.add('show');
    $('#modalCloseBtn').addEventListener('click', closeModal);
  }
  function closeModal(){ modalOverlay.classList.remove('show'); modalEl.innerHTML=''; }
  modalOverlay.addEventListener('click', (e)=>{ if(e.target===modalOverlay) closeModal(); });

  /* ============ FULLSCREEN plumbing ============ */
  function openFullscreen(title, bodyHtml, actionsHtml){
    closeFullscreen();
    const fs = document.createElement('div');
    fs.className = 'fullscreen';
    fs.id = 'activeFullscreen';
    fs.innerHTML = `
      <div class="fs-header">
        <button class="fs-back" id="fsBackBtn">←</button>
        <div class="fs-title">${escapeHtml(title)}</div>
        <div class="fs-actions">${actionsHtml||''}</div>
      </div>
      <div class="fs-body">${bodyHtml}</div>
    `;
    document.body.appendChild(fs);
    $('#fsBackBtn').addEventListener('click', closeFullscreen);
    return fs;
  }
  function closeFullscreen(){
    const fs = $('#activeFullscreen');
    if(fs) fs.remove();
    closeRowMenu();
  }

  /* ============ CREATE FLOW ============ */
  $('#fabBtn').addEventListener('click', openTypeChoice);
  $all('.picker-card').forEach(card=> card.addEventListener('click', ()=> openCreateForm(card.dataset.type)));

  function openTypeChoice(){
    openModal(`
      <h3 class="modal-title">O que você quer criar?</h3>
      <p class="modal-sub">Escolha um tipo pra começar.</p>
      <div class="type-choice">
        <button class="type-btn lista" data-type="lista"><span class="emoji">📋</span><span class="label">Lista</span></button>
        <button class="type-btn tabela" data-type="tabela"><span class="emoji">📊</span><span class="label">Tabela</span></button>
        <button class="type-btn nota" data-type="nota"><span class="emoji">📝</span><span class="label">Anotação</span></button>
      </div>
    `);
    $all('.type-btn').forEach(b=> b.addEventListener('click', ()=> openCreateForm(b.dataset.type)));
  }
  function openCreateForm(type){
    if(type==='lista') openListForm();
    else if(type==='tabela') openTableForm();
    else if(type==='nota') openNoteForm();
  }

  /* ================================================================== */
  /* ----------------------------- LISTA ------------------------------- */
  /* ================================================================== */
  function openListForm(){
    openModal(`
      <h3 class="modal-title">Nova lista</h3>
      <div class="field">
        <label>Nome da lista</label>
        <input type="text" id="listName" placeholder="ex: Compras da semana">
      </div>
      <div class="field">
        <label>Prioridade</label>
        <div class="priority-row">
          <label class="priority-opt baixa selected"><input type="radio" name="prio" value="baixa" checked><span class="dot"></span>Baixa 🙂</label>
          <label class="priority-opt media"><input type="radio" name="prio" value="media"><span class="dot"></span>Média 😟</label>
          <label class="priority-opt urgente"><input type="radio" name="prio" value="urgente"><span class="dot"></span>Urgente 😠</label>
        </div>
      </div>
      <button class="btn-primary" id="createListBtn">Criar lista</button>
    `);
    $all('.priority-opt').forEach(opt=>{
      opt.addEventListener('click', ()=>{
        $all('.priority-opt').forEach(o=>o.classList.remove('selected'));
        opt.classList.add('selected');
        $('input', opt).checked = true;
      });
    });
    $('#createListBtn').addEventListener('click', ()=>{
      try{
        const name = $('#listName').value.trim();
        if(!name){ toast('Dê um nome pra sua lista.'); return; }
        const prio = $('input[name=prio]:checked').value;
        const now = Date.now();
        const it = { id: uid(), type:'lista', name, priority: prio, tasks: [], createdAt: now, updatedAt: now };
        items.push(it); saveItems(); refreshAll(); closeModal();
        openListFullscreen(it);
      }catch(err){ console.error('Erro ao criar lista:', err); toast('Não consegui criar a lista. Tente de novo.'); }
    });
  }

  function openListFullscreen(it){
    const bodyHtml = `
      <p class="modal-sub">Prioridade: ${it.priority} ${FACES[it.priority]}</p>
      <div id="taskList"></div>
      <div class="add-task-row">
        <input type="text" id="newTaskInput" placeholder="Adicionar tarefa...">
        <button class="btn-secondary" id="addTaskBtn">Add</button>
      </div>
    `;
    openFullscreen(it.name, bodyHtml, `<button class="danger" id="fsDeleteBtn" title="Excluir">🗑</button>`);
    $('#fsDeleteBtn').addEventListener('click', ()=> deleteItem(it));

    function renderTasks(){
      $('#taskList').innerHTML = it.tasks.map((t,i)=>`
        <div class="task-row ${t.done?'done':''}">
          <input type="checkbox" data-i="${i}" ${t.done?'checked':''}>
          <span>${escapeHtml(t.text)}</span>
          <button class="del" data-del="${i}">✕</button>
        </div>`).join('') || '<div class="empty-hint">Nenhuma tarefa ainda.</div>';
      $all('[data-i]', $('#taskList')).forEach(cb=> cb.addEventListener('change', ()=>{
        it.tasks[Number(cb.dataset.i)].done = cb.checked; touch(it); saveItems(); renderTasks(); renderItemGrid();
      }));
      $all('[data-del]', $('#taskList')).forEach(b=> b.addEventListener('click', ()=>{
        it.tasks.splice(Number(b.dataset.del),1); touch(it); saveItems(); renderTasks(); renderItemGrid();
      }));
    }
    renderTasks();
    $('#addTaskBtn').addEventListener('click', addTask);
    $('#newTaskInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') addTask(); });
    function addTask(){
      const val = $('#newTaskInput').value.trim();
      if(!val) return;
      it.tasks.push({ text: val, done:false });
      $('#newTaskInput').value='';
      touch(it); saveItems(); renderTasks(); renderItemGrid();
    }
  }

  /* ================================================================== */
  /* ----------------------------- TABELA ------------------------------ */
  /* ================================================================== */
  function blankSheet(rows, cols){
    return {
      rows, cols,
      cells: Array.from({length:rows},()=>Array.from({length:cols},()=>'')),
      colWidths: Array(cols).fill(96),
      rowHeights: Array(rows).fill(34),
      colTypes: Array(cols).fill(null),
      cellColors: Array.from({length:rows},()=>Array(cols).fill(null)),
      cellIcons: Array.from({length:rows},()=>Array(cols).fill(null)),
      rowMeta: Array.from({length:rows},()=>({favorite:false, emoji:'', comment:''}))
    };
  }
  function openTableForm(){
    openModal(`
      <h3 class="modal-title">Nova tabela</h3>
      <div class="field">
        <label>Nome da tabela</label>
        <input type="text" id="tableName" placeholder="ex: Orçamento mensal">
      </div>
      <button class="btn-primary" id="createTableBtn">Criar tabela</button>
    `);
    $('#createTableBtn').addEventListener('click', ()=>{
      try{
        const name = $('#tableName').value.trim();
        if(!name){ toast('Dê um nome pra sua tabela.'); return; }
        const now = Date.now();
        const it = { id: uid(), type:'tabela', name, sheets:[blankSheet(5,5)], activeSheet:0, pinned:false, createdAt: now, updatedAt: now };
        items.push(it); saveItems(); refreshAll(); closeModal();
        openTableFullscreen(it);
      }catch(err){ console.error('Erro ao criar tabela:', err); toast('Não consegui criar a tabela. Tente de novo.'); }
    });
  }

  let rowMenuEl = null;
  function closeRowMenu(){
    if(rowMenuEl){ rowMenuEl.remove(); rowMenuEl=null; }
    document.removeEventListener('mousedown', outsideRowMenu, true);
  }
  function outsideRowMenu(e){ if(rowMenuEl && !rowMenuEl.contains(e.target)) closeRowMenu(); }
  const ROW_EMOJIS = ['🙂','⭐','🔥','✅','📌','🎯','💡','📎','🚀','🎉','⚠️','❤️'];
  const CELL_ICONS = ['★','●','▲','■','◆','✓','✕','♥','☆','✦'];
  const TABLE_COLORS = [null,'#ff7a1a','#e8433d','#f0c419','#3ecf6e','#9bd6ef','#7c5cff','#4a4744'];
  const COL_TYPES = [
    {v:'numero', label:'123 Número'},
    {v:'texto', label:'Abc Texto'},
    {v:'calendario', label:'📅 Calendário'},
    {v:'calcular', label:'∑ Calcular (soma)'}
  ];

  function openTableFullscreen(it){
    let currentRow = 0, currentCol = 0, selectedRow = null, sidePanelOpen = false, colorScope = 'cell', iconColor = '#ff7a1a';

    const bodyHtml = `
      <div class="table-fs-layout">
        <div class="side-panel hidden" id="sidePanel">
          <h4>Detalhes da linha</h4>
          <div id="sidePanelBody"><p class="empty-hint">Selecione uma linha pra ver os detalhes.</p></div>
        </div>
        <div class="table-main">
          <div class="sheet-tabs" id="sheetTabs"></div>
          <div class="table-toolbar" id="tableToolbar">
            <button id="addRowBtn">+ linha</button>
            <button id="addColBtn">+ coluna</button>
            <div class="popover-wrap">
              <button id="colorBtn">🎨 Cor</button>
              <div class="popover" id="colorPop">
                <div class="pop-title">Cor</div>
                <div class="swatches" id="colorSwatches"></div>
                <div class="scope-toggle" id="colorScopeToggle">
                  <button data-scope="cell" class="active">Só aqui</button>
                  <button data-scope="col">Coluna inteira</button>
                </div>
              </div>
            </div>
            <div class="popover-wrap">
              <button id="iconBtn">🙂 Ícone</button>
              <div class="popover" id="iconPop">
                <div class="pop-title">Símbolo</div>
                <div class="icon-grid" id="iconGrid"></div>
                <div class="pop-title">Cor do ícone</div>
                <div class="swatches" id="iconSwatches"></div>
              </div>
            </div>
            <div class="popover-wrap">
              <button id="typeBtn">⚙ Tipo</button>
              <div class="popover" id="typePop">
                <div class="pop-title">Coluna selecionada</div>
                <div class="type-grid" id="colTypeGrid"></div>
                <div class="pop-title">Tabela</div>
                <div class="type-grid">
                  <button data-tact="pin">📌 Fixar tabela</button>
                  <button data-tact="save">💾 Guardar tabela</button>
                  <button data-tact="dup">⧉ Duplicar tabela</button>
                  <button data-tact="del" class="danger">🗑 Excluir tabela</button>
                </div>
              </div>
            </div>
            <button id="sideToggleBtn">⇤ Lado a lado</button>
            <button id="addSheetBtn">＋ aba (duplicar molde)</button>
          </div>
          <div class="table-wrap" id="tableWrap"></div>
          <div class="calc-summary" id="calcSummary"></div>
        </div>
      </div>
    `;
    openFullscreen(it.name, bodyHtml);
    $all('button', $('#tableToolbar')).forEach(preventFocusSteal);

    function sheet(){ return it.sheets[it.activeSheet]; }

    /* ---- sheet tabs ---- */
    function renderTabs(){
      $('#sheetTabs').innerHTML = it.sheets.map((s,i)=>
        `<div class="sheet-tab ${i===it.activeSheet?'active':''}" data-tab="${i}">Aba ${i+1}</div>`
      ).join('');
      $all('[data-tab]', $('#sheetTabs')).forEach(t=> t.addEventListener('click', ()=>{
        it.activeSheet = Number(t.dataset.tab); saveItems(); selectedRow=null; renderTabs(); renderGrid(); updateSidePanel();
      }));
    }

    /* ---- grid render ---- */
    function renderGrid(){
      const s = sheet();
      let html = `<table class="grid-table" style="table-layout:fixed;">`;
      for(let r=0;r<s.rows;r++){
        const meta = s.rowMeta[r];
        html += `<tr style="height:${s.rowHeights[r]}px;">`;
        html += `<td class="row-handle" data-row="${r}">
          <span class="grip">⋮⋮</span>
          ${meta.favorite?`<span class="star" data-star="${r}">★</span>`:''}
          ${meta.emoji?`<span class="rh-emoji">${meta.emoji}</span>`:''}
          ${meta.comment?`<span class="comment-dot" title="${escapeHtml(meta.comment)}"></span>`:''}
        </td>`;
        for(let c=0;c<s.cols;c++){
          const type = s.colTypes[c] || 'texto';
          const bg = s.cellColors[r][c];
          const icon = s.cellIcons[r][c];
          const styleAttr = 'width:'+s.colWidths[c]+'px;' + (bg?('background:'+bg+';'):'');
          const resizers = (r===0?`<div class="col-resizer" data-col="${c}"></div>`:'') + (c===s.cols-1?`<div class="row-resizer" data-row="${r}"></div>`:'');
          const iconHtml = icon ? `<span class="cell-icon" style="position:absolute;top:4px;left:4px;font-size:.75rem;pointer-events:none;color:${icon.color};">${icon.icon}</span>` : '';
          if(type==='calendario'){
            html += `<td style="${styleAttr}">${iconHtml}<input type="date" class="cell-date" data-r="${r}" data-c="${c}" value="${s.cells[r][c]||''}">${resizers}</td>`;
          } else {
            const numCls = (type==='numero'||type==='calcular') ? ' cell-num' : '';
            const padStyle = icon ? ' style="padding-left:20px;"' : '';
            html += `<td style="${styleAttr}">${iconHtml}<div class="cell${numCls}" contenteditable="true" data-r="${r}" data-c="${c}"${padStyle}>${escapeHtml(s.cells[r][c]||'')}</div>${resizers}</td>`;
          }
        }
        html += `</tr>`;
      }
      html += `</table>`;
      $('#tableWrap').innerHTML = html;
      renderCalcSummary();
      bindGridEvents();
    }

    function bindGridEvents(){
      const wrap = $('#tableWrap');
      $all('.cell', wrap).forEach(cell=>{
        cell.addEventListener('input', ()=>{
          sheet().cells[Number(cell.dataset.r)][Number(cell.dataset.c)] = cell.textContent;
          touch(it); debouncedSave();
          if((sheet().colTypes[Number(cell.dataset.c)]||'')==='calcular') renderCalcSummary();
        });
        cell.addEventListener('focus', ()=>{
          currentRow = Number(cell.dataset.r); currentCol = Number(cell.dataset.c);
          selectedRow = currentRow; updateSidePanel();
        });
      });
      $all('.cell-date', wrap).forEach(inp=>{
        inp.addEventListener('change', ()=>{
          sheet().cells[Number(inp.dataset.r)][Number(inp.dataset.c)] = inp.value;
          touch(it); saveItems();
        });
        inp.addEventListener('focus', ()=>{
          currentRow = Number(inp.dataset.r); currentCol = Number(inp.dataset.c);
          selectedRow = currentRow; updateSidePanel();
        });
      });
      $all('.col-resizer', wrap).forEach(handle=>{
        handle.addEventListener('mousedown', (e)=>{
          e.preventDefault();
          const col = Number(handle.dataset.col);
          const startX = e.clientX; const startW = sheet().colWidths[col];
          const affected = $all('[data-c="'+col+'"]', wrap).map(el=> el.closest('td'));
          function move(ev){
            const w = Math.max(40, startW + (ev.clientX - startX));
            sheet().colWidths[col] = w;
            affected.forEach(td=> td && (td.style.width = w+'px'));
          }
          function up(){ document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); touch(it); saveItems(); }
          document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
        });
      });
      $all('.row-resizer', wrap).forEach(handle=>{
        handle.addEventListener('mousedown', (e)=>{
          e.preventDefault();
          const row = Number(handle.dataset.row);
          const tr = handle.closest('tr');
          const startY = e.clientY; const startH = sheet().rowHeights[row];
          function move(ev){
            const h = Math.max(24, startH + (ev.clientY - startY));
            sheet().rowHeights[row] = h;
            if(tr) tr.style.height = h+'px';
          }
          function up(){ document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); touch(it); saveItems(); }
          document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
        });
      });
      $all('.star', wrap).forEach(star=> star.addEventListener('click', (e)=>{
        e.stopPropagation();
        sheet().rowMeta[Number(star.dataset.star)].favorite = false;
        touch(it); saveItems(); renderGrid();
      }));
      $all('.row-handle', wrap).forEach(handle=> bindRowHandle(handle, Number(handle.dataset.row)));
    }

    /* ---- row handle / long-press menu ---- */
    function bindRowHandle(el, r){
      let pressTimer = null;
      el.addEventListener('mousedown', (e)=>{
        if(e.target.classList.contains('star')) return;
        pressTimer = setTimeout(()=> showRowMenu(r, e.clientX, e.clientY), 500);
      });
      el.addEventListener('mouseup', ()=> clearTimeout(pressTimer));
      el.addEventListener('mouseleave', ()=> clearTimeout(pressTimer));
      el.addEventListener('touchstart', (e)=>{
        const t = e.touches[0];
        pressTimer = setTimeout(()=> showRowMenu(r, t.clientX, t.clientY), 500);
      }, {passive:true});
      el.addEventListener('touchend', ()=> clearTimeout(pressTimer));
      el.addEventListener('click', (e)=>{
        if(e.target.classList.contains('star')) return;
        selectedRow = r; updateSidePanel();
      });
    }
    function showRowMenu(r, x, y){
      closeRowMenu();
      const meta = sheet().rowMeta[r];
      const menu = document.createElement('div');
      menu.className = 'row-menu';
      menu.style.left = Math.min(x, window.innerWidth-220)+'px';
      menu.style.top = Math.min(y, window.innerHeight-280)+'px';
      menu.innerHTML = `
        <button data-act="fav">${meta.favorite?'★ Remover dos favoritos':'☆ Adicionar aos favoritos'}</button>
        <button data-act="emoji">🙂 Escolher emoji</button>
        <button data-act="addrow">➕ Nova linha abaixo</button>
        <button data-act="comment">💬 Comentar</button>
        <button data-act="duprow">⧉ Duplicar linha</button>
        <button data-act="duptable">⧉⧉ Duplicar tabela</button>
      `;
      document.body.appendChild(menu);
      rowMenuEl = menu;
      menu.querySelector('[data-act="fav"]').onclick = ()=>{ meta.favorite = !meta.favorite; touch(it); saveItems(); renderGrid(); closeRowMenu(); };
      menu.querySelector('[data-act="emoji"]').onclick = ()=> showEmojiPicker(menu, r, x, y);
      menu.querySelector('[data-act="addrow"]').onclick = ()=>{ insertRowAfter(r); closeRowMenu(); };
      menu.querySelector('[data-act="comment"]').onclick = ()=> showCommentBox(menu, r);
      menu.querySelector('[data-act="duprow"]').onclick = ()=>{ duplicateRow(r); closeRowMenu(); };
      menu.querySelector('[data-act="duptable"]').onclick = ()=>{ closeRowMenu(); duplicateWholeTable(); };
      setTimeout(()=> document.addEventListener('mousedown', outsideRowMenu, true), 0);
    }
    function showEmojiPicker(menu, r, x, y){
      menu.innerHTML = `<div class="rm-emojis">${ROW_EMOJIS.map(e=>`<button data-e="${e}">${e}</button>`).join('')}</div><button data-act="back">← Voltar</button>`;
      $all('[data-e]', menu).forEach(b=> b.onclick = ()=>{ sheet().rowMeta[r].emoji = b.dataset.e; touch(it); saveItems(); renderGrid(); closeRowMenu(); });
      menu.querySelector('[data-act="back"]').onclick = ()=> showRowMenu(r, x, y);
    }
    function showCommentBox(menu, r){
      const current = sheet().rowMeta[r].comment || '';
      menu.innerHTML = `<textarea id="commentInput" placeholder="Escreva um comentário...">${escapeHtml(current)}</textarea><button class="rm-save" id="commentSaveBtn">Salvar</button>`;
      $('#commentInput', menu).focus();
      $('#commentSaveBtn', menu).onclick = ()=>{
        sheet().rowMeta[r].comment = $('#commentInput', menu).value.trim();
        touch(it); saveItems(); renderGrid(); closeRowMenu();
      };
    }
    function insertRowAfter(r){
      const s = sheet();
      s.cells.splice(r+1, 0, Array(s.cols).fill(''));
      s.cellColors.splice(r+1, 0, Array(s.cols).fill(null));
      s.cellIcons.splice(r+1, 0, Array(s.cols).fill(null));
      s.rowHeights.splice(r+1, 0, 34);
      s.rowMeta.splice(r+1, 0, {favorite:false, emoji:'', comment:''});
      s.rows++;
      touch(it); saveItems(); renderGrid();
    }
    function duplicateRow(r){
      const s = sheet();
      s.cells.splice(r+1, 0, [...s.cells[r]]);
      s.cellColors.splice(r+1, 0, [...s.cellColors[r]]);
      s.cellIcons.splice(r+1, 0, [...s.cellIcons[r]]);
      s.rowHeights.splice(r+1, 0, s.rowHeights[r]);
      s.rowMeta.splice(r+1, 0, {...s.rowMeta[r]});
      s.rows++;
      touch(it); saveItems(); renderGrid();
    }
    function duplicateWholeTable(){
      const copy = JSON.parse(JSON.stringify(it));
      copy.id = uid(); copy.name = it.name + ' (cópia)';
      copy.createdAt = Date.now(); copy.updatedAt = copy.createdAt; copy.pinned = false;
      items.push(copy); saveItems(); refreshAll();
      toast('Tabela duplicada.');
    }
    function duplicateSheet(){
      const cur = sheet();
      const fresh = blankSheet(cur.rows, cur.cols);
      fresh.colWidths = [...cur.colWidths]; fresh.rowHeights = [...cur.rowHeights]; fresh.colTypes = [...cur.colTypes];
      it.sheets.push(fresh); it.activeSheet = it.sheets.length-1;
      touch(it); saveItems(); refreshAll();
      renderTabs(); renderGrid(); updateSidePanel();
      toast('Nova aba criada com o mesmo molde.');
    }

    /* ---- color popover ---- */
    function renderColorSwatches(){
      $('#colorSwatches').innerHTML = TABLE_COLORS.map(c=>
        c===null ? `<button class="swatch add-custom" data-color="" title="Limpar cor">✕</button>`
                  : `<button class="swatch" style="background:${c};" data-color="${c}"></button>`
      ).join('');
      $all('[data-color]', $('#colorSwatches')).forEach(sw=> sw.addEventListener('click', ()=> applyTableColor(sw.dataset.color || null)));
    }
    function applyTableColor(color){
      const s = sheet();
      if(colorScope==='col'){ for(let r=0;r<s.rows;r++) s.cellColors[r][currentCol] = color; }
      else { s.cellColors[currentRow][currentCol] = color; }
      touch(it); saveItems(); renderGrid(); closeAllPopovers();
    }
    $all('[data-scope]', $('#colorScopeToggle')).forEach(b=> b.addEventListener('click', ()=>{
      colorScope = b.dataset.scope;
      $all('[data-scope]', $('#colorScopeToggle')).forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
    }));

    /* ---- icon popover ---- */
    function renderIconPop(){
      $('#iconGrid').innerHTML = CELL_ICONS.map(ic=>`<button class="icon-opt" data-icon="${ic}" style="color:${iconColor};">${ic}</button>`).join('');
      $('#iconSwatches').innerHTML = DEFAULT_PALETTE.map(c=>`<button class="swatch ${c===iconColor?'active':''}" style="background:${c};" data-icolor="${c}"></button>`).join('');
      $all('[data-icon]', $('#iconGrid')).forEach(b=> b.addEventListener('click', ()=> insertIconIntoCell(b.dataset.icon, iconColor)));
      $all('[data-icolor]', $('#iconSwatches')).forEach(b=> b.addEventListener('click', ()=>{ iconColor = b.dataset.icolor; renderIconPop(); }));
    }
    function insertIconIntoCell(icon, color){
      sheet().cellIcons[currentRow][currentCol] = { icon, color };
      touch(it); saveItems(); renderGrid(); closeAllPopovers();
    }

    /* ---- type popover ---- */
    function renderTypePop(){
      const s = sheet();
      $('#colTypeGrid').innerHTML = COL_TYPES.map(t=>
        `<button data-ctype="${t.v}" class="${s.colTypes[currentCol]===t.v?'active-type':''}">${t.label}</button>`
      ).join('');
      $all('[data-ctype]', $('#colTypeGrid')).forEach(b=> b.addEventListener('click', ()=>{
        const s2 = sheet();
        s2.colTypes[currentCol] = (s2.colTypes[currentCol]===b.dataset.ctype) ? null : b.dataset.ctype;
        touch(it); saveItems(); renderGrid(); renderTypePop(); closeAllPopovers();
      }));
    }
    $all('[data-tact]', $('#typePop')).forEach(b=> b.addEventListener('click', ()=>{
      const act = b.dataset.tact;
      if(act==='pin'){ it.pinned = !it.pinned; touch(it); saveItems(); refreshAll(); toast(it.pinned?'Tabela fixada.':'Tabela desfixada.'); }
      else if(act==='save'){ saveItems(); toast('Tabela guardada.'); }
      else if(act==='dup'){ duplicateWholeTable(); }
      else if(act==='del'){ deleteItem(it); }
      closeAllPopovers();
    }));

    /* ---- calc summary ---- */
    function renderCalcSummary(){
      const s = sheet();
      const parts = [];
      s.colTypes.forEach((t,c)=>{
        if(t==='calcular'){
          let sum = 0;
          s.cells.forEach(row=>{ const v = parseFloat(String(row[c]||'').replace(',','.')); if(!isNaN(v)) sum += v; });
          parts.push('Coluna '+(c+1)+': '+sum.toLocaleString('pt-BR'));
        }
      });
      $('#calcSummary').textContent = parts.join(' · ');
    }

    /* ---- side panel ---- */
    function updateSidePanel(){
      if(!sidePanelOpen) return;
      const s = sheet();
      const body = $('#sidePanelBody');
      if(selectedRow===null || selectedRow>=s.rows){ body.innerHTML = '<p class="empty-hint">Selecione uma linha pra ver os detalhes.</p>'; return; }
      const meta = s.rowMeta[selectedRow];
      const cellsHtml = s.cells[selectedRow].map((v,c)=>{
        const label = s.colTypes[c] ? ' ('+s.colTypes[c]+')' : '';
        return `<div class="sp-row"><strong>Coluna ${c+1}${label}:</strong> ${v?escapeHtml(v):'—'}</div>`;
      }).join('');
      body.innerHTML = `
        ${meta.emoji?`<div class="sp-emoji">${meta.emoji}</div>`:''}
        <div class="sp-row"><strong>Linha:</strong> ${selectedRow+1} ${meta.favorite?'★ favorita':''}</div>
        <div class="sp-row"><strong>Comentário:</strong> ${meta.comment?escapeHtml(meta.comment):'nenhum'}</div>
        ${cellsHtml}
      `;
    }
    $('#sideToggleBtn').addEventListener('click', ()=>{
      sidePanelOpen = !sidePanelOpen;
      $('#sidePanel').classList.toggle('hidden', !sidePanelOpen);
      updateSidePanel();
    });

    /* ---- toolbar wiring ---- */
    togglePopover($('#colorBtn'), $('#colorPop'));
    togglePopover($('#iconBtn'), $('#iconPop'));
    togglePopover($('#typeBtn'), $('#typePop'));
    $('#addRowBtn').addEventListener('click', ()=>{
      const s = sheet();
      s.cells.push(Array(s.cols).fill(''));
      s.cellColors.push(Array(s.cols).fill(null));
      s.cellIcons.push(Array(s.cols).fill(null));
      s.rowHeights.push(34);
      s.rowMeta.push({favorite:false, emoji:'', comment:''});
      s.rows++;
      touch(it); saveItems(); renderGrid();
    });
    $('#addColBtn').addEventListener('click', ()=>{
      const s = sheet();
      s.cells.forEach(row=> row.push(''));
      s.cellColors.forEach(row=> row.push(null));
      s.cellIcons.forEach(row=> row.push(null));
      s.colWidths.push(96); s.colTypes.push(null); s.cols++;
      touch(it); saveItems(); renderGrid();
    });
    $('#addSheetBtn').addEventListener('click', duplicateSheet);

    renderColorSwatches();
    renderIconPop();
    renderTypePop();
    renderTabs();
    renderGrid();
  }

  /* ================================================================== */
  /* ---------------------------- ANOTAÇÃO ------------------------------ */
  /* ================================================================== */
  function openNoteForm(){
    openModal(`
      <h3 class="modal-title">Nova anotação</h3>
      <div class="field">
        <label>Nome da anotação</label>
        <input type="text" id="noteName" placeholder="ex: Ideias do projeto">
      </div>
      <div class="field">
        <label>Tipo</label>
        <div class="type-toggle">
          <button type="button" class="selected" data-vis="publico">Pública</button>
          <button type="button" data-vis="privado">Privada</button>
        </div>
      </div>
      <div class="field" id="notePassField" style="display:none;">
        <label>Senha de 4 dígitos</label>
        <input type="password" id="notePass" maxlength="4" inputmode="numeric" placeholder="0000">
      </div>
      <button class="btn-primary" id="createNoteBtn">Criar anotação</button>
    `);
    let vis = 'publico';
    $all('.type-toggle button').forEach(b=>{
      b.addEventListener('click', ()=>{
        $all('.type-toggle button').forEach(x=>x.classList.remove('selected'));
        b.classList.add('selected'); vis = b.dataset.vis;
        $('#notePassField').style.display = vis==='privado' ? 'block' : 'none';
      });
    });
    $('#createNoteBtn').addEventListener('click', ()=>{
      try{
        const name = $('#noteName').value.trim();
        if(!name){ toast('Dê um nome pra sua anotação.'); return; }
        let pass = '';
        if(vis==='privado'){
          pass = $('#notePass').value.trim();
          if(!/^\d{4}$/.test(pass)){ toast('A senha precisa ter exatamente 4 dígitos.'); return; }
        }
        const now = Date.now();
        const it = { id: uid(), type:'nota', name, createdAt: now, updatedAt: now,
          note: { isPrivate: vis==='privado', password: pass, content: '', unlocked: true } };
        items.push(it); saveItems(); refreshAll(); closeModal();
        openNoteFullscreen(it);
      }catch(err){ console.error('Erro ao criar anotação:', err); toast('Não consegui criar a anotação. Tente de novo.'); }
    });
  }

  function openNoteViewer(it){
    if(it.note.isPrivate && !it.note.unlocked){
      openModal(`
        <h3 class="modal-title">🔒 ${escapeHtml(it.name)}</h3>
        <p class="modal-sub">Essa anotação é privada. Informe a senha de 4 dígitos.</p>
        <div class="field"><input type="password" id="unlockPass" maxlength="4" inputmode="numeric" placeholder="0000"></div>
        <button class="btn-primary" id="unlockBtn">Desbloquear</button>
      `);
      const tryUnlock = ()=>{
        const val = $('#unlockPass').value.trim();
        if(val === it.note.password){ it.note.unlocked = true; closeModal(); openNoteFullscreen(it); }
        else toast('Senha incorreta.');
      };
      $('#unlockBtn').addEventListener('click', tryUnlock);
      $('#unlockPass').addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryUnlock(); });
      return;
    }
    openNoteFullscreen(it);
  }

  function openNoteFullscreen(it){
    let savedRange = null;

    const bodyHtml = `
      <div class="note-toolbar" id="noteToolbar">
        <select id="fontFamily" title="Família da fonte">
          <option value="Manrope">Manrope</option>
          <option value="Georgia">Georgia</option>
          <option value="JetBrains Mono">Monoespaçada</option>
          <option value="Caveat">Cursiva</option>
        </select>
        <div class="divider"></div>
        <button data-cmd="bold" title="Negrito"><b>B</b></button>
        <button data-cmd="italic" title="Itálico"><i>I</i></button>
        <button data-cmd="underline" title="Sublinhado"><u>S</u></button>
        <button data-cmd="strikeThrough" title="Rasurar">A̶</button>
        <div class="divider"></div>
        <div class="popover-wrap">
          <button id="typeTextBtn">Tipo de texto</button>
          <div class="popover" id="typeTextPop">
            <button data-block="&lt;h1&gt;" style="display:block;width:100%;text-align:left;margin-bottom:4px;">Título</button>
            <button data-block="&lt;h2&gt;" style="display:block;width:100%;text-align:left;margin-bottom:4px;">Cabeçalho</button>
            <button data-block="&lt;h3&gt;" style="display:block;width:100%;text-align:left;margin-bottom:4px;">Subtítulo</button>
            <button data-block="&lt;p&gt;" style="display:block;width:100%;text-align:left;">Normal</button>
          </div>
        </div>
        <div class="popover-wrap">
          <button id="colorTxtBtn">🎨 Cor</button>
          <div class="popover" id="colorTxtPop">
            <div class="pop-title">Paleta</div>
            <div class="swatches" id="paletteSwatches"></div>
            <div class="pop-title">Cor personalizada</div>
            <input type="color" id="customColorInput" value="#ff7a1a">
          </div>
        </div>
        <input type="number" id="fontSizeInput" min="1" max="30" value="3" title="Tamanho (1 a 30)">
        <div class="divider"></div>
        <div class="popover-wrap">
          <button id="alignBtn">Alinhar</button>
          <div class="popover" id="alignPop">
            <button data-align="justifyLeft" style="display:block;width:100%;text-align:left;margin-bottom:4px;">⟸ Esquerda</button>
            <button data-align="justifyCenter" style="display:block;width:100%;text-align:left;margin-bottom:4px;">☰ Centro</button>
            <button data-align="justifyFull" style="display:block;width:100%;text-align:left;margin-bottom:4px;">≣ Justificado</button>
            <button data-align="justifyRight" style="display:block;width:100%;text-align:left;">⟹ Direita</button>
          </div>
        </div>
        <div class="popover-wrap">
          <button id="listBtn">Lista</button>
          <div class="popover" id="listPop">
            <button data-list="bolinha" style="display:block;width:100%;text-align:left;margin-bottom:4px;">• Bolinha</button>
            <button data-list="numero" style="display:block;width:100%;text-align:left;margin-bottom:4px;">1. Número</button>
            <button data-list="traco" style="display:block;width:100%;text-align:left;">– Traço</button>
          </div>
        </div>
        <button id="checkBtn" title="Caixinha de marcar">◯</button>
        <button id="insertImgBtn" title="Inserir foto">🖼</button>
        <input type="file" id="imgInput" accept="image/*" style="display:none;">
      </div>
      <div class="note-body" id="noteBody" contenteditable="true">${it.note.content}</div>
    `;
    openFullscreen(it.name, bodyHtml, `<button class="danger" id="fsDeleteBtn" title="Excluir">🗑</button>`);
    $('#fsDeleteBtn').addEventListener('click', ()=> deleteItem(it));
    $all('button', $('#noteToolbar')).forEach(preventFocusSteal);
    try{ document.execCommand('styleWithCSS', false, true); }catch(e){ /* ignora se indisponível */ }

    const noteBody = $('#noteBody');

    function trackSelection(){
      const sel = window.getSelection();
      if(sel.rangeCount>0){
        const range = sel.getRangeAt(0);
        if(noteBody.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
      }
    }
    function restoreSelection(){
      noteBody.focus();
      if(savedRange){
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
    }
    function saveNote(){ it.note.content = noteBody.innerHTML; touch(it); debouncedSave(); }
    function updateToolbarStates(){
      const map = { bold:'bold', italic:'italic', underline:'underline', strikeThrough:'strikeThrough' };
      Object.keys(map).forEach(cmd=>{
        let state = false;
        try{ state = document.queryCommandState(cmd); }catch(e){ state=false; }
        const btn = $('[data-cmd="'+cmd+'"]', $('#noteToolbar'));
        if(btn) btn.classList.toggle('active', state);
      });
    }

    noteBody.addEventListener('mouseup', ()=>{ trackSelection(); updateToolbarStates(); });
    noteBody.addEventListener('keyup', ()=>{ trackSelection(); updateToolbarStates(); saveNote(); });
    noteBody.addEventListener('input', saveNote);
    noteBody.addEventListener('focus', trackSelection);
    noteBody.addEventListener('click', (e)=>{
      if(e.target.classList.contains('chk-mark')){
        e.target.textContent = e.target.textContent==='○' ? '⬤' : '○';
        saveNote();
      }
    });

    $all('[data-cmd]', $('#noteToolbar')).forEach(b=> b.addEventListener('click', ()=>{
      restoreSelection(); document.execCommand(b.dataset.cmd, false, null); trackSelection(); updateToolbarStates(); saveNote();
    }));

    togglePopover($('#typeTextBtn'), $('#typeTextPop'), trackSelection);
    togglePopover($('#colorTxtBtn'), $('#colorTxtPop'), trackSelection);
    togglePopover($('#alignBtn'), $('#alignPop'), trackSelection);
    togglePopover($('#listBtn'), $('#listPop'), trackSelection);

    $all('[data-block]', $('#typeTextPop')).forEach(b=> b.addEventListener('click', ()=>{
      restoreSelection(); document.execCommand('formatBlock', false, b.dataset.block); trackSelection(); saveNote(); closeAllPopovers();
    }));
    $all('[data-align]', $('#alignPop')).forEach(b=> b.addEventListener('click', ()=>{
      restoreSelection(); document.execCommand(b.dataset.align, false, null); trackSelection(); updateToolbarStates(); saveNote(); closeAllPopovers();
    }));
    $all('[data-list]', $('#listPop')).forEach(b=> b.addEventListener('click', ()=>{
      restoreSelection();
      const type = b.dataset.list;
      if(type==='bolinha') document.execCommand('insertUnorderedList', false, null);
      else if(type==='numero') document.execCommand('insertOrderedList', false, null);
      else if(type==='traco') document.execCommand('insertHTML', false, '<div>– nova linha</div>');
      trackSelection(); saveNote(); closeAllPopovers();
    }));

    function renderPalette(){
      $('#paletteSwatches').innerHTML = notePalette.map(c=>`<button class="swatch" style="background:${c};" data-pc="${c}"></button>`).join('');
      $all('[data-pc]', $('#paletteSwatches')).forEach(b=>{
        preventFocusSteal(b);
        b.addEventListener('click', ()=>{
          restoreSelection(); document.execCommand('foreColor', false, b.dataset.pc); trackSelection(); saveNote(); closeAllPopovers();
        });
      });
    }
    renderPalette();
    $('#customColorInput').addEventListener('mousedown', trackSelection);
    $('#customColorInput').addEventListener('input', ()=>{
      const c = $('#customColorInput').value;
      restoreSelection(); document.execCommand('foreColor', false, c); trackSelection(); saveNote();
      if(!notePalette.includes(c)){
        notePalette.push(c); if(notePalette.length>12) notePalette.shift();
        saveNotePalette(); renderPalette();
      }
    });

    $('#fontSizeInput').addEventListener('mousedown', trackSelection);
    $('#fontSizeInput').addEventListener('change', ()=>{
      let n = parseInt($('#fontSizeInput').value, 10);
      if(isNaN(n)) n = 3; n = Math.max(1, Math.min(30, n));
      $('#fontSizeInput').value = n;
      restoreSelection();
      document.execCommand('fontSize', false, '7');
      $all('font[size="7"]', noteBody).forEach(f=>{
        const span = document.createElement('span');
        span.style.fontSize = (10 + (n-1)*2) + 'px';
        while(f.firstChild) span.appendChild(f.firstChild);
        f.replaceWith(span);
      });
      trackSelection(); saveNote();
    });

    $('#fontFamily').addEventListener('mousedown', trackSelection);
    $('#fontFamily').addEventListener('change', (e)=>{
      restoreSelection(); document.execCommand('fontName', false, e.target.value); trackSelection(); saveNote();
    });

    $('#checkBtn').addEventListener('click', ()=>{
      restoreSelection();
      const sel = window.getSelection();
      if(sel.rangeCount===0){ noteBody.focus(); return; }
      let node = sel.getRangeAt(0).startContainer;
      let lineEl = node.nodeType===3 ? node.parentElement : node;
      while(lineEl && lineEl!==noteBody && !(lineEl.classList && lineEl.classList.contains('chk-line'))) lineEl = lineEl.parentElement;
      if(lineEl && lineEl.classList && lineEl.classList.contains('chk-line')){
        const p = document.createElement('div');
        p.textContent = lineEl.textContent.replace(/^[○⬤]\s*/, '');
        lineEl.replaceWith(p);
      } else {
        document.execCommand('insertHTML', false, '<div class="chk-line"><span class="chk-mark" contenteditable="false">○</span>nova tarefa</div>');
      }
      trackSelection(); saveNote();
    });

    $('#insertImgBtn').addEventListener('click', ()=>{ trackSelection(); $('#imgInput').click(); });
    $('#imgInput').addEventListener('change', (e)=>{
      const file = e.target.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{ restoreSelection(); document.execCommand('insertImage', false, reader.result); trackSelection(); saveNote(); };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }

  /* ============ SCROLL PARALLAX ============ */
  const hero = $('.hero');
  function onScroll(){
    const y = window.scrollY;
    hero.style.transform = `translateY(${y*0.25}px)`;
    hero.style.opacity = Math.max(0, 1 - y/420);
    $all('.picker-card').forEach(card=>{
      const rect = card.getBoundingClientRect();
      if(rect.top < window.innerHeight*0.85) card.classList.add('in-view');
    });
  }
  window.addEventListener('scroll', onScroll, { passive:true });

  /* ============ INIT ============ */
  async function init(){
    await loadAll();
    renderCalcButtons();
    renderCalcHistory();
    bindSearch();
    refreshAll();
    onScroll();
  }
  init();
})();
