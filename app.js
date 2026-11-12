function interpretTool(name, score) {
  if (score === null) return 'Unavailable';
  if (name === 'CADD') return score >= 15 ? 'Elevated deleteriousness' : score > 10 ? 'Intermediate' : 'Lower deleteriousness';
  if (name === 'SIFT') return score <= 0.05 ? 'Deleterious' : 'Tolerated';
  if (name === 'REVEL') return score >= 0.5 ? 'Pathogenic support' : 'Benign support';
  return score >= 0.5 ? 'Pathogenic support' : score > 0.34 ? 'Intermediate' : 'Benign support';
}
const DATA_URL = 'assets/ClinVar_data_prediction.csv';
const state = { rows: [], showAll: false, database: window.GSDVPRED_DATA || null };
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function activateTab(name) {
  $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));
  $$('.tab-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === name));
  window.scrollTo({ top: $('.tabs').offsetTop, behavior: 'smooth' });
}

function activateMode(name) {
  $$('.mode-btn').forEach((button) => button.classList.toggle('is-active', button.dataset.mode === name));
  $$('.mode-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.modePanel === name));
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const parseLine = (line) => {
    const cells = [];
    let value = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"' && quoted) { value += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { cells.push(value); value = ''; }
      else value += char;
    }
    cells.push(value);
    return cells;
  };
  const headers = parseLine(lines.shift());
  return lines.map(parseLine).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function normalizeVariant(value) {
  const cleaned = value.trim().replace(/^chr/i, '').replace(/\s+/g, '').toUpperCase();
  const database = cleaned.match(/^([^:]+):(\d+)-(?:\d+)_([ACGT]+)\/([ACGT]+)$/);
  if (database) return `${database[1]}:${database[2]}:${database[3]}:${database[4]}`;
  const compact = cleaned.match(/^([^:]+):(\d+):([ACGT]+):([ACGT]+)$/);
  if (compact) return `${compact[1]}:${compact[2]}:${compact[3]}:${compact[4]}`;
  return cleaned;
}

function inputVariants() {
  const pasteMode = $('.mode-btn[data-mode="paste"]').classList.contains('is-active');
  if (pasteMode) {
    return $('#variant-input').value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 250);
  }
  const file = $('#vcf-file').files[0];
  if (!file) return Promise.resolve([]);
  if (file.name.toLowerCase().endsWith('.gz')) return Promise.reject(new Error('Compressed VCF is not supported in this static demo. Please use an uncompressed VCF.'));
  return file.text().then((text) => text.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#')).flatMap((line) => {
    const columns = line.trim().split(/\t+/);
    if (columns.length < 5) { const cell = line.trim().split(',')[0].replace(/^"|"$/g, ''); return /^(variant|upload_variant|gene[:_]?hgvs)$/i.test(cell) ? [] : [cell]; }
    const [chrom, position, , ref, alt] = columns;
    return alt.split(',').map((alternate) => `${chrom}:${position}:${ref}:${alternate}`);
  }).slice(0, 250));
}

function number(value) {
  if (value === undefined || value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classifyGsd(score) {
  if (score === null) return { label: 'Unavailable', css: 'missing' };
  if (score >= 0.9) return { label: 'Pathogenic range', css: 'pathogenic' };
  if (score <= 0.1) return { label: 'Benign range', css: 'benign' };
  return { label: 'Intermediate', css: 'vus' };
}

function findRows(variants) {
  const index = new Map();
  state.database.forEach((row) => {
    const key = normalizeVariant(row.u_identity);
    if (!index.has(key)) index.set(key, row);
  });
  return variants.map((query) => {
    const key = normalizeVariant(query);
    const source = index.get(key) || state.database.find((r) => [r.HGVSc, r.SYMBOL + ':' + (r.HGVSc || '').split(':').pop()].some((alias) => normalizeVariant(alias || '') === key));
    if (!source) return { query, found: false };
    const gsdScore = number(source.GSDVPred_Platt_probability);
    const tools = ['CADD', 'SIFT', 'REVEL', 'AlphaMissense'].map((name) => ({ name, score: number(source[name]), result: interpretTool(name, number(source[name])) }));
    return {
      query,
      found: true,
      variant: source.u_identity,
      gene: source.SYMBOL,
      hgvsc: source.HGVSc,
      hgvsp: source.HGVSp,
      consequence: source.Consequence,
      gsdScore,
      gsdClass: classifyGsd(gsdScore),
      tools
    };
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function renderRows() {
  $('#download-results').disabled = !state.rows.length;
  const visible = state.rows.slice(0, state.showAll ? state.rows.length : 8);
  $('#results-body').innerHTML = visible.map((row) => {
    if (!row.found) return `<tr><td><code>${escapeHtml(row.query)}</code><small>No exact match in this results dataset</small></td><td colspan="7"><span class="class-tag missing">No stored prediction</span></td></tr>`;
    const tools = row.tools.map((tool) => `<td><div class="tool-value"><strong>${tool.score === null ? '—' : tool.score.toFixed(3)}</strong><small>${escapeHtml(tool.result)}</small></div></td>`).join('');
    return `<tr><td><code>${escapeHtml(row.variant)}</code><small>${escapeHtml(row.gene || 'Gene unavailable')} · ${escapeHtml(row.consequence || 'Consequence unavailable')}</small></td><td>${escapeHtml(row.consequence)}</td><td><code>${escapeHtml(row.hgvsc || "Not available")}</code><small>${escapeHtml(row.hgvsp || "Not available")}</small></td><td><div class="tool-value"><strong>${row.gsdScore === null ? '—' : row.gsdScore.toFixed(3)}</strong><small><span class="class-tag ${row.gsdClass.css}">${row.gsdClass.label}</span></small></div></td>${tools}</tr>`;
  }).join('');
  const found = state.rows.filter((row) => row.found);

  $('#view-all').hidden = state.rows.length <= 8;
  $('#view-all').setAttribute('aria-expanded', String(state.showAll));
  $('#view-all').childNodes[0].textContent = state.showAll ? 'Show first 8 rows ' : `View all ${state.rows.length} rows `;
}

function downloadCsv() {
  if (!state.rows.length) return;
  const headers = ['query', 'matched', 'variant', 'gene', 'consequence', 'HGVSc', 'HGVSp', 'GSDVPred_probability', 'GSDVPred_class', 'CADD_raw', 'CADD_interpretation', 'SIFT_raw', 'SIFT_interpretation', 'REVEL_raw', 'REVEL_interpretation', 'AlphaMissense_raw', 'AlphaMissense_interpretation'];
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = state.rows.map((row) => {
    const tools = Object.fromEntries((row.tools || []).map((tool) => [tool.name, tool]));
    return [row.query, row.found, row.variant, row.gene, row.consequence, row.hgvsc, row.hgvsp, row.gsdScore, row.gsdClass?.label,
      tools.CADD?.score, tools.CADD?.result, tools.SIFT?.score, tools.SIFT?.result, tools.REVEL?.score, tools.REVEL?.result,
      tools.AlphaMissense?.score, tools.AlphaMissense?.result].map(quote).join(',');
  });
  const blob = new Blob([[headers.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'GSDVPred_tool_comparison.csv';
  link.click();
  URL.revokeObjectURL(url);
}

$$('.tab').forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
$$('.mode-btn').forEach((button) => button.addEventListener('click', () => activateMode(button.dataset.mode)));
$('#vcf-file').addEventListener('change', (event) => { $('#upload-name').textContent = event.target.files[0]?.name || 'No file selected'; });
$('#clear-input').addEventListener('click', () => {
  $('#variant-input').value = '';
  $('#vcf-file').value = '';
  $('#upload-name').textContent = 'No file selected';
  $$('.example-choice').forEach((choice) => { choice.checked = false; });
  state.rows = [];
  state.showAll = false;
  $('#download-results').disabled = true;
  $('#view-all').hidden = true;
  $('#run-status').textContent = 'Enter variants or select examples, then click Run to view results.';
  $('#results-body').innerHTML = '<tr><td colspan="8" class="empty-state">Enter a variant to look up a stored result.</td></tr>';
});
$('#run-prediction').addEventListener('click', async () => {
  const button = $('#run-prediction');
  const status = $('#run-status');
  button.disabled = true;
  status.textContent = 'Loading stored prediction results...';
  try {
    const variants = await inputVariants();
    if (!variants.length) throw new Error('Enter one or more variants or select a VCF file.');
    if (variants.length > 250) throw new Error('A maximum of 250 variants can be queried at a time.');
    if (!state.database) {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error('Could not load the published prediction dataset.');
      state.database = parseCsv(await response.text());
    }
    state.rows = findRows(variants);
    state.showAll = false;
    renderRows();
    const matched = state.rows.filter((row) => row.found).length;
    status.textContent = `${matched} of ${state.rows.length} variants matched the published results dataset. New predictions require the model service.`;
    $('.results-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
$$('.example-choice').forEach((choice) => choice.addEventListener('change', () => {
  const input = $('#variant-input');
  const values = input.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (choice.checked && !values.includes(choice.value)) values.push(choice.value);
  input.value = values.filter((value) => choice.checked || value !== choice.value).join('\n');
}));
$('#variant-input').addEventListener('input', () => {
  const values = $('#variant-input').value.split(/\r?\n/).map((value) => value.trim());
  $$('.example-choice').forEach((choice) => { choice.checked = values.includes(choice.value); });
});
$('#download-results').addEventListener('click', downloadCsv);
$('#view-all').addEventListener('click', () => { state.showAll = !state.showAll; renderRows(); });

$('#download-results').disabled = true;
$('#view-all').hidden = true;
if (window.lucide) window.lucide.createIcons();
