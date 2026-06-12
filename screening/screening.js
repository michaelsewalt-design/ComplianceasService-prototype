/* ── Screening Module – Client-Side Logic ── */

/* ── Auth Guard ── */
(function authGuard() {
  const token = sessionStorage.getItem('sc_token');
  if (!token) {
    window.location.href = '/screening/login.html';
    return;
  }
  // Verify token server-side (synchronous to block page render)
  const xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/screening-auth', false);
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);
  try {
    xhr.send();
    if (xhr.status !== 200) {
      sessionStorage.removeItem('sc_token');
      window.location.href = '/screening/login.html';
      return;
    }
  } catch (e) {
    sessionStorage.removeItem('sc_token');
    window.location.href = '/screening/login.html';
    return;
  }
})();

/* ── DOM References ── */

const uboContainer = document.getElementById('uboContainer');
const addUboBtn = document.getElementById('addUboBtn');
const kycForm = document.getElementById('kycForm');
const reportContent = document.getElementById('reportContent');
const emptyState = document.getElementById('emptyState');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const reportTimestamp = document.getElementById('reportTimestamp');
const loader = document.getElementById('loader');
const downloadWordBtn = document.getElementById('downloadWordBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const clearReportBtn = document.getElementById('clearReportBtn');

let latestReport = null;

/* ── Helpers ── */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getAuthToken() {
  return sessionStorage.getItem('sc_token') || '';
}

/* ── UBO Management ── */

function createUboItem(data = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ubo-item';
  wrapper.innerHTML = `
    <div class="grid-3">
      <div>
        <label>UBO Name</label>
        <input type="text" class="ubo-name" placeholder="Full name" value="${escapeHtml(data.name || '')}" />
      </div>
      <div>
        <label>Ownership %</label>
        <input type="text" class="ubo-ownership" placeholder="e.g. 25%" value="${escapeHtml(data.ownership || '')}" />
      </div>
      <div>
        <label>Country</label>
        <input type="text" class="ubo-country" placeholder="Country" value="${escapeHtml(data.country || '')}" />
      </div>
      <button type="button" class="btn-danger small-btn remove-ubo">Remove</button>
    </div>
  `;
  wrapper.querySelector('.remove-ubo').addEventListener('click', () => wrapper.remove());
  return wrapper;
}

function collectUboData() {
  return Array.from(uboContainer.querySelectorAll('.ubo-item')).map(item => ({
    name: item.querySelector('.ubo-name').value.trim(),
    ownership: item.querySelector('.ubo-ownership').value.trim(),
    country: item.querySelector('.ubo-country').value.trim()
  })).filter(ubo => ubo.name || ubo.ownership || ubo.country);
}

addUboBtn.addEventListener('click', () => uboContainer.appendChild(createUboItem()));

// Start with one empty UBO row
uboContainer.appendChild(createUboItem());

/* ── Risk Scoring ── */

function computeRisk(report) {
  const text = [
    report.basicCompanyInfo?.overview || '',
    ...(report.adverseMediaFound || []),
    report.companyAnalysis || '',
    ...(report.amlRisks || []),
    report.shortSummary || ''
  ].join(' ').toLowerCase();

  let score = 0;
  const highTerms = ['sanction', 'terror', 'money laundering', 'fraud', 'bribery', 'corruption', 'shell company', 'criminal', 'embezzlement'];
  const medTerms = ['investigation', 'regulatory', 'litigation', 'fine', 'penalty', 'negative press', 'ubo unclear', 'high-risk jurisdiction'];
  const lowTerms = ['no adverse media', 'no sanctions identified', 'limited exposure', 'transparent ownership'];

  highTerms.forEach(term => { if (text.includes(term)) score += 3; });
  medTerms.forEach(term => { if (text.includes(term)) score += 2; });
  lowTerms.forEach(term => { if (text.includes(term)) score -= 1; });

  if (report.adverseMediaFound && report.adverseMediaFound.length > 2) score += 2;
  if (report.amlRisks && report.amlRisks.length > 3) score += 1;

  if (score >= 7) return 'HIGH';
  if (score >= 3) return 'MEDIUM';
  return 'LOW';
}

function getRiskClass(risk) {
  if (risk === 'HIGH') return 'risk-high';
  if (risk === 'MEDIUM') return 'risk-medium';
  return 'risk-low';
}

/* ── Report Rendering ── */

function makeBulletList(items, fallback) {
  if (!items || !items.length) return `<p>${fallback}</p>`;
  return `<ul class="list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderReport(report) {
  const risk = report.riskRating || computeRisk(report);
  latestReport = { ...report, riskRating: risk };

  const uboValue = (report.basicCompanyInfo?.uboInfo || []).length
    ? report.basicCompanyInfo.uboInfo.map(ubo =>
        `${ubo.name || 'Unnamed UBO'}${ubo.ownership ? ' (' + ubo.ownership + ')' : ''}${ubo.country ? ' - ' + ubo.country : ''}`
      ).join('; ')
    : 'Not provided';

  reportContent.innerHTML = `
    <div class="report-header">
      <div class="report-title">
        <h1>KYC Screening Report</h1>
        <p>Corporate adverse media and open-source sanctions screening output</p>
      </div>
      <div>
        <div class="risk-pill ${getRiskClass(risk)}">Overall Risk: ${escapeHtml(risk)}</div>
      </div>
    </div>

    <section class="section">
      <h2>
        <span>Basic Company Info</span>
        <span class="badge">Standard Section</span>
      </h2>
      <div class="kv-grid">
        <div class="kv"><div class="kv-title">Corporation Name</div><div class="kv-value">${escapeHtml(report.basicCompanyInfo?.companyName || 'N/A')}</div></div>
        <div class="kv"><div class="kv-title">Registration Number</div><div class="kv-value">${escapeHtml(report.basicCompanyInfo?.registrationNumber || 'N/A')}</div></div>
        <div class="kv"><div class="kv-title">Country / Jurisdiction</div><div class="kv-value">${escapeHtml(report.basicCompanyInfo?.country || 'N/A')}</div></div>
        <div class="kv"><div class="kv-title">Website</div><div class="kv-value">${escapeHtml(report.basicCompanyInfo?.website || 'N/A')}</div></div>
        <div class="kv"><div class="kv-title">Industry</div><div class="kv-value">${escapeHtml(report.basicCompanyInfo?.industry || 'N/A')}</div></div>
        <div class="kv"><div class="kv-title">UBO Information</div><div class="kv-value">${escapeHtml(uboValue)}</div></div>
      </div>
      <p>${escapeHtml(report.basicCompanyInfo?.overview || 'No company overview available.')}</p>
    </section>

    <section class="section">
      <h2>Adverse Media Found</h2>
      ${makeBulletList(report.adverseMediaFound, 'No adverse media findings were returned by the current response.')}
    </section>

    <section class="section">
      <h2>Analyses of the Company</h2>
      <p>${escapeHtml(report.companyAnalysis || 'No company analysis available.')}</p>
    </section>

    <section class="section">
      <h2>Risks of AML</h2>
      ${makeBulletList(report.amlRisks, 'No explicit AML risks were returned by the current response.')}
    </section>

    <section class="section">
      <h2>Short Summary / Conclusion</h2>
      <div class="summary-box">
        <p>${escapeHtml(report.shortSummary || 'No summary available.')}</p>
      </div>
    </section>
  `;

  emptyState.style.display = 'none';
  reportContent.style.display = 'block';
  statusDot.classList.add('live');
  statusText.textContent = 'Report generated successfully.';
  reportTimestamp.textContent = new Date().toLocaleString();
  downloadWordBtn.disabled = false;
  downloadPdfBtn.disabled = false;
}

/* ── API Call (Server-Side Proxy with Auth) ── */

async function callScreeningApi(payload) {
  const response = await fetch('/api/screening', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getAuthToken()
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    sessionStorage.removeItem('sc_token');
    window.location.href = '/screening/login.html';
    throw new Error('Session expired. Redirecting to login.');
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errData.error || errData.details || `Server responded with ${response.status}`);
  }

  const report = await response.json();
  report.riskRating = report.riskRating || computeRisk(report);
  return report;
}

/* ── Form Submission ── */

kycForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const companyName = document.getElementById('companyName').value.trim();
  if (!companyName) {
    alert('Corporation Name is the minimum required field.');
    return;
  }

  const payload = {
    companyName,
    registrationNumber: document.getElementById('registrationNumber').value.trim(),
    country: document.getElementById('country').value.trim(),
    website: document.getElementById('website').value.trim(),
    industry: document.getElementById('industry').value.trim(),
    freeText: document.getElementById('freeText').value.trim(),
    uboInfo: collectUboData()
  };

  loader.style.display = 'inline-flex';
  statusText.textContent = 'Submitting request...';
  statusDot.classList.remove('live');

  try {
    const report = await callScreeningApi(payload);
    renderReport(report);
  } catch (error) {
    console.error(error);
    alert('The API call could not be completed. Error: ' + error.message);
    statusText.textContent = 'API call failed.';
    reportTimestamp.textContent = new Date().toLocaleString();
  } finally {
    loader.style.display = 'none';
  }
});

/* ── Export: Word ── */

downloadWordBtn.addEventListener('click', () => {
  if (!latestReport) return;
  const risk = latestReport.riskRating || computeRisk(latestReport);
  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>KYC Screening Report</title>
    <style>
      body { font-family: Calibri, Arial, sans-serif; margin: 28px; color: #172033; }
      h1 { font-size: 24px; }
      h2 { font-size: 18px; border-bottom: 1px solid #dbe3ee; padding-bottom: 4px; }
      p, li { font-size: 12pt; line-height: 1.5; }
      .pill { display:inline-block; padding:6px 12px; background:#e6edf9; color:#14389a; border-radius:999px; font-weight:bold; }
    </style></head>
    <body>
      <h1>KYC Screening Report</h1>
      <p><span class='pill'>Overall Risk: ${escapeHtml(risk)}</span></p>
      ${document.getElementById('reportContent').innerHTML}
    </body></html>`;

  const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
  const link = document.createElement('a');
  const safeName = (latestReport.basicCompanyInfo?.companyName || 'KYC_Report').replace(/[^a-z0-9]+/gi, '_');
  link.href = URL.createObjectURL(blob);
  link.download = `${safeName}_KYC_Screening_Report.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/* ── Export: PDF (Print) ── */

downloadPdfBtn.addEventListener('click', () => {
  if (!latestReport) return;
  window.print();
});

/* ── Clear Report ── */

clearReportBtn.addEventListener('click', () => {
  latestReport = null;
  reportContent.innerHTML = '';
  reportContent.style.display = 'none';
  emptyState.style.display = 'grid';
  statusDot.classList.remove('live');
  statusText.textContent = 'No report generated yet.';
  reportTimestamp.textContent = '\u2014';
  downloadWordBtn.disabled = true;
  downloadPdfBtn.disabled = true;
});
