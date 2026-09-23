let documents = [];
let currentIndex = 0;

const $ = (selector) => document.querySelector(selector);
const slugify = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function renderNavigation(filter = '') {
  const needle = filter.trim().toLowerCase();
  const groups = new Map();
  documents.forEach((document, index) => {
    if (needle && !`${document.title} ${document.content}`.toLowerCase().includes(needle)) return;
    if (!groups.has(document.group)) groups.set(document.group, []);
    groups.get(document.group).push({ document, index });
  });
  $('#document-nav').innerHTML = [...groups.entries()].map(([group, entries]) => `
    <section class="nav-group"><div class="nav-group-label">${group}</div>
      ${entries.map(({ document, index }) => `<button class="doc-link ${index === currentIndex ? 'active' : ''}" data-index="${index}">${document.title}</button>`).join('')}
    </section>`).join('') || '<div class="nav-group-label">Nenhum resultado</div>';
  document.querySelectorAll('.doc-link').forEach((button) => button.addEventListener('click', () => openDocument(Number(button.dataset.index))));
}

function renderOutline() {
  const headings = [...$('#content').querySelectorAll('h2, h3')];
  headings.forEach((heading) => { heading.id = slugify(heading.textContent); });
  $('#outline').innerHTML = headings.map((heading) => `<a class="level-${heading.tagName.slice(1)}" href="#${heading.id}">${heading.textContent}</a>`).join('');
}

function openDocument(index) {
  currentIndex = index;
  const document = documents[index];
  $('#current-title').textContent = document.title;
  $('#content').innerHTML = marked.parse(document.content, { gfm: true, breaks: false });
  $('#document-count').textContent = `${index + 1} de ${documents.length}`;
  $('#previous-button').disabled = index === 0;
  $('#next-button').disabled = index === documents.length - 1;
  renderNavigation($('#search').value);
  renderOutline();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  $('#content').querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href');
    if (href?.startsWith('http')) link.addEventListener('click', (event) => { event.preventDefault(); window.documentation.openExternal(href); });
    else if (href?.startsWith('#')) link.addEventListener('click', () => setTimeout(() => history.replaceState(null, '', href), 0));
  });
}

async function init() {
  documents = await window.documentation.load();
  renderNavigation();
  if (documents.length) openDocument(0);
  else $('#content').innerHTML = '<h1>Nenhuma documentação encontrada</h1><p>Escolha uma pasta que contenha arquivos Markdown.</p>';
}

$('#search').addEventListener('input', (event) => renderNavigation(event.target.value));
$('#folder-button').addEventListener('click', async () => {
  const selected = await window.documentation.chooseFolder();
  if (!selected) return;
  documents = selected;
  currentIndex = 0;
  $('#search').value = '';
  renderNavigation();
  if (documents.length) openDocument(0);
  else $('#content').innerHTML = '<h1>Nenhuma documentação encontrada</h1><p>A pasta selecionada não contém arquivos Markdown.</p>';
});
$('#previous-button').addEventListener('click', () => openDocument(currentIndex - 1));
$('#next-button').addEventListener('click', () => openDocument(currentIndex + 1));
$('#print-button').addEventListener('click', () => window.print());
$('#theme-button').addEventListener('click', () => document.body.classList.toggle('dark'));
$('#menu-button').addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search').focus(); } });
init();