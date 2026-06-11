/* ═══════════════════════════════════════
   COMPLIANCE TRAINING — SHARED JS
   ═══════════════════════════════════════ */

// ─── AUTH ──────────────────────────────
function getToken() {
    return sessionStorage.getItem("ct_token");
}

function requireAuth() {
    var token = getToken();
    if (!token) {
        window.location.href = "/training/login.html";
        return false;
    }
    return true;
}

function logout() {
    sessionStorage.removeItem("ct_token");
    window.location.href = "/training/login.html";
}

// ─── API CALLS ─────────────────────────
function callClaude(messages, systemPrompt, maxTokens) {
    var token = getToken();
    if (!token) {
        return Promise.reject(new Error("Not authenticated"));
    }

    return fetch("/api/claude", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            messages: messages,
            system: systemPrompt,
            max_tokens: maxTokens || 1024,
            model: "claude-sonnet-4-20250514"
        })
    }).then(function(resp) {
        if (resp.status === 401) {
            sessionStorage.removeItem("ct_token");
            window.location.href = "/training/login.html";
            throw new Error("Session expired");
        }
        if (!resp.ok) {
            return resp.json().then(function(err) {
                throw new Error(err.error || err.details || "API error: " + resp.status);
            });
        }
        return resp.json();
    }).then(function(data) {
        var text = "";
        if (data.content && data.content[0] && data.content[0].text) {
            text = data.content[0].text;
        }
        return text;
    });
}

function loadConfig() {
    var token = getToken();
    if (!token) return Promise.resolve(null);

    return fetch("/api/config", {
        headers: { "Authorization": "Bearer " + token }
    }).then(function(resp) {
        if (!resp.ok) return null;
        return resp.json();
    }).catch(function() {
        return null;
    });
}

// ─── UI HELPERS ────────────────────────
function toggleAcc(id) {
    document.getElementById(id).classList.toggle("open");
}

function autoResize(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}

function handleChatKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChat();
    }
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/\n/g, ' ');
}

function safeTextToHtml(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
}

function formatText(text) {
    if (!text) return "";

    var html = escapeHtml(text);

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Paragraphs
    var paragraphs = html.split("\n\n");
    var result = "";

    for (var i = 0; i < paragraphs.length; i++) {
        if (paragraphs[i].trim()) {
            result += "<p>" + paragraphs[i].trim().replace(/\n/g, '<br>') + "</p>";
        }
    }

    return result || ("<p>" + html.replace(/\n/g, '<br>') + "</p>");
}

function cleanJsonResponse(text) {
    var cleaned = text;
    cleaned = cleaned.replace(/```json\s*/g, "");
    cleaned = cleaned.replace(/```\s*/g, "");
    cleaned = cleaned.trim();
    return cleaned;
}

// ─── SHARED STATE ──────────────────────
var selectedLevel = null;
var selectedStrictness = "normal";
var agent1Id = "";
var agent2Id = "";
var chatHistory = [];
var stepsCompleted = [false, false, false, false, false];
var currentTab = "theory";
var activeScenario = null;
var quizResults = [];

// ─── LEVEL SELECTION ───────────────────
function selectLevel(btn) {
    var buttons = document.querySelectorAll("#setupScreen .level-grid:first-of-type .level-btn");
    if (buttons.length === 0) {
        buttons = document.querySelectorAll("#setupScreen .level-btn[data-level]");
    }
    for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].hasAttribute("data-level")) {
            buttons[i].classList.remove("selected");
        }
    }
    btn.classList.add("selected");
    selectedLevel = btn.getAttribute("data-level");

    var strictCard = document.getElementById("strictnessCard");
    if (strictCard) {
        strictCard.style.display = "block";
    }

    checkStartReady();
}

// ─── STRICTNESS SELECTION ──────────────
function selectStrictness(btn) {
    var buttons = document.querySelectorAll(".strictness-btn");
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove("selected");
    }
    btn.classList.add("selected");
    selectedStrictness = btn.getAttribute("data-strictness");
    checkStartReady();
}

// ─── START READY CHECK ─────────────────
function checkStartReady() {
    var startBtn = document.getElementById("startBtn");
    if (startBtn) {
        startBtn.disabled = !selectedLevel;
    }
}

// ─── NAVIGATION ────────────────────────
function showTab(name) {
    var tabs = document.querySelectorAll(".tab-content");
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove("active");
    }

    var navBtns = document.querySelectorAll(".nav-btn");
    for (var j = 0; j < navBtns.length; j++) {
        navBtns[j].classList.remove("active");
    }

    var steps = document.querySelectorAll(".step");
    for (var k = 0; k < steps.length; k++) {
        steps[k].classList.remove("active");
    }

    var tabEl = document.getElementById("tab-" + name);
    if (tabEl) tabEl.classList.add("active");

    var navEl = document.getElementById("nav-" + name);
    if (navEl) navEl.classList.add("active");

    var stepMap = {
        theory: "step1",
        examples: "step2",
        scenario: "step3",
        chat: "step4",
        quiz: "step5"
    };

    var stepEl = document.getElementById(stepMap[name]);
    if (stepEl) stepEl.classList.add("active");

    currentTab = name;
    window.scrollTo(0, 0);
}

function completeStep(n) {
    stepsCompleted[n - 1] = true;
    var stepEl = document.getElementById("step" + n);
    if (stepEl) stepEl.classList.add("done");

    var circleEl = document.getElementById("sc" + n);
    if (circleEl) circleEl.textContent = "\u2713";
}

function resetTraining() {
    if (!confirm("Restart training? Your progress will be lost.")) return;

    document.getElementById("setupScreen").style.display = "flex";
    document.getElementById("trainingScreen").classList.remove("visible");

    chatHistory = [];
    stepsCompleted = [false, false, false, false, false];
    quizResults = [];
    window._examples = null;
    window._quizQuestions = null;

    var steps = document.querySelectorAll(".step");
    for (var i = 0; i < steps.length; i++) {
        steps[i].classList.remove("done");
        steps[i].classList.remove("active");
    }

    for (var j = 1; j <= 5; j++) {
        var sc = document.getElementById("sc" + j);
        if (sc) sc.textContent = "" + j;
    }

    document.getElementById("step1").classList.add("active");
    showTab("theory");
}

// ─── CHAT RENDER ───────────────────────
function renderChat() {
    var el = document.getElementById("chatHistory");
    if (chatHistory.length === 0) {
        el.innerHTML = '<div class="empty-msg">No messages yet. Ask a question or choose a suggestion below.</div>';
        return;
    }

    var html = "";
    for (var i = 0; i < chatHistory.length; i++) {
        var m = chatHistory[i];
        var roleLabel = m.role === "user" ? "You" : "AI Coach";
        html += '<div class="msg ' + m.role + '">';
        html += '<div class="msg-role">' + roleLabel + '</div>';
        html += '<div class="msg-bubble">' + formatText(m.content) + '</div>';
        html += '</div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
}

// ─── SEND CHAT (shared implementation) ─
function sendChat() {
    var input = document.getElementById("chatInput");
    var msg = input.value.trim();
    if (!msg) return;

    input.value = "";
    input.style.height = "auto";

    chatHistory.push({ role: "user", content: msg });
    renderChat();

    var btn = document.getElementById("sendBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    var histEl = document.getElementById("chatHistory");
    var loadEl = document.createElement("div");
    loadEl.className = "msg assistant";
    loadEl.innerHTML = '<div class="msg-role">AI Coach</div><div class="msg-bubble"><span class="spinner"></span> Thinking...</div>';
    histEl.appendChild(loadEl);
    histEl.scrollTop = histEl.scrollHeight;

    var systemPrompt = "";
    if (typeof SYSTEM_PROMPTS !== "undefined" && selectedLevel && SYSTEM_PROMPTS[selectedLevel]) {
        systemPrompt = SYSTEM_PROMPTS[selectedLevel];
    }

    callClaude(chatHistory, systemPrompt, 1024).then(function(reply) {
        chatHistory.push({ role: "assistant", content: reply });
        btn.disabled = false;
        btn.innerHTML = "➤";
        renderChat();
    }).catch(function(err) {
        chatHistory.push({ role: "assistant", content: "⚠ Error: " + err.message });
        btn.disabled = false;
        btn.innerHTML = "➤";
        renderChat();
    });
}

// ─── QUIZ ENGINE ───────────────────────
function loadQuiz() {
    var container = document.getElementById("quizQuestions");
    container.innerHTML = '<div class="empty-msg"><span class="spinner"></span> Generating assessment questions…</div>';

    var moduleLabel = typeof MODULE !== "undefined" ? MODULE.toUpperCase() : "COMPLIANCE";
    var levelLabel = typeof LEVEL_LABELS !== "undefined" && selectedLevel ? LEVEL_LABELS[selectedLevel] : selectedLevel;

    var prompt = 'You are a ' + moduleLabel + ' compliance trainer. Create EXACTLY 3 assessment questions for a ' + levelLabel + '.\n\n'
+ 'Create:\n- 2 scenario-based questions (practical, realistic situations)\n- 1 knowledge question (testing regulatory understanding)\n\n'
+ 'Return STRICT JSON only, no markdown:\n[\n  {\n    "q": "Full question text",\n    "hint": "Brief hint for the answer field placeholder"\n  }\n]';

    callClaude(
        [{ role: "user", content: prompt }],
        "You are a precise compliance trainer. Respond only with the requested JSON array.",
        1000
    ).then(function(reply) {
        var clean = cleanJsonResponse(reply);
        var questions = JSON.parse(clean);
        window._quizQuestions = questions;
        renderQuizQuestions(questions);
    }).catch(function(err) {
        container.innerHTML = '<div class="empty-msg">⚠ Failed to generate questions: ' + escapeHtml(err.message || 'Unknown error') + '</div>';
    });
}

function renderQuizQuestions(questions) {
    var container = document.getElementById("quizQuestions");
    container.innerHTML = "";
    quizResults = [];

    for (var i = 0; i < questions.length; i++) {
        var q = questions[i];
        var el = document.createElement("div");
        el.className = "quiz-q";
        el.id = "qq" + i;
        el.innerHTML = '<div class="quiz-q-header">'
+ '<span class="quiz-num">Q' + (i + 1) + '</span>'
+ '<div class="quiz-q-text">' + safeTextToHtml(q.q || '') + '</div>'
+ '</div>'
+ '<div class="quiz-q-body">'
+ '<textarea class="quiz-textarea" id="qa' + i + '" placeholder="' + escapeAttribute(q.hint || "Type your answer...") + '" rows="3"></textarea>'
+ '<button class="btn-check" id="qbtn' + i + '" onclick="checkAnswer(' + i + ')">Check Answer</button>'
+ '<div class="quiz-feedback" id="qfb' + i + '">'
+ '<div class="fb-label" id="qfblabel' + i + '">Feedback</div>'
+ '<p id="qfbtext' + i + '"></p>'
+ '</div>'
+ '</div>';
        container.appendChild(el);
    }

    var submitWrap = document.getElementById("submitWrap");
    if (submitWrap) submitWrap.style.display = "flex";
}

function checkAnswer(idx) {
    var answer = document.getElementById("qa" + idx).value.trim();
    if (!answer) { alert("Please enter an answer first."); return; }

    var questions = window._quizQuestions;
    if (!questions || !questions[idx]) return;

    var btn = document.getElementById("qbtn" + idx);
    btn.disabled = true;
    btn.textContent = "Evaluating…";

    var moduleLabel = typeof MODULE !== "undefined" ? MODULE.toUpperCase() : "COMPLIANCE";
    var levelLabel = typeof LEVEL_LABELS !== "undefined" && selectedLevel ? LEVEL_LABELS[selectedLevel] : selectedLevel;
    var strictnessInstr = typeof STRICTNESS_INSTRUCTIONS !== "undefined" && selectedStrictness ? STRICTNESS_INSTRUCTIONS[selectedStrictness] : "";

    

  var prompt = 'You are a ' + moduleLabel + ' compliance trainer. Evaluate the following answer from a ' + levelLabel + '.\n\n'
+ 'QUESTION:\n' + questions[idx].q + '\n\n'
+ 'TRAINEE ANSWER:\n' + answer + '\n\n'
+ 'STRICTNESS SETTING:\n' + selectedStrictness + '\n\n'
+ 'SCORING RULES:\n'
+ '- You must return exactly one of these scores: goed, gedeeltelijk, onvoldoende.\n'
+ '- Use the strictness setting as a hard grading instruction, not as a soft preference.\n'
+ '- If strictness is light: reward genuine effort and basic understanding. Only score onvoldoende if the answer is empty, fully incorrect, or clearly off-topic.\n'
+ '- If strictness is normal: require the main point to be correct. Minor omissions are acceptable, but major missing elements or incorrect assumptions prevent a score of goed.\n'
+ '- If strictness is hard: only score goed if the answer is complete, precise, and materially accurate. Missing key legal/regulatory elements, vague wording, or partial reasoning should usually result in gedeeltelijk. Clear errors or major omissions must result in onvoldoende.\n\n'
+ 'DECISION METHOD:\n'
+ '- First determine whether the answer is factually correct.\n'
+ '- Then determine whether key elements are missing.\n'
+ '- Then apply the strictness threshold.\n'
+ '- Be consistent: the same answer must receive a lower score under hard than under light if it is incomplete.\n\n'
+ 'OUTPUT FORMAT:\n'
+ 'Return valid JSON only, with no markdown and no extra text:\n'
+ '{\n'
+ '  "score": "goed|gedeeltelijk|onvoldoende",\n'
+ '  "feedback": "Max 4 sentences in English. Start with what was good, then name the most important improvements.",\n'
+ '  "correctAnswer": "The ideal complete answer, referencing relevant articles where appropriate, in English."\n'
+ '}';




  callClaude(
        [{ role: "user", content: prompt }],
        "You are a precise compliance trainer. Respond only with the requested JSON object.",
        800
    ).then(function(reply) {
        var clean = cleanJsonResponse(reply);
        var parsed;
        try {
            parsed = JSON.parse(clean);
        } catch(e) {
            parsed = { score: "gedeeltelijk", feedback: reply, correctAnswer: "" };
        }

        quizResults[idx] = parsed.score;

        var scoreMap = { goed: "good", gedeeltelijk: "partial", onvoldoende: "poor" };
        var labelMap = { goed: "✓ Well Answered", gedeeltelijk: "◑ Partially Correct", onvoldoende: "✗ Needs Improvement" };

        var fbEl = document.getElementById("qfb" + idx);
        fbEl.className = "quiz-feedback visible " + (scoreMap[parsed.score] || "partial");
        document.getElementById("qfblabel" + idx).textContent = labelMap[parsed.score] || "Feedback";
        document.getElementById("qfbtext" + idx).innerHTML =
          '<p><strong>Feedback:</strong> ' + safeTextToHtml(parsed.feedback || '') + '</p>' +
          '<p style="margin-top:8px"><strong>Model Answer:</strong> ' + safeTextToHtml(parsed.correctAnswer || '') + '</p>';

        btn.textContent = "Checked ✓";

        checkAllQuizDone();
    }).catch(function(err) {
        document.getElementById("qfbtext" + idx).textContent = "Error: " + (err.message || "Unknown error");
        document.getElementById("qfb" + idx).className = "quiz-feedback visible partial";
        btn.disabled = false;
        btn.textContent = "Try Again";
    });
}

function submitAllQuiz() {
    var questions = window._quizQuestions;
    if (!questions) return;

    var pending = [];
    for (var i = 0; i < questions.length; i++) {
        var fb = document.getElementById("qfb" + i);
        if (!fb || !fb.classList.contains("visible")) {
            pending.push(i);
        }
    }

    if (pending.length === 0) return;

    function processNext(idx) {
        if (idx >= pending.length) return;
        var answer = document.getElementById("qa" + pending[idx]).value.trim();
        if (!answer) {
            alert("Please fill in answer for question " + (pending[idx] + 1));
            return;
        }
        // Wait for checkAnswer to complete, then process next
        var origBtn = document.getElementById("qbtn" + pending[idx]);
        checkAnswer(pending[idx]);

        // Poll for completion
        var poll = setInterval(function() {
            if (origBtn.textContent.indexOf("✓") !== -1 || origBtn.textContent === "Try Again") {
                clearInterval(poll);
                processNext(idx + 1);
            }
        }, 500);
    }

    processNext(0);
}

function checkAllQuizDone() {
    var questions = window._quizQuestions;
    if (!questions) return;
    var allDone = true;
    for (var i = 0; i < questions.length; i++) {
        var fb = document.getElementById("qfb" + i);
        if (!fb || !fb.classList.contains("visible")) {
            allDone = false;
            break;
        }
    }

    if (allDone) {
        completeStep(5);
        var certBanner = document.getElementById("certBanner");
        if (certBanner) certBanner.classList.add("visible");
        var submitWrap = document.getElementById("submitWrap");
        if (submitWrap) submitWrap.style.display = "none";
    }
}

// ─── CERTIFICATE GENERATION ────────────
function generateCertificate() {
    var popup = document.getElementById("popupOverlay");
    var content = document.getElementById("popupContent");

    var moduleLabel = typeof MODULE !== "undefined" ? MODULE.toUpperCase() : "COMPLIANCE";
    var levelLabel = typeof LEVEL_LABELS !== "undefined" && selectedLevel ? LEVEL_LABELS[selectedLevel] : selectedLevel;
    var today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    var certId = moduleLabel + "-" + (selectedLevel || "").toUpperCase() + "-" + Date.now() + "-" + Math.floor(Math.random() * 100000);

    var scoreCount = { goed: 0, gedeeltelijk: 0, onvoldoende: 0 };
    for (var i = 0; i < quizResults.length; i++) {
        if (scoreCount.hasOwnProperty(quizResults[i])) {
            scoreCount[quizResults[i]]++;
        }
    }


var strictnessShortLabels = {
    light: "Lenient",
    normal: "Standard",
    hard: "Strict"
};

var strictnessLabel = strictnessShortLabels[selectedStrictness] || "Standard";


    var resultsSummary = scoreCount.goed + " correct · " + scoreCount.gedeeltelijk + " partial · " + scoreCount.onvoldoende + " insufficient";

    content.innerHTML = `
        <h2>🏆 Certificate of Completion</h2>
        <p><strong>${escapeHtml(moduleLabel)} Compliance Training</strong></p>
        <p>Training Level: ${escapeHtml(levelLabel || "")}</p>
        <p>Assessment Level: ${escapeHtml(strictnessLabel)}</p>
        <p>Date: ${escapeHtml(today)}</p>
        <p>Results: ${escapeHtml(resultsSummary)}</p>
        <p style="font-size:11px;color:var(--muted);margin-top:4px">Certificate ID: ${escapeHtml(certId)}</p>
        <div class="popup-buttons">
            <button class="btn-primary" onclick="downloadCertificatePDF('${certId}')">Download PDF</button>
            <button class="btn-secondary" onclick="closePopup()">Close</button>
        </div>`;

    popup.classList.remove("hidden");
}

function closePopup() {
    document.getElementById("popupOverlay").classList.add("hidden");
}

function downloadCertificatePDF(certId) {
    if (typeof window.jspdf === "undefined") {
        // Load jsPDF dynamically
        var script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        script.onload = function() { _generatePDF(certId); };
        document.head.appendChild(script);
    } else {
        _generatePDF(certId);
    }
}

function _generatePDF(certId) {
    var jsPDF = window.jspdf.jsPDF;
    if (!jsPDF) { alert("PDF library not loaded"); return; }

    var doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    var W = 297, H = 210, cx = W / 2;

    var moduleLabel = typeof MODULE !== "undefined" ? MODULE.toUpperCase() : "COMPLIANCE";
    var levelLabel = typeof LEVEL_LABELS !== "undefined" && selectedLevel ? LEVEL_LABELS[selectedLevel] : selectedLevel;
    var today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

    var scoreCount = { goed: 0, gedeeltelijk: 0, onvoldoende: 0 };
    for (var i = 0; i < quizResults.length; i++) {
        if (scoreCount.hasOwnProperty(quizResults[i])) {
            scoreCount[quizResults[i]]++;
        }
    }



var STRICTNESS_SHORT_LABELS = {
    light: "Lenient",
    normal: "Standard",
    hard: "Strict"
};

var strictnessLabel = STRICTNESS_SHORT_LABELS[selectedStrictness] || "Standard";


    var resultsSummary = scoreCount.goed + " correct · " + scoreCount.gedeeltelijk + " partial · " + scoreCount.onvoldoende + " insufficient";

    // Background
    doc.setFillColor(7, 16, 30);
    doc.rect(0, 0, W, H, "F");

    // Inner panel
    doc.setFillColor(13, 26, 46);
    doc.roundedRect(8, 8, W - 16, H - 16, 4, 4, "F");

    // Gold border
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.8);
    doc.roundedRect(9, 9, W - 18, H - 18, 3.5, 3.5, "S");

    // Inner border
    doc.setDrawColor(232, 201, 122);
    doc.setLineWidth(0.3);
    doc.roundedRect(13, 13, W - 26, H - 26, 2, 2, "S");

    // Top/bottom bars
    doc.setFillColor(201, 168, 76);
    doc.rect(9, 9, W - 18, 1.2, "F");
    doc.rect(9, H - 10.2, W - 18, 1.2, "F");

    // Header badge (dynamic width for proper centering)
    var badgeText = moduleLabel + " COMPLIANCE TRAINING";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    var badgePaddingX = 8;
    var badgeH = 7, badgeY = 24;
    var badgeW = Math.max(70, doc.getTextWidth(badgeText) + badgePaddingX * 2);
    doc.setFillColor(19, 32, 53);
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.4);
    doc.roundedRect(cx - badgeW / 2, badgeY, badgeW, badgeH, 1.5, 1.5, "FD");
    doc.setTextColor(201, 168, 76);
    doc.text(badgeText, cx, badgeY + 4.6, { align: "center" });

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(220, 232, 245);
    doc.text("Certificate of Completion", cx, 52, { align: "center" });

    // Decorative line
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.25);
    doc.line(cx - 80, 56, cx + 80, 56);

    // Subtitle
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(78, 106, 136);
    doc.text("This is to certify that the participant has successfully completed all modules of the", cx, 63, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(232, 201, 122);
    doc.text(moduleLabel + " Compliance Training Programme", cx, 70, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(78, 106, 136);
    doc.text("including theory, practice examples, scenario exercises, AI coaching and assessment.", cx, 77, { align: "center" });

    // Level chip
    var cleanLevel = (levelLabel || "").replace(/^[^\s]+\s/, "");
    var chipW = 110, chipH = 16, chipY = 84;
    doc.setFillColor(19, 32, 53);
    doc.setDrawColor(28, 46, 71);
    doc.setLineWidth(0.3);
    doc.roundedRect(cx - chipW / 2, chipY, chipW, chipH, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.1);
    doc.setTextColor(78, 106, 136);
    doc.text("TRAINING LEVEL", cx, chipY + 3.8, { align: "center", charSpace: 0.6 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.3);
    doc.setTextColor(220, 232, 245);
    doc.text(cleanLevel, cx, chipY + 8.6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(232, 201, 122);
    doc.text("Assessment Level: " + strictnessLabel, cx, chipY + 13.2, { align: "center" });

    // Info columns
    var colY = 114;
    var cols = [
        { label: "DATE ISSUED", value: today },
        { label: "CERTIFICATE ID", value: certId.length > 30 ? certId.substring(0, 30) + "…" : certId },
        { label: "ISSUED BY", value: moduleLabel + " Training Platform" }
    ];
    var colW = (W - 40) / 3;
    for (var ci = 0; ci < cols.length; ci++) {
        var x = 20 + ci * colW + colW / 2;
        if (ci > 0) {
            doc.setDrawColor(28, 46, 71);
            doc.setLineWidth(0.2);
            doc.line(20 + ci*colW, colY - 4, 20 + ci*colW, colY + 14);
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(201, 168, 76);
        doc.text(cols[ci].label, x, colY, { align: "center", charSpace: 0.5 });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(220, 232, 245);
        doc.text(cols[ci].value, x, colY + 7, { align: "center" });
    }

    // Results summary
    var resultsY = 140;
    doc.setFillColor(19, 32, 53);
    doc.setDrawColor(28, 46, 71);
    doc.setLineWidth(0.3);
    doc.roundedRect(42, resultsY - 7, W - 84, 16, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(201, 168, 76);
    doc.text("RESULTS", cx, resultsY - 1.2, { align: "center", charSpace: 0.5 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(220, 232, 245);
    doc.text(resultsSummary, cx, resultsY + 5, { align: "center" });

    // Footer
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.25);
    doc.line(cx - 120, H - 16, cx + 120, H - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(78, 106, 136);
    doc.text("This certificate was generated by the " + moduleLabel + " Compliance Training Platform.", cx, H - 12, { align: "center" });

    doc.save(moduleLabel + "-Certificate-" + certId + ".pdf");
}

