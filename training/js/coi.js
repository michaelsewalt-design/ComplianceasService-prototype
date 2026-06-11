/* ═══════════════════════════════════════
   COI & INTEGRITY TRAINING — MODULE JS
   ═══════════════════════════════════════ */

var MODULE = 'coi';

var LEVEL_LABELS = {
  analyst:    '🔍 Analyst',
  compliance: '⚖️ Compliance Officer',
  management: '🏛️ Senior Management'
};

var SYSTEM_PROMPTS = {
  analyst: 'You are a Conflict of Interest & Integrity training coach for a front-line analyst or relationship manager at a Dutch financial institution. Give practical, direct answers about integrity obligations under the Wft, Bgfo and the Banker\'s Oath. Focus on: recognising conflicts of interest in daily work, personal account dealing (PAD) rules and pre-clearance, gifts and entertainment thresholds, outside business activity policies, relationship conflicts with clients/suppliers, and when and how to escalate to compliance. Use concrete examples from banking practice. Always answer in English. Be concise and practical — maximum 3–4 paragraphs.',

  compliance: 'You are a Conflict of Interest & Integrity training coach for a compliance officer at a Dutch financial institution. Give technical, in-depth answers about COI management obligations under the Wft, Bgfo, MiFID II (Articles 23, 16(3)) and Delegated Regulation 2017/565 (Articles 33–35). Reference specific articles, DNB/AFM guidance and enforcement cases where relevant. Topics: COI policy design and maintenance, COI register requirements, information barriers (Chinese walls) and wall-crossing procedures, inducement controls, PAD monitoring and pre-clearance systems, OBA approval frameworks, whistleblowing channels under the Wet bescherming klokkenluiders, SIRA integration of integrity risks, remuneration-related conflicts, and the disciplinary framework under the Banker\'s Oath (Stichting Tuchtrecht Banken). Always answer in English with correct legal and regulatory terminology.',

  management: 'You are a Conflict of Interest & Integrity training coach for senior management and board members at a Dutch financial institution. Focus on governance obligations under the Wft and Bgfo, personal liability for integrity failures, the Banker\'s Oath and its disciplinary consequences, tone-from-the-top for ethical culture, COI governance framework design, board-level oversight of information barriers and inducement policies, whistleblowing governance, and what DNB and AFM expect from an adequate integrity framework. Give board-level answers — strategic, not operational. Always answer in English.'
};

var SUGGESTED_QS = {
  analyst: [
    'A vendor invites me to a Champions League match during a procurement process. Can I accept?',
    'My sister has applied for a mortgage at my branch. Am I allowed to process her application?',
    'I want to buy shares in a company my team is advising. What are the PAD rules?'
  ],
  compliance: [
    'What are the key elements of a compliant COI policy under MiFID II Article 23?',
    'How should we design a wall-crossing procedure for sensitive M&A transactions?',
    'What must a gift and entertainment register contain under DNB/AFM expectations?'
  ],
  management: [
    'What does the Banker\'s Oath require from me personally as a board member regarding integrity?',
    'How should our remuneration policy be structured to avoid creating conflicts of interest?',
    'What are our governance obligations for the whistleblowing channel under the new Dutch law?'
  ]
};

var EXAMPLE_PROMPTS = {
  analyst: 'You are a COI & Integrity trainer creating practice examples for an Analyst at a Dutch financial institution.\n\nCreate EXACTLY 4 short practice scenarios. Each scenario should be a realistic integrity dilemma or conflict-of-interest situation an analyst might face in daily work at a Dutch bank. Focus on: gifts and entertainment decisions, personal account dealing dilemmas, relationship conflicts with clients, and outside business activity situations.\n\nFor each example provide:\n- A short realistic scenario (3-4 sentences)\n- A specific question the trainee must answer (1 sentence)\n\nReturn STRICT JSON only, no markdown:\n[\n  {\n    \"title\": \"Short title\",\n    \"scenario\": \"Description of the situation...\",\n    \"question\": \"What should you do?\"\n  }\n]',

  compliance: 'You are a COI & Integrity trainer creating practice examples for a Compliance Officer at a Dutch financial institution.\n\nCreate EXACTLY 4 short practice scenarios. Each should test knowledge of COI policy design, information barrier procedures, PAD monitoring, whistleblowing handling, OBA approval, and inducement controls. Reference the Wft, Bgfo, MiFID II and the Banker\'s Oath where relevant.\n\nFor each example provide:\n- A short realistic scenario (3-4 sentences)\n- A specific question the trainee must answer (1 sentence)\n\nReturn STRICT JSON only, no markdown:\n[\n  {\n    \"title\": \"Short title\",\n    \"scenario\": \"Description of the situation...\",\n    \"question\": \"What should you do?\"\n  }\n]',

  management: 'You are a COI & Integrity trainer creating practice examples for Senior Management / Board members at a Dutch financial institution.\n\nCreate EXACTLY 4 short practice scenarios. Each should present a board-level integrity governance dilemma involving: tone from the top failures, COI governance framework gaps, whistleblowing escalations reaching the board, remuneration policy conflicts, personal Banker\'s Oath obligations, or regulatory enforcement situations.\n\nFor each example provide:\n- A short realistic scenario (3-4 sentences)\n- A specific question the trainee must answer (1 sentence)\n\nReturn STRICT JSON only, no markdown:\n[\n  {\n    \"title\": \"Short title\",\n    \"scenario\": \"Description of the situation...\",\n    \"question\": \"What should you do?\"\n  }\n]'
};

var STRICTNESS_LABELS = {
  hard: '🔴 Strict — All answers must be complete and precise',
  normal: '🟡 Standard — Core concepts must be correct',
  light: '🟢 Lenient — Accepted unless clearly no effort'
};

var STRICTNESS_INSTRUCTIONS = {
  hard: 'Evaluate STRICTLY. The answer must be complete, precise and reference the correct legal or policy framework where relevant (for example Wft, Bgfo, MiFID II, Delegated Regulation 2017/565, the Banker\'s Oath or whistleblowing protections). Any missing key control, vague phrasing or factual error results in "onvoldoende". Only answers that are fully correct and comprehensive receive "goed". Partial answers that cover the main point but miss important details receive "gedeeltelijk".',

  normal: 'Evaluate at a STANDARD level. The answer should demonstrate understanding of the core concepts. Minor omissions or imprecise phrasing are acceptable if the main point is correct. Clearly wrong answers or fundamental misunderstandings result in "onvoldoende". Reasonable answers with the right direction receive "gedeeltelijk". Solid answers covering the key points receive "goed".',

  light: 'Evaluate LENIENTLY. Accept any answer that shows a genuine attempt to engage with the topic and demonstrates basic understanding. Only mark as "onvoldoende" if the answer is completely off-topic, empty, or shows zero effort. Most reasonable attempts should receive "goed" or "gedeeltelijk".'
};

// ─── INIT ──────────────────────────────

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeTextToHtml(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

document.addEventListener('DOMContentLoaded', function() {
  if (!requireAuth()) return;

  loadConfig().then(function(config) {
    if (config && config.coi) {
      for (var i = 1; i <= 6; i++) {
        var input = document.getElementById('agent' + i + 'Id');
        if (input) {
          input.dataset.defaultAgent = config.coi['agent' + i] || '';
          input.placeholder = 'Optional override — leave blank to use the default coach';
        }
      }
    }
  });
});

// ─── START TRAINING ────────────────────
function startTraining() {
  window.coiAgentIds = [];
  for (var i = 1; i <= 6; i++) {
    var input = document.getElementById('agent' + i + 'Id');
    window.coiAgentIds.push((input && (input.value.trim() || input.dataset.defaultAgent)) || '');
  }

  document.getElementById('topLevel').textContent = LEVEL_LABELS[selectedLevel];

  // Show level-specific theory
  var allTheory = document.querySelectorAll('[id^="theory-"]');
  for (var i = 0; i < allTheory.length; i++) { allTheory[i].style.display = 'none'; }
  var levelTheory = document.querySelectorAll('[id^="theory-' + selectedLevel + '-"]');
  for (var j = 0; j < levelTheory.length; j++) { levelTheory[j].style.display = 'block'; }

  // Setup chat suggestions
  setupChatSuggestions();

  // Setup strictness banner
  var banner = document.getElementById('strictnessBanner');
  if (banner) {
    var dotClass = selectedStrictness === 'hard' ? 'dot-hard' : selectedStrictness === 'light' ? 'dot-light' : 'dot-normal';
    banner.innerHTML = '<div class="dot ' + dotClass + '"></div><span>' + STRICTNESS_LABELS[selectedStrictness] + '</span>';
  }

  // Switch screens
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('trainingScreen').classList.add('visible');

  // Load examples and quiz
  loadExamples();
  loadQuiz();
}

// ─── SCENARIOS ─────────────────────────
function selectScenario(n) {
  activeScenario = n;
  var btns = document.querySelectorAll('[id^="scenarioBtn"]');
  for (var i = 0; i < btns.length; i++) { btns[i].classList.remove('selected'); }
  document.getElementById('scenarioBtn' + n).classList.add('selected');

  for (var c = 1; c <= 6; c++) {
    var widget = document.getElementById('widget' + c + 'Container');
    if (!widget) continue;
    widget.innerHTML = '';
    widget.style.display = (c === n ? 'flex' : 'none');
  }

  var agentId = (window.coiAgentIds && window.coiAgentIds[n - 1]) || '';
  loadAgent('widget' + n + 'Container', agentId);
}

function loadAgent(containerId, agentId) {
  var container = document.getElementById(containerId);
  if (!container) return;
  if (!agentId) {
    container.innerHTML = '<div class="no-agent-notice">📞 No Agent ID configured for this scenario.</div>';
    return;
  }
  var widget = document.createElement('elevenlabs-convai');
  widget.setAttribute('agent-id', agentId);
  container.appendChild(widget);
}

// ─── CHAT SUGGESTIONS ─────────────────
function setupChatSuggestions() {
  var qs = SUGGESTED_QS[selectedLevel];
  var sqEl = document.getElementById('suggestedQs');
  sqEl.innerHTML = '<div class="card-title" style="margin-bottom:4px">Suggested Questions</div>';
  for (var i = 0; i < qs.length; i++) {
    var btn = document.createElement('button');
    btn.className = 'sug-btn';
    btn.textContent = qs[i];
    btn.setAttribute('data-q', qs[i]);
    btn.onclick = function() {
      document.getElementById('chatInput').value = this.getAttribute('data-q');
      sendChat();
    };
    sqEl.appendChild(btn);
  }
}