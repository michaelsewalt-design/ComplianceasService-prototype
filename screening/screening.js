/* ── Screening Module – Client-Side Logic ── */

/* ── Auth Guard ── */
(function authGuard() {
  var token = sessionStorage.getItem('sc_token');
  if (!token) { window.location.href = '/screening/login.html'; return; }
  var xhr = new XMLHttpRequest();
  xhr.open('GET', '/api/screening-auth', false);
  xhr.setRequestHeader('Authorization', 'Bearer ' + token);
  try {
    xhr.send();
    if (xhr.status !== 200) {
      sessionStorage.removeItem('sc_token');
      window.location.href = '/screening/login.html';
    }
  } catch (e) {
    sessionStorage.removeItem('sc_token');
    window.location.href = '/screening/login.html';
  }
})();

/* ── DOM References ── */
var uboContainer    = document.getElementById('uboContainer');
var addUboBtn       = document.getElementById('addUboBtn');
var kycForm         = document.getElementById('kycForm');
var reportContent   = document.getElementById('reportContent');
var emptyState      = document.getElementById('emptyState');
var statusDot       = document.getElementById('statusDot');
var statusText      = document.getElementById('statusText');
var reportTimestamp  = document.getElementById('reportTimestamp');
var loader          = document.getElementById('loader');
var downloadWordBtn = document.getElementById('downloadWordBtn');
var downloadPdfBtn  = document.getElementById('downloadPdfBtn');
var clearReportBtn  = document.getElementById('clearReportBtn');

/* Chat DOM */
var chatSection   = document.getElementById('chatSection');
var chatMessages  = document.getElementById('chatMessages');
var chatInput     = document.getElementById('chatInput');
var chatSendBtn   = document.getElementById('chatSendBtn');
var chatLoader    = document.getElementById('chatLoader');
var appendChatBtn = document.getElementById('appendChatBtn');

var latestReport = null;
var chatHistory  = []; // { role: 'user'|'assistant', content: string }

/* ── Helpers ── */
function escapeHtml(v) {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function getAuthToken() { return sessionStorage.getItem('sc_token') || ''; }

/* ── UBO Management ── */
function createUboItem(data) {
  data = data || {};
  var w = document.createElement('div'); w.className = 'ubo-item';
  w.innerHTML =
    '<div class="grid-3"><div><label>UBO Name</label>' +
    '<input type="text" class="ubo-name" placeholder="Full name" value="' + escapeHtml(data.name||'') + '" /></div>' +
    '<div><label>Ownership %</label>' +
    '<input type="text" class="ubo-ownership" placeholder="e.g. 25%" value="' + escapeHtml(data.ownership||'') + '" /></div>' +
    '<div><label>Country</label>' +
    '<input type="text" class="ubo-country" placeholder="Country" value="' + escapeHtml(data.country||'') + '" /></div>' +
    '<button type="button" class="btn-danger small-btn remove-ubo">Remove</button></div>';
  w.querySelector('.remove-ubo').addEventListener('click', function() { w.remove(); });
  return w;
}
function collectUboData() {
  return Array.from(uboContainer.querySelectorAll('.ubo-item')).map(function(item) {
    return {
      name: item.querySelector('.ubo-name').value.trim(),
      ownership: item.querySelector('.ubo-ownership').value.trim(),
      country: item.querySelector('.ubo-country').value.trim()
    };
  }).filter(function(u) { return u.name || u.ownership || u.country; });
}
addUboBtn.addEventListener('click', function() { uboContainer.appendChild(createUboItem()); });
uboContainer.appendChild(createUboItem());

/* ── Risk Scoring ── */
function computeRisk(report) {
  var text = [
    (report.basicCompanyInfo && report.basicCompanyInfo.overview) || '',
    (report.adverseMediaFound || []).join(' '),
    report.companyAnalysis || '',
    (report.amlRisks || []).join(' '),
    report.shortSummary || ''
  ].join(' ').toLowerCase();
  var score = 0;
  ['sanction','terror','money laundering','fraud','bribery','corruption','shell company','criminal','embezzlement'].forEach(function(t){if(text.includes(t))score+=3;});
  ['investigation','regulatory','litigation','fine','penalty','negative press','ubo unclear','high-risk jurisdiction'].forEach(function(t){if(text.includes(t))score+=2;});
  ['no adverse media','no sanctions identified','limited exposure','transparent ownership'].forEach(function(t){if(text.includes(t))score-=1;});
  if(report.adverseMediaFound&&report.adverseMediaFound.length>2)score+=2;
  if(report.amlRisks&&report.amlRisks.length>3)score+=1;
  if(score>=7)return'HIGH';if(score>=3)return'MEDIUM';return'LOW';
}
function getRiskClass(r){if(r==='HIGH')return'risk-high';if(r==='MEDIUM')return'risk-medium';return'risk-low';}

/* ── Report Rendering ── */
function makeBulletList(items,fallback){
  if(!items||!items.length)return'<p>'+fallback+'</p>';
  return'<ul class="list">'+items.map(function(i){return'<li>'+escapeHtml(i)+'</li>';}).join('')+'</ul>';
}

function renderReport(report) {
  var risk = report.riskRating || computeRisk(report);
  latestReport = Object.assign({}, report, { riskRating: risk });

  var uboArr = (report.basicCompanyInfo && report.basicCompanyInfo.uboInfo) || [];
  var uboValue = uboArr.length
    ? uboArr.map(function(u){return(u.name||'Unnamed UBO')+(u.ownership?' ('+u.ownership+')':'')+(u.country?' - '+u.country:'');}).join('; ')
    : 'Not provided';

  var bi = report.basicCompanyInfo || {};
  reportContent.innerHTML =
    '<div class="report-header"><div class="report-title"><h1>KYC Screening Report</h1>' +
    '<p>Corporate adverse media and open-source sanctions screening output</p></div>' +
    '<div><div class="risk-pill '+getRiskClass(risk)+'">Overall Risk: '+escapeHtml(risk)+'</div></div></div>' +
    '<section class="section"><h2><span>Basic Company Info</span><span class="badge">Standard Section</span></h2>' +
    '<div class="kv-grid">' +
    '<div class="kv"><div class="kv-title">Corporation Name</div><div class="kv-value">'+escapeHtml(bi.companyName||'N/A')+'</div></div>' +
    '<div class="kv"><div class="kv-title">Registration Number</div><div class="kv-value">'+escapeHtml(bi.registrationNumber||'N/A')+'</div></div>' +
    '<div class="kv"><div class="kv-title">Country / Jurisdiction</div><div class="kv-value">'+escapeHtml(bi.country||'N/A')+'</div></div>' +
    '<div class="kv"><div class="kv-title">Website</div><div class="kv-value">'+escapeHtml(bi.website||'N/A')+'</div></div>' +
    '<div class="kv"><div class="kv-title">Industry</div><div class="kv-value">'+escapeHtml(bi.industry||'N/A')+'</div></div>' +
    '<div class="kv"><div class="kv-title">UBO Information</div><div class="kv-value">'+escapeHtml(uboValue)+'</div></div></div>' +
    '<p>'+escapeHtml(bi.overview||'No company overview available.')+'</p></section>' +
    '<section class="section"><h2>Adverse Media Found</h2>'+makeBulletList(report.adverseMediaFound,'No adverse media findings were returned.')+'</section>' +
    '<section class="section"><h2>Analyses of the Company</h2><p>'+escapeHtml(report.companyAnalysis||'No company analysis available.')+'</p></section>' +
  

  '<section class="section"><h2>Risks of AML</h2>'+makeBulletList(report.amlRisks,'No explicit AML risks were returned.')+'</section>'
   
+ '<section class="section"><h2>Risk Analysis</h2>'
+ '<div class="summary-box risk-analysis-box"><p>'
+ escapeHtml(report.riskAnalysis || 'No risk analysis available.')
+ '</p></div></section>'+

'<section class="section"><h2>Short Summary / Conclusion</h2><div class="summary-box"><p>'+escapeHtml(report.shortSummary||'No summary available.')+'</p></div></section>'

+ '<section class="section disclaimer"><h2>Disclaimer</h2>'
+ '<p class="disclaimer-text">This report has been generated using artificial intelligence (AI) and open-source data. '
+ 'It is intended for informational and preliminary screening purposes only and does not constitute legal, financial, or compliance advice. '
+ 'The information contained herein may be incomplete, inaccurate, or outdated. No representation or warranty, express or implied, is made as to the accuracy or completeness of the content. '
+ 'Any decisions made on the basis of this report are taken entirely at the user\'s own risk. '
+ 'This report should be reviewed and validated by a qualified compliance professional before being relied upon for any regulatory, business, or legal purpose.</p></section>';

  emptyState.style.display = 'none';
  reportContent.style.display = 'block';
  statusDot.classList.add('live');
  statusText.textContent = 'Report generated successfully.';
  reportTimestamp.textContent = new Date().toLocaleString();
  downloadWordBtn.disabled = false;
  downloadPdfBtn.disabled = false;

  /* Show chat */
  chatSection.style.display = 'block';
  chatHistory = [];
  chatMessages.innerHTML = '';
  appendChatBtn.disabled = true;
}

/* ── API Call ── */
async function callScreeningApi(payload) {
  var response = await fetch('/api/screening', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
    body: JSON.stringify(payload)
  });
  if (response.status === 401) {
    sessionStorage.removeItem('sc_token');
    window.location.href = '/screening/login.html';
    throw new Error('Session expired.');
  }
  if (!response.ok) {
    var err = await response.json().catch(function(){ return {error:'Unknown error'}; });
    throw new Error(err.error || err.details || 'Server responded with ' + response.status);
  }
  var report = await response.json();
  report.riskRating = report.riskRating || computeRisk(report);
  return report;
}

/* ── Form Submission ── */
kycForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  var companyName = document.getElementById('companyName').value.trim();
  if (!companyName) { alert('Corporation Name is the minimum required field.'); return; }
  var payload = {
    companyName: companyName,
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
    var report = await callScreeningApi(payload);
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

/* ═══════════════════════════════════════════════════════
   FOLLOW-UP CHAT
   ═══════════════════════════════════════════════════════ */

function addChatBubble(role, text) {
  var div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  var label = role === 'user' ? 'You' : 'Screening Assistant';
  div.innerHTML = '<span class="chat-label">' + label + '</span>' + escapeHtml(text).replace(/\n/g, '<br>');
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage() {
  var question = chatInput.value.trim();
  if (!question || !latestReport) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';
  addChatBubble('user', question);

  chatSendBtn.disabled = true;
  chatLoader.style.display = 'inline-flex';

  try {
    var response = await fetch('/api/screening-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAuthToken() },
      body: JSON.stringify({ question: question, report: latestReport, chatHistory: chatHistory })
    });

    if (response.status === 401) {
      sessionStorage.removeItem('sc_token');
      window.location.href = '/screening/login.html';
      return;
    }

    if (!response.ok) {
      var err = await response.json().catch(function(){ return {error:'Unknown error'}; });
      throw new Error(err.error || 'Server error');
    }

    var data = await response.json();
    var answer = data.answer || 'No response received.';

    addChatBubble('assistant', answer);
    chatHistory.push({ role: 'user', content: question });
    chatHistory.push({ role: 'assistant', content: answer });
    appendChatBtn.disabled = false;

  } catch (error) {
    console.error(error);
    addChatBubble('assistant', 'Error: ' + error.message);
  } finally {
    chatSendBtn.disabled = false;
    chatLoader.style.display = 'none';
  }
}

chatSendBtn.addEventListener('click', sendChatMessage);

chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

/* Auto-grow textarea */
chatInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

/* ── Append Chat to Report ── */
appendChatBtn.addEventListener('click', function() {
  if (chatHistory.length === 0) return;

  var html = '<section class="section appended-qa"><h2>Follow-up Analysis</h2>';
  for (var i = 0; i < chatHistory.length; i += 2) {
    var q = chatHistory[i];
    var a = chatHistory[i + 1];
    html += '<div class="qa-pair">';
    html += '<p class="qa-question"><strong>Q: </strong>' + escapeHtml(q.content) + '</p>';
    if (a) {
      html += '<p class="qa-answer">' + escapeHtml(a.content).replace(/\n/g, '<br>') + '</p>';
    }
    html += '</div>';
  }
  html += '</section>';

  /* Remove previously appended Q&A if any */
  var existing = reportContent.querySelector('.appended-qa');
  if (existing) existing.remove();

  reportContent.insertAdjacentHTML('beforeend', html);
  appendChatBtn.textContent = '✓ Answers Added to Report';
  appendChatBtn.disabled = true;
});

/* ── Export: Word ── */
downloadWordBtn.addEventListener('click', function() {
  if (!latestReport) return;
  var risk = latestReport.riskRating || computeRisk(latestReport);
  var docHtml =
    "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>" +
    "<head><meta charset='utf-8'><title>KYC Screening Report</title>" +
    "<style>body{font-family:Calibri,Arial,sans-serif;margin:28px;color:#172033}h1{font-size:24px}h2{font-size:18px;border-bottom:1px solid #dbe3ee;padding-bottom:4px}p,li{font-size:12pt;line-height:1.5}.pill{display:inline-block;padding:6px 12px;background:#e6edf9;color:#14389a;border-radius:999px;font-weight:bold}.qa-question{font-weight:bold;margin-top:12px}.qa-answer{margin-bottom:12px}</style></head>" +
    "<body><h1>KYC Screening Report</h1>" +
    "<p><span class='pill'>Overall Risk: " + escapeHtml(risk) + "</span></p>" +
    reportContent.innerHTML +
    "</body></html>";
  var blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
  var link = document.createElement('a');
  var safeName = ((latestReport.basicCompanyInfo && latestReport.basicCompanyInfo.companyName) || 'KYC_Report').replace(/[^a-z0-9]+/gi, '_');
  link.href = URL.createObjectURL(blob);
  link.download = safeName + '_KYC_Screening_Report.doc';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

/* ── Export: PDF ── */
downloadPdfBtn.addEventListener('click', function() {
  if (!latestReport) return;
  var element = document.getElementById('reportContent');
  var safeName = ((latestReport.basicCompanyInfo && latestReport.basicCompanyInfo.companyName) || 'KYC_Report').replace(/[^a-z0-9]+/gi, '_');
  html2pdf().set({
    margin: 10,
    filename: safeName + '_KYC_Screening_Report.pdf',
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  }).from(element).save();
});

/* ── Clear Report ── */
clearReportBtn.addEventListener('click', function() {
  latestReport = null;
  reportContent.innerHTML = '';
  reportContent.style.display = 'none';
  emptyState.style.display = 'grid';
  statusDot.classList.remove('live');
  statusText.textContent = 'No report generated yet.';
  reportTimestamp.textContent = '\u2014';
  downloadWordBtn.disabled = true;
  downloadPdfBtn.disabled = true;
  /* Clear chat */
  chatSection.style.display = 'none';
  chatMessages.innerHTML = '';
  chatInput.value = '';
  chatHistory = [];
  appendChatBtn.disabled = true;
  appendChatBtn.textContent = 'Add Answers to Report';
});