/* ═══════════════════════════════════════
   MAR COMPLIANCE TRAINING — MODULE JS
   ═══════════════════════════════════════ */

var MODULE = 'mar';

var LEVEL_LABELS = {
  trader:     '📈 Trader / Front Office',
  compliance: '⚖️ Compliance Officer',
  management: '🏛️ Senior Management'
};

var SYSTEM_PROMPTS = {
  trader: 'You are a MAR training coach for a front-line trader at a financial institution. Give practical, direct answers about the Market Abuse Regulation (EU 596/2014). Focus on: recognising inside information in daily conversations, red flags in client orders, pre-clearance procedures, watch/restricted lists, and what to do when receiving a suspicious request. Use concrete examples from trading practice. Always answer in English. Be concise and practical — maximum 3–4 paragraphs.',

  compliance: 'You are a MAR training coach for a compliance officer at a financial institution. Give technical, in-depth answers about the Market Abuse Regulation (EU 596/2014). Reference articles by name, cite ESMA Q&As and AFM guidelines where relevant. Topics: STOR procedures and deadlines, inside information barriers, surveillance systems, market sounding procedures (Art. 11), sanctions regime (Art. 30–34), and AFM enforcement practice. Always answer in English with correct legal terminology.',

  management: 'You are a MAR training coach for senior management and board members at a financial institution. Focus on governance, personal liability of directors under Art. 30 MAR, tone-from-the-top obligations, reputational risks of MAR violations, and what the AFM expects from an adequate compliance framework. Give board-level answers — strategic, not operational. Always answer in English.'
};

var SUGGESTED_QS = {
  trader: [
    'What should I do if a colleague gives me a tip about an upcoming acquisition?',
    'When is a client order "suspicious" enough to inform compliance?',
    'Am I allowed to trade in a stock I happened to hear something about?'
  ],
  compliance: [
    'Within what timeframe must I file a STOR with the AFM?',
    'What are the requirements for a market sounding procedure under Art. 11 MAR?',
    'How do I document the decision not to file a STOR?'
  ],
  management: [
    'What governance structures does the AFM expect from a mid-sized bank?',
    'Am I personally liable if a trader on my team commits insider trading?',
    'How do I effectively report on MAR compliance to the Supervisory Board?'
  ]
};

var EXAMPLE_PROMPTS = {
  trader: 'You are a MAR compliance trainer creating practice examples for a Trader / Front Office professional at a Dutch financial institution.\n\nCreate EXACTLY 4 short practice scenarios. Each scenario should be a realistic situation a trader might encounter in daily work. Focus on: recognising inside information, suspicious client orders, pre-clearance obligations, and handling tips from colleagues or clients.\n\nFor each example provide:\n- A short realistic scenario (3-4 sentences)\n- A specific question the trainee must answer (1 sentence)\n\nReturn STRICT JSON only, no markdown:\n[\n  {\n    "title": "Short title",\n    "scenario": "Description of the situation...",\n    "question": "What should you do?"\n  }\n]',

  compliance: 'You are a MAR compliance trainer creating practice examples for a Compliance Officer at a Dutch financial institution.\n\nCreate EXACTLY 4 short practice scenarios. Each should test knowledge of MAR procedures: STOR filing decisions, insider list management, surveillance alert handling, market sounding procedures, and information barrier effectiveness. Reference specific MAR articles where relevant.\n\nFor each example provide:\n- A short realistic scenario (3-4 sentences)\n- A specific question the trainee must answer (1 sentence)\n\nReturn STRICT JSON only, no markdown:\n[\n  {\n    "title": "Short title",\n    "scenario": "Description of the situation...",\n    "question": "What should you do?"\n  }\n]',

  management: 'You are a MAR compliance trainer creating practice examples for Senior Management / Board members at a Dutch financial institution.\n\nCreate EXACTLY 4 short practice scenarios. Each should test governance awareness, personal liability under Art. 30 MAR, information barrier governance, board reporting on surveillance findings, and strategic MAR compliance decisions.\n\nFor each example provide:\n- A short realistic scenario (3-4 sentences)\n- A specific question the trainee must answer (1 sentence)\n\nReturn STRICT JSON only, no markdown:\n[\n  {\n    "title": "Short title",\n    "scenario": "Description of the situation...",\n    "question": "What should you do?"\n  }\n]'
};

var STRICTNESS_LABELS = {
  hard: '🔴 Strict — All answers must be complete and precise',
  normal: '🟡 Standard — Core concepts must be correct',
  light: '🟢 Lenient — Accepted unless clearly no effort'
};

var STRICTNESS_INSTRUCTIONS = {
  hard: 'Evaluate STRICTLY. The answer must be complete, precise and reference the correct legal framework (MAR articles, ESMA guidance). Any missing element, vague phrasing or factual error results in "onvoldoende". Only answers that are fully correct and comprehensive receive "goed". Partial answers that cover the main point but miss important details receive "gedeeltelijk".',

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
    if (config && config.mar) {
      var a1Input = document.getElementById('agent1Id');
      var a2Input = document.getElementById('agent2Id');

      if (a1Input) {
        a1Input.dataset.defaultAgent = config.mar.agent1 || '';
        a1Input.placeholder = 'Optional override — leave blank to use the default coach';
      }

      if (a2Input) {
        a2Input.dataset.defaultAgent = config.mar.agent2 || '';
        a2Input.placeholder = 'Optional override — leave blank to use the default coach';
      }
    }
  });
});

// ─── START TRAINING ────────────────────
function startTraining() {
  var agent1Input = document.getElementById('agent1Id');
  var agent2Input = document.getElementById('agent2Id');

  agent1Id = agent1Input.value.trim() || agent1Input.dataset.defaultAgent || '';
  agent2Id = agent2Input.value.trim() || agent2Input.dataset.defaultAgent || '';

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

// ─── EXAMPLES ──────────────────────────
function loadExamples() {
  var container = document.getElementById('examplesContainer');
  container.innerHTML = '<div class="empty-msg"><span class="spinner"></span> Generating practice examples…</div>';

  callClaude(
    [{ role: 'user', content: EXAMPLE_PROMPTS[selectedLevel] }],
    'You are a precise MAR compliance trainer. Respond only with the requested JSON array.',
    1200
  ).then(function(reply) {
    var clean = cleanJsonResponse(reply);
    var examples = JSON.parse(clean);
    window._examples = examples;

    container.innerHTML = '';
    if (!Array.isArray(examples)) { throw new Error('Examples response is not a valid array.'); }
    for (var i = 0; i < examples.length; i++) {
      var ex = examples[i] || {};
      var el = document.createElement('div');
      el.className = 'example-case';
      el.id = 'example-' + i;
      el.innerHTML = '<div class="example-case-header">'
        + '<div class="example-case-num">' + (i + 1) + '</div>'
        + '<div class="example-case-meta"><h3>' + escapeHtml(ex.title || ('Example ' + (i + 1))) + '</h3><p>Practice Example</p></div>'
        + '</div>'
        + '<div class="example-case-body">'
        + '<div class="example-scenario"><div class="example-scenario-label">Scenario</div><p>' + safeTextToHtml(ex.scenario || '') + '</p></div>'
        + '<div class="example-question"><div class="example-question-label">Question</div><p>' + safeTextToHtml(ex.question || '') + '</p></div>'
        + '<div class="example-answer-area">'
        + '<textarea class="example-textarea" id="example-answer-' + i + '" placeholder="Type your answer here…" rows="3"></textarea>'
        + '<button class="btn-evaluate" id="example-btn-' + i + '" onclick="evaluateExample(' + i + ')">Evaluate Answer</button>'
        + '</div>'
        + '<div class="example-feedback" id="example-fb-' + i + '"></div>'
        + '</div>';
      container.appendChild(el);
    }
  }).catch(function(err) {
    container.innerHTML = '<div class="empty-msg">⚠ Failed to load examples: ' + escapeHtml(err.message || 'Unknown error') + '</div>';
  });
}

function evaluateExample(idx) {
  var answer = document.getElementById('example-answer-' + idx).value.trim();
  if (!answer) { alert('Please enter an answer first.'); return; }

  var btn = document.getElementById('example-btn-' + idx);
  btn.disabled = true;
  btn.textContent = 'Evaluating…';

  var ex = window._examples[idx];

  var prompt = 'You are a MAR compliance trainer. A trainee (' + LEVEL_LABELS[selectedLevel] + ') answered a practice example.\n\n'
    + 'Scenario: ' + (ex.scenario || '') + '\nQuestion: ' + (ex.question || '') + '\nTrainee answer: ' + answer + '\n\n'
    + 'Provide detailed learning feedback. This is NOT a pass/fail assessment — it is a learning exercise.\n\n'
    + 'Return JSON only, no markdown:\n{\n  "quality": "good|partial|poor",\n  "goodPoints": "What the trainee did well (2-3 sentences)",\n  "attentionPoints": "Areas for improvement (2-3 sentences)",\n  "modelAnswer": "The ideal complete answer (3-5 sentences)"\n}';

  callClaude(
    [{ role: 'user', content: prompt }],
    'You are a precise MAR compliance trainer. Respond only with the requested JSON.',
    800
  ).then(function(reply) {
    var clean = cleanJsonResponse(reply);
    var parsed = JSON.parse(clean);

    var fbEl = document.getElementById('example-fb-' + idx);
    fbEl.className = 'example-feedback visible ' + (parsed.quality || 'partial');
    fbEl.innerHTML = '<div class="feedback-header">'
      + '<span class="feedback-badge ' + (parsed.quality || 'partial') + '">'
      + (parsed.quality === 'good' ? '✓ Strong Answer' : parsed.quality === 'poor' ? '✗ Needs Work' : '◑ Partial')
      + '</span></div>'
      + '<div class="feedback-section good-points"><strong>What You Did Well</strong>' + safeTextToHtml(parsed.goodPoints || '') + '</div>'
      + '<div class="feedback-section attention-points"><strong>Points of Attention</strong>' + safeTextToHtml(parsed.attentionPoints || '') + '</div>'
      + '<div class="feedback-section model-answer"><strong>Model Answer</strong>' + safeTextToHtml(parsed.modelAnswer || '') + '</div>';

    btn.textContent = 'Evaluated ✓';
    checkAllExamplesDone();
  }).catch(function(err) {
    var fbEl = document.getElementById('example-fb-' + idx);
    fbEl.className = 'example-feedback visible partial';
    fbEl.innerHTML = '<p>⚠ Evaluation error: ' + escapeHtml(err.message || 'Unknown error') + '</p>';
    btn.disabled = false;
    btn.textContent = 'Try Again';
  });
}

function checkAllExamplesDone() {
  if (!window._examples) return;
  var allDone = true;
  for (var i = 0; i < window._examples.length; i++) {
    var fb = document.getElementById('example-fb-' + i);
    if (!fb || !fb.classList.contains('visible')) { allDone = false; break; }
  }
  if (allDone) {
    var continueBtn = document.getElementById('examplesContinueBtn');
    if (continueBtn) continueBtn.style.display = 'block';
  }
}

// ─── SCENARIOS ─────────────────────────
function selectScenario(n) {
  activeScenario = n;
  var btns = document.querySelectorAll('#scenarioBtn1, #scenarioBtn2');
  for (var i = 0; i < btns.length; i++) { btns[i].classList.remove('selected'); }
  document.getElementById('scenarioBtn' + n).classList.add('selected');

  var w1 = document.getElementById('widget1Container');
  var w2 = document.getElementById('widget2Container');
  w1.innerHTML = '';
  w2.innerHTML = '';

  if (n === 1) {
    loadAgent('widget1Container', agent1Id);
    w2.style.display = 'none';
    w1.style.display = 'flex';
  } else {
    loadAgent('widget2Container', agent2Id);
    w1.style.display = 'none';
    w2.style.display = 'flex';
  }
}

function loadAgent(containerId, agentId) {
  var container = document.getElementById(containerId);
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