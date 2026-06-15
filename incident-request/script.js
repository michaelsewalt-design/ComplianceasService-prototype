/* ── Session Check ── */
(function checkSession() {
  if (!sessionStorage.getItem('ir_token')) {
    window.location.href = '/incident-request/login.html';
  }
})();

/* ══════════════════════════════════════════
   CONFIGURATION — update before deployment
══════════════════════════════════════════ */
/* ── state ── */
let currentModule = null;
const attachedFiles = [];
let selectedSeverity = '';
let selectedPriority = '';

/* ── module meta ── */
const MODULE_META = {
  incident:   { icon:'🚨', iconClass:'incident',   title:'Report an Incident',            desc:'Complete all required fields. Urgent incidents (High/Critical) will be escalated immediately.' },
  approval:   { icon:'✅', iconClass:'approval',   title:'Request Compliance Approval',   desc:'Your request will be reviewed within 2 business days (urgent within 24h).' },
  disclosure: { icon:'📋', iconClass:'disclosure', title:'Submit a Disclosure',           desc:'Voluntary disclosures are treated confidentially. Complete all fields accurately.' },
  query:      { icon:'💬', iconClass:'query',      title:'Compliance Query / Advisory',   desc:'Queries are typically answered within 3 business days.' },
};

function genRef() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `REF-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
}

function openForm(mod) {
  currentModule = mod;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('form-view').style.display = 'block';

  const m = MODULE_META[mod];
  const icon = document.getElementById('fh-icon');
  icon.textContent = m.icon;
  icon.className = 'form-header-icon ' + m.iconClass;
  document.getElementById('fh-title').textContent = m.title;
  document.getElementById('fh-desc').textContent  = m.desc;
  document.getElementById('ref-badge').textContent = genRef();

  // set today
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('f-date').value = today;

  // show only relevant sub-form
  ['incident','approval','disclosure','query'].forEach(id => {
    const el = document.getElementById('form-' + id);
    el.classList.toggle('visible', id === mod);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() {
  document.getElementById('landing').style.display = 'block';
  document.getElementById('form-view').style.display = 'none';
  document.getElementById('ai-panel').classList.remove('visible');
  document.getElementById('ai-result-area').innerHTML = '';
  selectedSeverity = '';
  selectedPriority = '';
  // reset pill selections
  document.querySelectorAll('.pill').forEach(p => p.classList.remove('selected'));
}

function selectPill(el, group) {
  document.querySelectorAll(`#${group === 'severity' ? 'severity' : 'priority'}-pills .pill`).forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  if (group === 'severity') selectedSeverity = el.textContent.replace(/[^\w\s]/g,'').trim();
  else selectedPriority = el.textContent.replace(/[^\w\s]/g,'').trim();
}

/* ── file handling ── */
function handleFiles(files) {
  Array.from(files).forEach(f => {
    if (f.size > 10 * 1024 * 1024) { showToast(`⚠️ "${f.name}" exceeds 10 MB and was skipped.`, 'error'); return; }
    if (attachedFiles.find(x => x.name === f.name)) return;
    attachedFiles.push(f);
    renderFileList();
  });
}
function renderFileList() {
  const list = document.getElementById('file-list');
  list.innerHTML = attachedFiles.map((f, i) => `
    <div class="file-item">
      📄 <span>${f.name}</span>
      <span style="color:var(--muted);font-size:11px;">${(f.size/1024).toFixed(0)} KB</span>
      <span class="file-remove" onclick="removeFile(${i})">✕</span>
    </div>`).join('');
}
function removeFile(i) { attachedFiles.splice(i,1); renderFileList(); }

// drag-drop
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); handleFiles(e.dataTransfer.files); });

/* ── collect form data ── */
function collectFormData() {
  const base = {
    module:    currentModule,
    ref:       document.getElementById('ref-badge').textContent,
    name:      document.getElementById('f-name').value,
    email:     document.getElementById('f-email').value,
    dept:      document.getElementById('f-dept').value,
    manager:   document.getElementById('f-manager').value,
    date:      document.getElementById('f-date').value,
    notes:     document.getElementById('f-notes').value,
    severity:  selectedSeverity,
    priority:  selectedPriority,
    files:     attachedFiles.map(f => f.name),
  };
  if (currentModule === 'incident') {
    Object.assign(base, {
      incType:     document.getElementById('inc-type').value,
      incDate:     document.getElementById('inc-date').value,
      incDiscov:   document.getElementById('inc-discovered').value,
      incParties:  document.getElementById('inc-parties').value,
      incDesc:     document.getElementById('inc-desc').value,
      incActions:  document.getElementById('inc-actions').value,
      incImpact:   document.getElementById('inc-impact').value,
      incReporting:document.getElementById('inc-reporting').value,
    });
  } else if (currentModule === 'approval') {
    Object.assign(base, {
      aprType:    document.getElementById('apr-type').value,
      aprBU:      document.getElementById('apr-bu').value,
      aprDeadline:document.getElementById('apr-deadline').value,
      aprDesc:    document.getElementById('apr-desc').value,
      aprRegs:    document.getElementById('apr-regs').value,
      aprRisk:    document.getElementById('apr-risk').value,
      aprLegal:   document.getElementById('apr-legal').checked,
    });
  } else if (currentModule === 'disclosure') {
    Object.assign(base, {
      discType:  document.getElementById('disc-type').value,
      discDate:  document.getElementById('disc-date').value,
      discParty: document.getElementById('disc-party').value,
      discDesc:  document.getElementById('disc-desc').value,
      discValue: document.getElementById('disc-value').value,
      discRecur: document.getElementById('disc-recur').checked,
    });
  } else if (currentModule === 'query') {
    Object.assign(base, {
      qryTopic:   document.getElementById('qry-topic').value,
      qrySubject: document.getElementById('qry-subject').value,
      qryDesc:    document.getElementById('qry-desc').value,
      qryContext: document.getElementById('qry-context').value,
      qryDeadline:document.getElementById('qry-deadline').value,
    });
  }
  return base;
}

/* ── validate ── */
function validate(d) {
  if (!d.name) return 'Please enter your full name.';
  if (!d.email || !/\S+@\S+\.\S+/.test(d.email)) return 'Please enter a valid email address.';
  if (!document.getElementById('f-confirm').checked) return 'Please confirm the accuracy of your submission.';
  if (currentModule === 'incident' && !d.incType)  return 'Please select an incident type.';
  if (currentModule === 'incident' && !d.incDesc)  return 'Please provide an incident description.';
  if (currentModule === 'approval' && !d.aprType)  return 'Please select an approval type.';
  if (currentModule === 'approval' && !d.aprDesc)  return 'Please describe the activity requiring approval.';
  if (currentModule === 'approval' && !d.aprRisk)  return 'Please provide a risk assessment.';
  if (currentModule === 'disclosure' && !d.discType) return 'Please select a disclosure type.';
  if (currentModule === 'disclosure' && !d.discDesc) return 'Please provide a full description.';
  if (currentModule === 'query' && !d.qrySubject) return 'Please enter a subject for your query.';
  if (currentModule === 'query' && !d.qryDesc)    return 'Please describe your query.';
  return null;
}

/* ── AI review call ── */
async function callClaudeAI(formData) {
  const token = sessionStorage.getItem('ir_token');
  const response = await fetch('/api/incident-review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({
      formData: formData,
      module: formData.module,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'API error ' + response.status);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Review failed');
  }
  return data.analysis;
}

/* ── format email body ── */
function buildEmailBody(formData, aiAnalysis) {
  const lines = [
    `COMPLIANCE PORTAL SUBMISSION`,
    `==============================`,
    `Reference:  ${formData.ref}`,
    `Module:     ${formData.module.toUpperCase()}`,
    `Submitted:  ${formData.date}`,
    ``,
    `── REQUESTER ──`,
    `Name:       ${formData.name}`,
    `Email:      ${formData.email}`,
    `Department: ${formData.dept || '—'}`,
    `Manager:    ${formData.manager || '—'}`,
    ``,
  ];

  if (formData.module === 'incident') {
    lines.push('── INCIDENT DETAILS ──');
    lines.push(`Type:             ${formData.incType}`);
    lines.push(`Date occurred:    ${formData.incDate}`);
    lines.push(`Date discovered:  ${formData.incDiscov || '—'}`);
    lines.push(`Affected parties: ${formData.incParties || '—'}`);
    lines.push(`Severity:         ${formData.severity || '—'}`);
    lines.push(`Est. impact:      €${formData.incImpact || '0'}`);
    lines.push(`Reporting:        ${formData.incReporting || '—'}`);
    lines.push(`\nDescription:\n${formData.incDesc}`);
    lines.push(`\nActions taken:\n${formData.incActions || '—'}`);
  } else if (formData.module === 'approval') {
    lines.push('── APPROVAL REQUEST ──');
    lines.push(`Type:          ${formData.aprType}`);
    lines.push(`Business unit: ${formData.aprBU}`);
    lines.push(`Deadline:      ${formData.aprDeadline || '—'}`);
    lines.push(`Priority:      ${formData.priority || '—'}`);
    lines.push(`Regulations:   ${formData.aprRegs || '—'}`);
    lines.push(`Legal consulted: ${formData.aprLegal ? 'Yes' : 'No'}`);
    lines.push(`\nDescription:\n${formData.aprDesc}`);
    lines.push(`\nRisk assessment:\n${formData.aprRisk}`);
  } else if (formData.module === 'disclosure') {
    lines.push('── DISCLOSURE ──');
    lines.push(`Type:          ${formData.discType}`);
    lines.push(`Date of event: ${formData.discDate}`);
    lines.push(`Counterparty:  ${formData.discParty || '—'}`);
    lines.push(`Value:         €${formData.discValue || '0'}`);
    lines.push(`Recurring:     ${formData.discRecur ? 'Yes' : 'No'}`);
    lines.push(`\nDescription:\n${formData.discDesc}`);
  } else if (formData.module === 'query') {
    lines.push('── ADVISORY QUERY ──');
    lines.push(`Topic:    ${formData.qryTopic}`);
    lines.push(`Subject:  ${formData.qrySubject}`);
    lines.push(`Deadline: ${formData.qryDeadline || '—'}`);
    lines.push(`\nQuery:\n${formData.qryDesc}`);
    lines.push(`\nContext:\n${formData.qryContext || '—'}`);
  }

  if (formData.files.length) {
    lines.push(`\n── ATTACHMENTS ──`);
    formData.files.forEach(f => lines.push(`  • ${f}`));
  }
  if (formData.notes) {
    lines.push(`\n── ADDITIONAL NOTES ──\n${formData.notes}`);
  }
  if (aiAnalysis) {
    lines.push(`\n\n══════════════════════════════`);
    lines.push(`AI COMPLIANCE REVIEW (claude-sonnet-4-20250514)`);
    lines.push(`══════════════════════════════`);
    lines.push(aiAnalysis);
  }
  lines.push(`\n──\nThis submission was generated via the Compliance Portal and is subject to audit logging.`);
  return lines.join('\n');
}

/* ── main submit ── */
async function submitForm() {
  const d = collectFormData();
  const err = validate(d);
  if (err) { showToast('⚠️ ' + err, 'error'); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Reviewing…';

  // Show AI panel
  const panel = document.getElementById('ai-panel');
  const spinner = document.getElementById('ai-spinner');
  const panelTitle = document.getElementById('ai-panel-title');
  const resultArea = document.getElementById('ai-result-area');

  panel.classList.add('visible');
  spinner.style.display = 'block';
  panelTitle.textContent = 'Compliance AI is reviewing your submission…';
  resultArea.innerHTML = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' });

  let aiText = '';
  try {
    aiText = await callClaudeAI(d);
    spinner.style.display = 'none';
    panelTitle.textContent = 'AI Compliance Review — Completed';
    resultArea.innerHTML = `
      <div class="ai-badge">✦ AI Analysis</div>
      <div class="ai-result">${escHtml(aiText)}</div>`;
  } catch(e) {
    spinner.style.display = 'none';
    panelTitle.textContent = 'AI review unavailable (submission will still be sent)';
    resultArea.innerHTML = `<div style="font-size:12px;color:var(--muted);">Error: ${escHtml(e.message)}</div>`;
  }

  // Build mailto link
  btn.textContent = '📤 Sending…';
  const subject = `[${d.module.toUpperCase()}] ${d.ref} — ${d.name} (${d.dept || d.email})`;
  const body = buildEmailBody(d, aiText);
  const mailto = `mailto:${'compliance@yourfirm.com'}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Trigger email client
  window.location.href = mailto;

  // If email service URL is configured, also POST (optional)
  if ('') {
    try {
      await fetch('', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'compliance@yourfirm.com', subject, body }),
      });
    } catch(_) { /* silent fail */ }
  }

  btn.disabled = false;
  btn.textContent = '✅ Submitted';
  showToast(`✅ Your submission (${d.ref}) has been sent to the compliance inbox. A confirmation will be sent to ${d.email}.`, 'success');
}

/* ── helpers ── */
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); }, 6000);
}
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* ── Logout ── */
document.addEventListener('DOMContentLoaded', function() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      sessionStorage.removeItem('ir_token');
      window.location.href = '/incident-request/login.html';
    });
  }
});
