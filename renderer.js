(function () {
  const $ = (id) => document.getElementById(id);
  const editor = $('editor');
  const consoleEl = $('console');
  const commandInput = $('command');
  const fileNameEl = $('file-name');
  const dirtyEl = $('dirty');
  const runBtn = $('btn-run');
  const selBtn = $('btn-selection');
  const stopBtn = $('btn-stop');
  const statusEl = $('pwsh-status');
  const runStateEl = $('run-state');
  const cursorEl = $('cursor-pos');

  const state = { filePath: null, saved: '', running: false };

  const SNIPPETS = [
    { name: 'Get processes', code: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10' },
    { name: 'Get services', code: 'Get-Service | Where-Object Status -eq "Running"' },
    { name: 'Disk usage', code: 'Get-PSDrive -PSProvider FileSystem' },
    { name: 'PowerShell version', code: '$PSVersionTable' },
    { name: 'List files', code: 'Get-ChildItem -Force | Format-Table Mode, Length, Name' },
    { name: 'Get-Date (ISO)', code: 'Get-Date -Format o' },
  ];

  const isDirty = () => editor.value !== state.saved;

  function refreshTitle() {
    const name = state.filePath ? state.filePath.split('/').pop() : 'Untitled1.ps1';
    fileNameEl.textContent = name;
    dirtyEl.hidden = !isDirty();
    document.title = `${isDirty() ? '*' : ''}${name} - PowerShell ISE`;
  }

  function setRunning(running) {
    state.running = running;
    runBtn.disabled = running;
    selBtn.disabled = running;
    stopBtn.disabled = !running;
    runStateEl.textContent = running ? 'Running' : 'Ready';
  }

  function append(kind, text) {
    const span = document.createElement('span');
    if (kind === 'error') span.className = 'error';
    else if (kind === 'info') span.className = 'info';
    else if (kind === 'prompt') span.className = 'prompt-line';
    span.textContent = text;
    consoleEl.appendChild(span);
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  function selectedText() {
    return editor.value.substring(editor.selectionStart, editor.selectionEnd);
  }

  async function confirmIfDirty() {
    if (!isDirty()) return true;
    return window.ise.confirmDiscard();
  }

  async function newScript() {
    if (!(await confirmIfDirty())) return;
    state.filePath = null;
    state.saved = '';
    editor.value = '';
    refreshTitle();
    editor.focus();
  }

  async function openScript() {
    if (!(await confirmIfDirty())) return;
    const res = await window.ise.openFile();
    if (!res) return;
    state.filePath = res.filePath;
    state.saved = res.text;
    editor.value = res.text;
    refreshTitle();
  }

  async function saveScript(saveAs) {
    const res = await window.ise.saveFile(state.filePath, editor.value, saveAs);
    if (!res) return;
    state.filePath = res.filePath;
    state.saved = editor.value;
    refreshTitle();
  }

  function runScript() {
    if (state.running) return;
    window.ise.runScript(editor.value, '');
  }

  function runSelection() {
    if (state.running) return;
    const sel = selectedText();
    window.ise.runScript(editor.value, sel);
  }

  // Full list from PowerShell's Get-Command, filled in by loadCommands().
  let allCommands = [];
  const MAX_ROWS = 300; // keeps the list responsive; narrow the filter to see more

  function addItem(list, name, code, title) {
    const li = document.createElement('li');
    li.title = title;
    const nameEl = document.createElement('div');
    nameEl.className = 'name';
    nameEl.textContent = name;
    const codeEl = document.createElement('div');
    codeEl.className = 'code';
    codeEl.textContent = code;
    li.append(nameEl, codeEl);
    li.addEventListener('click', () => {
      commandInput.value = code;
      commandInput.focus();
    });
    list.appendChild(li);
  }

  function renderCommands() {
    const list = $('snippets');
    const q = $('cmd-filter').value.trim().toLowerCase();
    list.replaceChildren();

    const snippets = SNIPPETS.filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
    for (const s of snippets) addItem(list, s.name, s.code, 'Snippet: click to copy into the command line');

    const matches = q
      ? allCommands.filter((c) => c.name.toLowerCase().includes(q))
      : allCommands;
    const shown = matches.slice(0, MAX_ROWS);
    for (const c of shown) addItem(list, c.name, c.module ? `${c.type} · ${c.module}` : c.type, `${c.type}: click to copy into the command line`);

    $('cmd-count').textContent = `${matches.length} of ${allCommands.length}`;
    if (matches.length > MAX_ROWS) {
      const more = document.createElement('li');
      more.className = 'more';
      more.textContent = `Showing first ${MAX_ROWS}. Type more to narrow the list.`;
      list.appendChild(more);
    }
  }

  async function loadCommands() {
    const status = $('cmd-status');
    status.hidden = false;
    status.textContent = 'Loading commands…';
    const res = await window.ise.listCommands();
    if (res.error) {
      status.textContent = res.error;
      status.classList.add('error');
      return;
    }
    allCommands = res.commands.sort((a, b) => a.name.localeCompare(b.name));
    status.hidden = true;
    renderCommands();
  }

  $('cmd-filter').addEventListener('input', renderCommands);
  renderCommands();
  loadCommands();

  // Editor behaviour: Tab inserts 4 spaces, keeps indentation on Enter.
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText('    ', start, end, 'end');
      editor.dispatchEvent(new Event('input'));
    }
  });
  editor.addEventListener('input', refreshTitle);
  const updateCursor = () => {
    const before = editor.value.substring(0, editor.selectionStart).split('\n');
    cursorEl.textContent = `Ln ${before.length}, Col ${before[before.length - 1].length + 1}`;
  };
  ['keyup', 'click', 'select'].forEach((ev) => editor.addEventListener(ev, updateCursor));

  $('command-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const cmd = commandInput.value;
    if (!cmd.trim()) return;
    commandInput.value = '';
    window.ise.runCommand(cmd);
  });

  $('btn-new').addEventListener('click', newScript);
  $('btn-open').addEventListener('click', openScript);
  $('btn-save').addEventListener('click', () => saveScript(false));
  runBtn.addEventListener('click', runScript);
  selBtn.addEventListener('click', runSelection);
  stopBtn.addEventListener('click', () => window.ise.stop());
  $('btn-clear').addEventListener('click', () => (consoleEl.textContent = ''));

  // Keyboard shortcuts that the menu cannot bind in a focused text field.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F5' && e.shiftKey) { e.preventDefault(); window.ise.stop(); }
    else if (e.key === 'F5') { e.preventDefault(); runScript(); }
    else if (e.key === 'F8') { e.preventDefault(); runSelection(); }
  });

  // Menu actions from the native macOS menu bar.
  window.ise.onMenu((action) => {
    const actions = {
      new: newScript,
      open: openScript,
      save: () => saveScript(false),
      saveAs: () => saveScript(true),
      run: runScript,
      runSelection,
      stop: () => window.ise.stop(),
      clear: () => (consoleEl.textContent = ''),
    };
    if (actions[action]) actions[action]();
  });

  window.ise.onConsole(({ kind, text }) => append(kind, text));
  window.ise.onRunState(({ running }) => setRunning(running));

  window.addEventListener('beforeunload', (e) => {
    if (isDirty()) e.preventDefault();
  });

  async function showPwshStatus() {
    const info = await window.ise.info();
    if (info.exe && info.version) {
      statusEl.textContent = `PowerShell ${info.version}`;
      statusEl.className = 'status ok';
    } else {
      statusEl.textContent = 'PowerShell 7 not found';
      statusEl.className = 'status bad';
    }
  }

  refreshTitle();
  setRunning(false);
  showPwshStatus();
  append('info', 'Windows PowerShell ISE for macOS. Scripts run on PowerShell 7 (pwsh).\n\n');
  editor.focus();
})();
