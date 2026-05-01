// HealthAI — Frontend Logic v2.0
const API_BASE = 'https://healthai-production-5bd2.up.railway.app';
let selectedFile = null;
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif'];
const LOADING_TEXTS = ['Reading your report...','Extracting values...','Analyzing health parameters...','Detecting abnormalities...','Generating diet recommendations...','Matching specialist doctors...','Finalizing your report...'];

document.addEventListener('DOMContentLoaded', () => {
  checkServerStatus();
  loadAllDoctors();
  setupDragDrop();
  setupTabs();
  setInterval(checkServerStatus, 30000);
});

async function checkServerStatus() {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('status-text');
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    if (data.ollama === 'connected') { dot.className = 'status-dot online'; text.textContent = 'AI Online'; }
    else { dot.className = 'status-dot offline'; text.textContent = 'Ollama Offline'; }
  } catch { dot.className = 'status-dot offline'; text.textContent = 'Server Offline'; }
}

function setupDragDrop() {
  const zone = document.getElementById('upload-zone');
  zone.addEventListener('dragover', (e) => { e.preventDefault(); document.getElementById('upload-card').classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => { document.getElementById('upload-card').classList.remove('drag-over'); });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    document.getElementById('upload-card').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });
  zone.addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', (e) => { if (e.target.files[0]) handleFileSelect(e.target.files[0]); });
}

function handleFileSelect(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  const allowed = ['.pdf', ...IMAGE_EXTENSIONS];
  if (!allowed.includes(ext)) { showToast('Unsupported file type. Use: PDF, JPG, PNG, WEBP, BMP, TIFF', 'error'); return; }
  selectedFile = file;
  const isImage = IMAGE_EXTENSIONS.includes(ext);
  document.getElementById('upload-zone').classList.add('hidden');
  document.getElementById('file-preview').classList.remove('hidden');
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatFileSize(file.size);
  document.getElementById('file-icon').textContent = isImage ? '🖼️' : '📄';
  if (isImage) {
    const reader = new FileReader();
    reader.onload = (e) => { document.getElementById('img-preview').src = e.target.result; document.getElementById('img-preview-wrap').classList.remove('hidden'); };
    reader.readAsDataURL(file);
  } else { document.getElementById('img-preview-wrap').classList.add('hidden'); }
  document.getElementById('analyze-btn').disabled = false;
}

function removeFile() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-zone').classList.remove('hidden');
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('img-preview-wrap').classList.add('hidden');
  document.getElementById('analyze-btn').disabled = true;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function analyzeReport() {
  if (!selectedFile) return;

  document.getElementById('upload-card').classList.add('hidden');
  document.getElementById('upload-section').querySelector('.section-label').classList.add('hidden');
  document.getElementById('upload-section').querySelector('.section-title').classList.add('hidden');
  document.getElementById('loading-state').classList.remove('hidden');
  document.getElementById('results-section').classList.add('hidden');

  let i = 0;
  const interval = setInterval(() => {
    document.getElementById('loading-text').textContent = LOADING_TEXTS[i++ % LOADING_TEXTS.length];
  }, 2500);

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);

    const headers = authHeaders();
    console.log('Token:', getToken());
    console.log('Headers:', headers);

    const res = await fetch(`${API_BASE}/analyze-report`, {
      method: 'POST',
      body: formData,
      headers: headers
    });

    clearInterval(interval);

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Analysis failed');
    }

    const data = await res.json();
    renderResults(data);

  } catch (err) {
    clearInterval(interval);
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('upload-card').classList.remove('hidden');
    document.getElementById('upload-section').querySelector('.section-label').classList.remove('hidden');
    document.getElementById('upload-section').querySelector('.section-title').classList.remove('hidden');
    showToast(`Error: ${err.message}`, 'error');
  }
}
function renderResults(data) {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('results-section').classList.remove('hidden');
  const { analysis, suggested_doctors } = data;
  const score = analysis.overall_health_score || 70;
  document.getElementById('score-num').textContent = score;
  document.getElementById('score-summary').textContent = analysis.summary || '';
  setTimeout(() => {
    const arc = document.getElementById('score-arc');
    arc.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)';
    arc.style.strokeDashoffset = 314 - (score / 100) * 314;
    if (score >= 80) arc.style.stroke = 'var(--green)';
    else if (score < 50) arc.style.stroke = 'var(--red)';
  }, 200);
  if (analysis.urgent_attention_required) { document.getElementById('urgent-banner').classList.remove('hidden'); document.getElementById('urgent-reason').textContent = analysis.urgent_reason || ''; }
  renderProblems(analysis.health_problems || []);
  renderValues(analysis.normal_values || [], 'normal-grid', 'normal');
  renderValues(analysis.abnormal_values || [], 'abnormal-grid', 'abnormal');
  renderDiet(analysis.diet_recommendations || []);
  renderTreatment(analysis.treatment_suggestions || []);
  renderLifestyle(analysis.lifestyle_changes || []);
  renderDoctors(suggested_doctors || [], 'doctors-grid');
  renderParameterTable(analysis);
  renderMiniAnalysis(analysis);
  document.getElementById('results-secstion').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProblems(problems) {
  const grid = document.getElementById('problems-grid');
  grid.innerHTML = '';
  if (!problems.length) { grid.innerHTML = '<div class="problem-card mild"><p>🎉 No major problems detected!</p></div>'; return; }
  problems.forEach((p, i) => {
    const sev = (p.severity || 'mild').toLowerCase();
    const card = document.createElement('div');
    card.className = `problem-card ${sev}`;
    card.style.animationDelay = `${i * 0.1}s`;
    card.innerHTML = `<div class="problem-severity">${p.severity||'Mild'}</div><div class="problem-name">${p.problem||''}</div><div class="problem-organ">🫀 ${p.affected_organ||''}</div><div class="problem-desc">${p.description||''}</div>`;
    grid.appendChild(card);
  });
}

function renderValues(values, gridId, type) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';
  if (!values.length) { grid.innerHTML = `<div class="value-card" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">${type==='normal'?'✅ All values normal':'✅ No abnormal values'}</div>`; return; }
  values.forEach((v, i) => {
    const sc = (v.status||'').toLowerCase();
    const card = document.createElement('div');
    card.className = `value-card ${sc==='normal'?'normal':sc==='high'?'high':sc==='low'?'low':sc==='critical'?'critical':'normal'}`;
    card.innerHTML = `<div class="value-param">${v.parameter||''}</div><div class="value-num">${v.value||'--'}</div><div class="value-range">Normal: ${v.normal_range||'--'}</div><div class="value-status">${v.status||''}</div>`;
    grid.appendChild(card);
  });
}

function renderDiet(recs) {
  const grid = document.getElementById('diet-grid');
  grid.innerHTML = '';
  if (!recs.length) { grid.innerHTML = '<div class="diet-card eat" style="padding:30px">Follow a balanced and healthy diet.</div>'; return; }
  recs.forEach(rec => {
    const isEat = !(rec.category||'').toLowerCase().includes('avoid');
    const card = document.createElement('div');
    card.className = `diet-card ${isEat?'eat':'avoid'}`;
    card.innerHTML = `<div class="diet-category">${isEat?'✅':'🚫'} ${rec.category||''}</div><div class="diet-items">${(rec.items||[]).map(i=>`<span class="diet-item">${i}</span>`).join('')}</div><div class="diet-reason">${rec.reason||''}</div>`;
    grid.appendChild(card);
  });
}

function renderTreatment(treatments) {
  const list = document.getElementById('treatment-list');
  list.innerHTML = '';
  if (!treatments.length) { list.innerHTML = '<div style="color:var(--text-muted);padding:20px">No specific treatments. Please consult a doctor.</div>'; return; }
  treatments.forEach(t => {
    const urgency = (t.urgency||'routine').toLowerCase();
    const card = document.createElement('div');
    card.className = 'treatment-card';
    card.innerHTML = `<div class="treatment-urgency-dot urgency-${urgency}"></div><div><div class="treatment-urgency-label urgency-label-${urgency}">${t.urgency||'Routine'}</div><div class="treatment-name">${t.treatment||''}</div><div class="treatment-desc">${t.description||''}</div></div>`;
    list.appendChild(card);
  });
}

function renderLifestyle(changes) {
  const list = document.getElementById('lifestyle-list');
  list.innerHTML = '';
  if (!changes.length) { list.innerHTML = '<li>Maintain healthy lifestyle — exercise, sleep and balanced diet.</li>'; return; }
  changes.forEach(c => { const li = document.createElement('li'); li.textContent = c; list.appendChild(li); });
}

function renderDoctors(doctors, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';
  const emojis = ['👨‍⚕️','👩‍⚕️','🩺','💉','🏥'];
  doctors.forEach((doc, i) => {
    const card = document.createElement('div');
    card.className = 'doctor-card';
    card.style.animationDelay = `${i*0.12}s`;
    card.innerHTML = `<div class="doctor-avatar">${emojis[i%emojis.length]}</div><div class="doctor-name">${doc.name}</div><div class="doctor-spec">${doc.specialization}</div><div class="doctor-hospital">🏥 ${doc.hospital}</div><div class="doctor-avail">🕐 ${doc.available}</div><a href="tel:${doc.phone}" class="doctor-phone-btn">📞 ${doc.phone}</a>`;
    grid.appendChild(card);
  });
}

async function loadAllDoctors() {
  try {
    const res = await fetch(`${API_BASE}/doctors`);
    const data = await res.json();
    renderDoctors(data.doctors||[], 'all-doctors-grid');
  } catch { document.getElementById('all-doctors-grid').innerHTML = '<p style="color:var(--text-muted)">Could not connect to backend.</p>'; }
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove('hidden');
    });
  });
}

function resetAnalysis() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-zone').classList.remove('hidden');
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('img-preview-wrap').classList.add('hidden');
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('upload-section').classList.remove('hidden');
  document.getElementById('urgent-banner').classList.add('hidden');
  const arc = document.getElementById('score-arc');
  arc.style.transition = 'none';
  arc.style.strokeDashoffset = '314';
  document.getElementById('score-num').textContent = '--';
  document.getElementById('upload-section').scrollIntoView({ behavior: 'smooth' });
}

function showToast(message, type='info') {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = `position:fixed;bottom:30px;right:30px;z-index:9999;padding:16px 24px;border-radius:12px;background:${type==='error'?'rgba(255,82,82,0.15)':'rgba(0,229,255,0.12)'};border:1px solid ${type==='error'?'rgba(255,82,82,0.4)':'rgba(0,229,255,0.3)'};color:${type==='error'?'#ff8a80':'#80deea'};font-size:0.9rem;font-weight:500;backdrop-filter:blur(20px);max-width:360px;line-height:1.5;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
function renderParameterTable(analysis) {
  const existing = document.getElementById('param-table-section');
  if (existing) existing.remove();

  const all = [
    ...(analysis.normal_values || []).map(v => ({...v, risky: false})),
    ...(analysis.abnormal_values || []).map(v => ({...v, risky: true}))
  ];

  if (!all.length) return;

  const section = document.createElement('div');
  section.id = 'param-table-section';
  section.style.cssText = 'margin: 40px 0;';

  const rows = all.map(v => {
    const risky = v.risky || ['high','low','critical'].includes((v.status||'').toLowerCase());
    const nutrition = getNutritionHint(v.parameter);
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:14px 18px; color:var(--text-primary)">${v.parameter || '--'}</td>
      <td style="padding:14px 18px; color:${risky ? 'var(--red)' : 'var(--green)'}; font-weight:600">${v.value || '--'}</td>
      <td style="padding:14px 18px; color:var(--text-secondary)">${v.normal_range || '--'}</td>
      <td style="padding:14px 18px; color:var(--cyan); font-size:0.82rem">${nutrition}</td>
      <td style="padding:14px 18px">
        <span style="padding:4px 12px; border-radius:100px; font-size:0.75rem; font-weight:700;
          background:${risky ? 'rgba(255,82,82,0.12)' : 'rgba(0,230,118,0.1)'};
          color:${risky ? 'var(--red)' : 'var(--green)'}">
          ${risky ? '⚠️ Risky' : '✅ Safe'}
        </span>
      </td>
    </tr>`;
  }).join('');

  section.innerHTML = `
    <div class="section-label">Detailed Breakdown</div>
    <h2 class="section-title" style="margin-bottom:20px">All Parameters Table</h2>
    <div style="overflow-x:auto; border-radius:16px; border:1px solid var(--border)">
      <table style="width:100%; border-collapse:collapse; font-size:0.88rem;">
        <thead>
          <tr style="background:var(--bg-surface); border-bottom:1px solid var(--border)">
            <th style="padding:14px 18px; text-align:left; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em">Test Name</th>
            <th style="padding:14px 18px; text-align:left; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em">Your Value</th>
            <th style="padding:14px 18px; text-align:left; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em">Normal Range</th>
            <th style="padding:14px 18px; text-align:left; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em">Nutrition / Action</th>
            <th style="padding:14px 18px; text-align:left; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const doctorsSection = document.getElementById('doctors-section');
  doctorsSection.parentNode.insertBefore(section, doctorsSection);
}

function getNutritionHint(param) {
  const p = (param || '').toLowerCase();
  if (p.includes('hemoglobin') || p.includes('iron') || p.includes('ferritin')) return 'Spinach, red meat, lentils, Vitamin C';
  if (p.includes('b12')) return 'Eggs, dairy, fish, B12 supplements';
  if (p.includes('vitamin d')) return 'Sunlight, fish, egg yolk, D3 supplements';
  if (p.includes('calcium')) return 'Milk, yogurt, broccoli, almonds';
  if (p.includes('glucose') || p.includes('sugar') || p.includes('hba1c')) return 'Avoid sugar, eat fibre, whole grains';
  if (p.includes('cholesterol') || p.includes('triglyceride') || p.includes('ldl')) return 'Avoid fried food, eat oats, omega-3';
  if (p.includes('hdl')) return 'Exercise, olive oil, nuts, avocado';
  if (p.includes('creatinine') || p.includes('urea') || p.includes('bun')) return 'Drink water, limit protein, avoid salt';
  if (p.includes('uric acid')) return 'Avoid red meat, drink water, cherries';
  if (p.includes('tsh') || p.includes('thyroid') || p.includes('t3') || p.includes('t4')) return 'Iodine, selenium, avoid soy excess';
  if (p.includes('sgpt') || p.includes('sgot') || p.includes('alt') || p.includes('ast')) return 'Avoid alcohol, fatty food, eat turmeric';
  if (p.includes('bilirubin')) return 'Hydrate well, avoid alcohol, light diet';
  if (p.includes('wbc') || p.includes('white blood')) return 'Zinc, Vitamin C, elderberry, rest';
  if (p.includes('platelet')) return 'Papaya leaf, Vitamin K, pomegranate';
  if (p.includes('protein') || p.includes('albumin')) return 'Eggs, chicken, legumes, dairy';
  if (p.includes('potassium')) return 'Bananas, potatoes, avocado, coconut water';
  if (p.includes('sodium')) return 'Reduce salt, drink water, avoid processed food';
  if (p.includes('magnesium')) return 'Nuts, dark chocolate, leafy greens';
  if (p.includes('zinc')) return 'Pumpkin seeds, chickpeas, meat, cashews';
  return 'Balanced diet, consult doctor';
}

function renderMiniAnalysis(analysis) {
  const existing = document.getElementById('mini-analysis-section');
  if (existing) existing.remove();

  const abnormal = (analysis.abnormal_values || []).map(v => v.parameter).join(', ');
  const lifestyle = (analysis.lifestyle_changes || []).slice(0, 3).join('. ');

  const section = document.createElement('div');
  section.id = 'mini-analysis-section';
  section.style.cssText = 'margin: 24px 0 40px;';
  section.innerHTML = `
    <div style="background:var(--bg-card); border:1px solid var(--border); border-radius:16px; padding:32px;">
      <div class="section-label" style="margin-bottom:8px">AI Summary</div>
      <h3 style="font-family:var(--font-display); font-size:1.2rem; font-weight:700; margin-bottom:16px">Overall Health Analysis</h3>
      <p style="color:var(--text-secondary); line-height:1.85; font-size:0.95rem">${analysis.summary || ''}</p>
      ${abnormal ? `
      <div style="margin-top:16px; padding:14px 18px; background:rgba(0,229,255,0.05); border-radius:10px; border-left:3px solid var(--cyan)">
        <p style="font-size:0.85rem; color:var(--text-secondary); line-height:1.7">
          <strong style="color:var(--cyan)">Key concerns:</strong> ${abnormal}.<br/>
          ${lifestyle ? `<strong style="color:var(--cyan)">Recommended:</strong> ${lifestyle}.` : ''}
        </p>
      </div>` : ''}
      ${(analysis.treatment_suggestions||[]).some(t => t.urgency === 'Immediate') ? `
      <div style="margin-top:12px; padding:12px 18px; background:rgba(255,82,82,0.08); border-radius:10px; border-left:3px solid var(--red)">
        <p style="font-size:0.85rem; color:#ff8a80">⚠️ Some values need immediate medical attention. Please consult a doctor soon.</p>
      </div>` : ''}
    </div>`;

  const doctorsSection = document.getElementById('doctors-section');
  doctorsSection.parentNode.insertBefore(section, doctorsSection);
}