// ============================================
// HealthAI — Frontend Logic
// ============================================

const API_BASE = 'http://localhost:8000';

let selectedFile = null;

// ---- DOM Ready ----
document.addEventListener('DOMContentLoaded', () => {
  checkServerStatus();
  loadAllDoctors();
  setupDragDrop();
  setupTabs();
  setInterval(checkServerStatus, 30000); // check every 30s
});

// ---- Server Status ----
async function checkServerStatus() {
  const badge = document.getElementById('status-badge');
  const dot = badge.querySelector('.status-dot');
  const text = document.getElementById('status-text');

  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    if (data.ollama === 'connected') {
      dot.className = 'status-dot online';
      text.textContent = 'AI Online';
    } else {
      dot.className = 'status-dot offline';
      text.textContent = 'Ollama Offline';
    }
  } catch {
    dot.className = 'status-dot offline';
    text.textContent = 'Server Offline';
  }
}

// ---- Drag & Drop ----
function setupDragDrop() {
  const zone = document.getElementById('upload-zone');

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.getElementById('upload-card').classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    document.getElementById('upload-card').classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    document.getElementById('upload-card').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      handleFileSelect(file);
    } else {
      showToast('Sirf PDF files drop karein', 'error');
    }
  });

  zone.addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });
}

// ---- File Selection ----
function handleFileSelect(file) {
  selectedFile = file;
  document.getElementById('upload-zone').classList.add('hidden');
  document.getElementById('file-preview').classList.remove('hidden');
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatFileSize(file.size);
  document.getElementById('analyze-btn').disabled = false;
}

function removeFile() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-zone').classList.remove('hidden');
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('analyze-btn').disabled = true;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ---- Analyze Report ----
async function analyzeReport() {
  if (!selectedFile) return;

  // Show loading
  document.getElementById('upload-section').classList.add('hidden');
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('loading-state').classList.remove('hidden');

  const loadingTexts = [
    'Report padh raha hai...',
    'Values analyze kar raha hai...',
    'Health problems dhundh raha hai...',
    'Doctors match kar raha hai...',
    'Diet recommendations bana raha hai...',
    'Final report taiyaar ho rahi hai...',
  ];

  let i = 0;
  const loadingInterval = setInterval(() => {
    document.getElementById('loading-text').textContent = loadingTexts[i % loadingTexts.length];
    i++;
  }, 2500);

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);

    const res = await fetch(`${API_BASE}/analyze-report`, {
      method: 'POST',
      body: formData,
    });

    clearInterval(loadingInterval);

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Analysis fail ho gayi');
    }

    const data = await res.json();
    renderResults(data);

  } catch (err) {
    clearInterval(loadingInterval);
    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('upload-section').classList.remove('hidden');
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ---- Render Results ----
function renderResults(data) {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('results-section').classList.remove('hidden');

  const { analysis, suggested_doctors } = data;

  // Health Score
  const score = analysis.overall_health_score || 70;
  document.getElementById('score-num').textContent = score;
  document.getElementById('score-summary').textContent = analysis.summary || '';

  // Animate score arc
  setTimeout(() => {
    const arc = document.getElementById('score-arc');
    const circumference = 314;
    const offset = circumference - (score / 100) * circumference;
    arc.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)';
    arc.style.strokeDashoffset = offset;

    // Color based on score
    const defs = arc.closest('svg').querySelector('defs linearGradient');
    if (score >= 80) {
      arc.style.stroke = 'var(--green)';
    } else if (score >= 60) {
      arc.style.stroke = 'url(#scoreGrad)';
    } else {
      arc.style.stroke = 'var(--red)';
    }
  }, 200);

  // Urgent Banner
  if (analysis.urgent_attention_required) {
    document.getElementById('urgent-banner').classList.remove('hidden');
    document.getElementById('urgent-reason').textContent = analysis.urgent_reason || '';
  }

  // Problems Grid
  renderProblems(analysis.health_problems || []);

  // Normal Values
  renderValues(analysis.normal_values || [], 'normal-grid', 'normal');

  // Abnormal Values
  renderValues(analysis.abnormal_values || [], 'abnormal-grid', 'abnormal');

  // Diet
  renderDiet(analysis.diet_recommendations || []);

  // Treatment
  renderTreatment(analysis.treatment_suggestions || []);

  // Lifestyle
  renderLifestyle(analysis.lifestyle_changes || []);

  // Doctors
  renderDoctors(suggested_doctors || [], 'doctors-grid');

  // Scroll to results
  document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Render Problems ----
function renderProblems(problems) {
  const grid = document.getElementById('problems-grid');
  grid.innerHTML = '';

  if (problems.length === 0) {
    grid.innerHTML = '<div class="problem-card mild"><p>🎉 Koi badi problem nahi mili! Overall health achhi hai.</p></div>';
    return;
  }

  problems.forEach((p, i) => {
    const severity = (p.severity || 'mild').toLowerCase();
    const card = document.createElement('div');
    card.className = `problem-card ${severity}`;
    card.style.animationDelay = `${i * 0.1}s`;
    card.innerHTML = `
      <div class="problem-severity">${p.severity || 'Mild'}</div>
      <div class="problem-name">${p.problem || 'Unknown'}</div>
      <div class="problem-organ">🫀 ${p.affected_organ || ''}</div>
      <div class="problem-desc">${p.description || ''}</div>
    `;
    grid.appendChild(card);
  });
}

// ---- Render Values ----
function renderValues(values, gridId, type) {
  const grid = document.getElementById(gridId);
  grid.innerHTML = '';

  if (values.length === 0) {
    grid.innerHTML = `<div class="value-card" style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted)">
      ${type === 'normal' ? '✅ Sab values normal range mein hain' : '✅ Koi abnormal value nahi mili'}
    </div>`;
    return;
  }

  values.forEach((v, i) => {
    const statusClass = getStatusClass(v.status);
    const card = document.createElement('div');
    card.className = `value-card ${statusClass}`;
    card.style.animationDelay = `${i * 0.05}s`;
    card.innerHTML = `
      <div class="value-param">${v.parameter || ''}</div>
      <div class="value-num">${v.value || '--'}</div>
      <div class="value-range">Normal: ${v.normal_range || '--'}</div>
      <div class="value-status">${v.status || ''}</div>
    `;
    grid.appendChild(card);
  });
}

function getStatusClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'normal') return 'normal';
  if (s === 'high') return 'high';
  if (s === 'low') return 'low';
  if (s === 'critical') return 'critical';
  return 'normal';
}

// ---- Render Diet ----
function renderDiet(recs) {
  const grid = document.getElementById('diet-grid');
  grid.innerHTML = '';

  if (recs.length === 0) {
    grid.innerHTML = '<div class="diet-card eat" style="padding:30px; color:var(--text-muted)">Balanced aur healthy diet follow karein.</div>';
    return;
  }

  recs.forEach((rec) => {
    const isEat = (rec.category || '').toLowerCase().includes('eat') ||
                  (rec.category || '').toLowerCase().includes('khao') ||
                  !(rec.category || '').toLowerCase().includes('avoid');
    const card = document.createElement('div');
    card.className = `diet-card ${isEat ? 'eat' : 'avoid'}`;
    const items = (rec.items || []).map(item =>
      `<span class="diet-item">${item}</span>`
    ).join('');
    card.innerHTML = `
      <div class="diet-category">${isEat ? '✅' : '🚫'} ${rec.category || ''}</div>
      <div class="diet-items">${items}</div>
      <div class="diet-reason">${rec.reason || ''}</div>
    `;
    grid.appendChild(card);
  });
}

// ---- Render Treatment ----
function renderTreatment(treatments) {
  const list = document.getElementById('treatment-list');
  list.innerHTML = '';

  if (treatments.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted); padding:20px">Koi specific treatment nahi batai gayi. Doctor se milein.</div>';
    return;
  }

  treatments.forEach((t) => {
    const urgency = (t.urgency || 'routine').toLowerCase();
    const card = document.createElement('div');
    card.className = 'treatment-card';
    card.innerHTML = `
      <div class="treatment-urgency-dot urgency-${urgency}"></div>
      <div>
        <div class="treatment-urgency-label urgency-label-${urgency}">${t.urgency || 'Routine'}</div>
        <div class="treatment-name">${t.treatment || ''}</div>
        <div class="treatment-desc">${t.description || ''}</div>
      </div>
    `;
    list.appendChild(card);
  });
}

// ---- Render Lifestyle ----
function renderLifestyle(changes) {
  const list = document.getElementById('lifestyle-list');
  list.innerHTML = '';

  if (changes.length === 0) {
    list.innerHTML = '<li>Healthy lifestyle maintain karein — regular exercise, proper sleep aur balanced diet.</li>';
    return;
  }

  changes.forEach(change => {
    const li = document.createElement('li');
    li.textContent = change;
    list.appendChild(li);
  });
}

// ---- Render Doctors ----
function renderDoctors(doctors, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = '';

  const emojis = ['👨‍⚕️', '👩‍⚕️', '🩺', '💉', '🏥'];

  doctors.forEach((doc, i) => {
    const card = document.createElement('div');
    card.className = 'doctor-card';
    card.style.animationDelay = `${i * 0.12}s`;
    card.innerHTML = `
      <div class="doctor-avatar">${emojis[i % emojis.length]}</div>
      <div class="doctor-name">${doc.name}</div>
      <div class="doctor-spec">${doc.specialization}</div>
      <div class="doctor-hospital">🏥 ${doc.hospital}</div>
      <div class="doctor-avail">🕐 ${doc.available}</div>
      <a href="tel:${doc.phone}" class="doctor-phone-btn">
        📞 ${doc.phone}
      </a>
    `;
    grid.appendChild(card);
  });
}

// ---- Load All Doctors ----
async function loadAllDoctors() {
  try {
    const res = await fetch(`${API_BASE}/doctors`);
    const data = await res.json();
    renderDoctors(data.doctors || [], 'all-doctors-grid');
  } catch {
    document.getElementById('all-doctors-grid').innerHTML =
      '<p style="color:var(--text-muted)">Backend connect nahi ho raha. Server start karein.</p>';
  }
}

// ---- Tabs ----
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    });
  });
}

// ---- Reset ----
function resetAnalysis() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-zone').classList.remove('hidden');
  document.getElementById('file-preview').classList.add('hidden');
  document.getElementById('analyze-btn').disabled = true;
  document.getElementById('results-section').classList.add('hidden');
  document.getElementById('upload-section').classList.remove('hidden');
  document.getElementById('urgent-banner').classList.add('hidden');

  // Reset score arc
  const arc = document.getElementById('score-arc');
  arc.style.transition = 'none';
  arc.style.strokeDashoffset = '314';
  document.getElementById('score-num').textContent = '--';

  document.getElementById('upload-section').scrollIntoView({ behavior: 'smooth' });
}

// ---- Toast Notifications ----
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.style.cssText = `
    position: fixed; bottom: 30px; right: 30px; z-index: 9999;
    padding: 16px 24px; border-radius: 12px;
    background: ${type === 'error' ? 'rgba(255,82,82,0.15)' : 'rgba(0,229,255,0.12)'};
    border: 1px solid ${type === 'error' ? 'rgba(255,82,82,0.4)' : 'rgba(0,229,255,0.3)'};
    color: ${type === 'error' ? '#ff8a80' : '#80deea'};
    font-size: 0.9rem; font-weight: 500;
    backdrop-filter: blur(20px);
    animation: slide-in-toast 0.3s ease-out;
    max-width: 360px; line-height: 1.5;
  `;
  toast.textContent = message;

  const style = document.createElement('style');
  style.textContent = `@keyframes slide-in-toast {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
  }`;
  document.head.appendChild(style);

  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}
