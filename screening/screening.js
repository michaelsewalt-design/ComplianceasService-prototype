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


/* ── Database Screening Rendering ── */
function renderHitBadge(sourceType) {
  var cls = 'hit-badge';
  if (sourceType === 'SANCTION') cls += ' hit-sanction';
  else if (sourceType === 'PEP') cls += ' hit-pep';
  else if (sourceType === 'CRIMINAL') cls += ' hit-criminal';
  return '<span class="' + cls + '">' + escapeHtml(sourceType || 'UNKNOWN') + '</span>';
}

function renderHitsTable(hits) {
  if (!hits || !hits.length) {
    return '<p class="no-hits">✅ No hits found in sanctions, PEP, or criminal databases.</p>';
  }
  var html = '<div class="hits-list">';
  hits.forEach(function(hit) {
    html += '<div class="hit-card">';
    html += '<div class="hit-card-header">' + renderHitBadge(hit.sourceType) + ' <strong>' + escapeHtml(hit.name || 'Unknown') + '</strong></div>';
    if (hit.pepType) html += '<div class="hit-detail"><span class="hit-label">PEP Type:</span> ' + escapeHtml(hit.pepType) + (hit.pepLevel ? ' (Level ' + escapeHtml(hit.pepLevel) + ')' : '') + '</div>';
    if (hit.details) html += '<div class="hit-detail"><span class="hit-label">Details:</span> ' + escapeHtml(hit.details) + '</div>';
    if (hit.source) html += '<div class="hit-detail"><span class="hit-label">Source:</span> ' + escapeHtml(hit.source) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}


function renderReport(report) {
  var risk = report.riskRating || computeRisk(report);
  latestReport = Object.assign({}, report, { riskRating: risk });

  var uboArr = (report.basicCompanyInfo && report.basicCompanyInfo.uboInfo) || [];
  var uboValue = uboArr.length
    ? uboArr.map(function(u){return(u.name||'Unnamed UBO')+(u.ownership?' ('+u.ownership+')':'')+(u.country?' - '+u.country:'');}).join('; ')
    : 'Not provided';

  var bi = report.basicCompanyInfo || {};
  var ds = report.databaseScreening || {};
  var us = report.uboScreening || [];

  var html = '';

  /* ── Report Header ── */
  html += '<div class="report-header"><div class="report-title"><h1>KYC Screening Report</h1>'
    + '<p>Corporate adverse media and open-source sanctions screening output</p></div>'
    + '<div><div class="risk-pill ' + getRiskClass(risk) + '">Overall Risk: ' + escapeHtml(risk) + '</div></div></div>';

  /* ── 1. Basic Company Info ── */
  html += '<section class="section"><h2><span>Basic Company Info</span><span class="badge">Standard Section</span></h2>'
    + '<div class="kv-grid">'
    + '<div class="kv"><div class="kv-title">Corporation Name</div><div class="kv-value">' + escapeHtml(bi.companyName || 'N/A') + '</div></div>'
    + '<div class="kv"><div class="kv-title">Registration Number</div><div class="kv-value">' + escapeHtml(bi.registrationNumber || 'N/A') + '</div></div>'
    + '<div class="kv"><div class="kv-title">Country / Jurisdiction</div><div class="kv-value">' + escapeHtml(bi.country || 'N/A') + '</div></div>'
    + '<div class="kv"><div class="kv-title">Website</div><div class="kv-value">' + escapeHtml(bi.website || 'N/A') + '</div></div>'
    + '<div class="kv"><div class="kv-title">Industry</div><div class="kv-value">' + escapeHtml(bi.industry || 'N/A') + '</div></div>'
    + '<div class="kv"><div class="kv-title">UBO Information</div><div class="kv-value">' + escapeHtml(uboValue) + '</div></div></div>'
    + '<p>' + escapeHtml(bi.overview || 'No company overview available.') + '</p></section>';

  /* ── 2. Database Screening: Entity ── */
  html += '<section class="section"><h2><span>Database Screening: Entity</span><span class="badge">Dilisense</span></h2>'
    + renderHitsTable(ds.entityHits)
    + '<div class="screening-summary"><p>' + escapeHtml(ds.summary || 'No database screening was performed.') + '</p></div></section>';

  /* ── 3. Database Screening: UBOs ── */
  html += '<section class="section"><h2><span>Database Screening: UBOs</span><span class="badge">Dilisense</span></h2>';
  if (us.length === 0) {
    html += '<p class="no-hits">No UBOs were provided for screening.</p>';
  } else {
    us.forEach(function(ubo) {
      html += '<div class="ubo-screening-block">';
      html += '<h3 class="ubo-screening-name">' + escapeHtml(ubo.uboName || 'Unknown UBO') + '</h3>';
      html += renderHitsTable(ubo.hits);
      html += '<div class="screening-summary"><p>' + escapeHtml(ubo.summary || 'No screening summary available.') + '</p></div>';
      html += '</div>';
    });
  }
  html += '</section>';

  /* ── 4. Adverse Media Found ── */
  html += '<section class="section"><h2>Adverse Media Found</h2>'
    + makeBulletList(report.adverseMediaFound, 'No adverse media findings were returned.')
    + '</section>';

/* ── 4a. Latest News ── */
  html += '<section class="section"><h2>Latest News</h2>';

  var ln = report.latestNews || {};

  // Entity news
  if (Array.isArray(ln.entity) && ln.entity.length > 0) {
    html += '<h3>Entity</h3><ul class="list">';
    ln.entity.forEach(function(n) {
      html += '<li>'
        + '<a href="' + escapeHtml(n.link) + '" target="_blank">' + escapeHtml(n.title) + '</a>'
        + (n.source || n.date ? ' (' + escapeHtml((n.source||'') + (n.date ? ' - ' + n.date : '')) + ')' : '')
        + (n.relevance ? '<br><em>' + escapeHtml(n.relevance) + '</em>' : '')
        + '</li>';
    });
    html += '</ul>';
  }

  // UBO news
  if (Array.isArray(ln.ubos) && ln.ubos.length > 0) {
    html += '<h3>UBOs</h3>';
    ln.ubos.forEach(function(u) {
      html += '<div class="ubo-news-block">';
      html += '<strong>' + escapeHtml(u.uboName || 'Unknown') + '</strong>';
      if (Array.isArray(u.items) && u.items.length > 0) {
        html += '<ul class="list">';
        u.items.forEach(function(n) {
          html += '<li>'
            + '<a href="' + escapeHtml(n.link) + '" target="_blank">' + escapeHtml(n.title) + '</a>'
            + (n.source || n.date ? ' (' + escapeHtml((n.source||'') + (n.date ? ' - ' + n.date : '')) + ')' : '')
            + (n.relevance ? '<br><em>' + escapeHtml(n.relevance) + '</em>' : '')
            + '</li>';
        });
        html += '</ul>';
      } else {
        html += '<p>No relevant news found.</p>';
      }
      html += '</div>';
    });
  }

  // Fallback (raw RSS)
  if ((!ln.entity || ln.entity.length === 0) && report.rawNewsScreening) {
    if (Array.isArray(report.rawNewsScreening.entity) && report.rawNewsScreening.entity.length > 0) {
      html += '<h3>Entity (Raw)</h3><ul class="list">';
      report.rawNewsScreening.entity.forEach(function(n) {
        html += '<li>'
          + '<a href="' + escapeHtml(n.link) + '" target="_blank">' + escapeHtml(n.title) + '</a>'
          + '</li>';
      });
      html += '</ul>';
    }
  }

  html += '</section>';



  /* ── 5. Analyses of the Company ── */
  html += '<section class="section"><h2>Analyses of the Company</h2>'
    + '<p>' + escapeHtml(report.companyAnalysis || 'No company analysis available.') + '</p></section>';

  /* ── 6. Risks of AML ── */
  html += '<section class="section"><h2>Risks of AML</h2>'
    + makeBulletList(report.amlRisks, 'No explicit AML risks were returned.')
    + '</section>';

  /* ── 7. Risk Analysis ── */
  html += '<section class="section"><h2>Risk Analysis</h2>'
    + '<div class="summary-box risk-analysis-box"><p>'
    + escapeHtml(report.riskAnalysis || 'No risk analysis available.')
    + '</p></div></section>';

  /* ── 8. Short Summary / Conclusion ── */
  html += '<section class="section"><h2>Short Summary / Conclusion</h2>'
    + '<div class="summary-box"><p>'
    + escapeHtml(report.shortSummary || 'No summary available.')
    + '</p></div></section>';

  /* ── 9. Disclaimer ── */
  html += '<section class="section disclaimer"><h2>Disclaimer</h2>'
    + '<p class="disclaimer-text">This report has been generated using artificial intelligence (AI) and open-source data. '
    + 'It is intended for informational and preliminary screening purposes only and does not constitute legal, financial, or compliance advice. '
    + 'The information contained herein may be incomplete, inaccurate, or outdated. No representation or warranty, express or implied, is made as to the accuracy or completeness of the content. '
    + 'Any decisions made on the basis of this report are taken entirely at the user\'s own risk. '
    + 'This report should be reviewed and validated by a qualified compliance professional before being relied upon for any regulatory, business, or legal purpose.</p></section>';

  reportContent.innerHTML = html;

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

/* ── Quick Search Buttons ── */
document.querySelectorAll('.quick-search-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var companyName = document.getElementById('companyName').value.trim();
    if (!companyName) { alert('Enter a company name first.'); return; }
    var suffix = btn.getAttribute('data-suffix');
    var query = companyName + ' ' + suffix;

    /* Trigger de embedded Google CSE search */
    var cseInput = document.querySelector('.gsc-input-box input.gsc-input');
    if (cseInput) {
      cseInput.value = query;
      var searchBtn = document.querySelector('button.gsc-search-button');
      if (searchBtn) searchBtn.click();
    } else {
      /* Fallback: als CSE nog niet geladen is */
      window.open('https://www.google.com/search?q=' + encodeURIComponent(query), '_blank');
    }
  });
});

/* ── Result Viewer (side panel) ── */
var resultViewer    = document.getElementById('resultViewer');
var resultFrame     = document.getElementById('resultViewerFrame');
var resultTitle     = document.getElementById('resultViewerTitle');
var resultExternal  = document.getElementById('resultViewerExternal');
var resultCloseBtn  = document.getElementById('resultViewerClose');

function openResultViewer(url, title) {
  resultTitle.textContent = title || url;
  resultExternal.href = url;
  resultFrame.src = url;
  resultViewer.style.display = 'flex';

  /* Fallback: if iframe fails to load (X-Frame-Options), show message */
  resultFrame.onerror = function() {
    resultFrame.srcdoc = '<div style="display:grid;place-items:center;height:100%;font-family:Inter,sans-serif;color:#5b6475;">'
      + '<div style="text-align:center;"><h3>This site cannot be embedded</h3>'
      + '<p>Click "Open in new tab" above to view the page.</p></div></div>';
  };
}

function closeResultViewer() {
  resultViewer.style.display = 'none';
  resultFrame.src = 'about:blank';
}

resultCloseBtn.addEventListener('click', closeResultViewer);

/* Escape key to close */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && resultViewer.style.display !== 'none') {
    closeResultViewer();
  }
});

/* ── Intercept Google CSE result clicks → open in side panel ── */
function attachCseClickHandler() {
  document.addEventListener('click', function(e) {
    /* Zoek naar links binnen Google CSE resultaten */
    var link = e.target.closest('.gsc-results a[href], .gs-title a[href], .gsc-url-top a[href], a.gs-title');
    if (link && link.href && link.href.startsWith('http')) {
      e.preventDefault();
      e.stopPropagation();
      openResultViewer(link.href, link.textContent || link.href);
      return false;
    }
  }, true);
}
attachCseClickHandler();