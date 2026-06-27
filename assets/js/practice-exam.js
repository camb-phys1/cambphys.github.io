// Practice exam viewer (MC and FRQ modes).
// Selects which exam to load via ?exam= URL param.
//   ?exam=fma     → F=ma practice exam (default for back-compat)
//   ?exam=ap-mc   → AP1 multiple-choice practice exam
//   ?exam=ap-frq  → AP1 free-response practice exam (no input; solutions revealed at end)
(function () {
  const EXAMS = {
    "fma": {
      mode: "mc",
      title: "Practice F=ma Exam",
      json: "/assets/psets/fma/practice-exam.json",
      back: "/courses/fma/",
      storageKey: "cambphys.practice-exam.fma.v1",
    },
    "ap-mc": {
      mode: "mc",
      title: "Practice AP1 Exam — Multiple Choice",
      json: "/assets/psets/ap/practice-exam-mc.json",
      back: "/courses/ap/",
      storageKey: "cambphys.practice-exam.ap-mc.v1",
    },
    "ap-frq": {
      mode: "frq",
      title: "Practice AP1 Exam — Free Response",
      json: "/assets/psets/ap/practice-exam-frq.json",
      back: "/courses/ap/",
      storageKey: "cambphys.practice-exam.ap-frq.v1",
    },
    "usapho-a": {
      mode: "frq",
      title: "Mock USAPhO Exam — Part A",
      json: "/assets/psets/usapho/practice-exam-a.json",
      back: "/courses/usapho/",
      storageKey: "cambphys.practice-exam.usapho-a.v1",
    },
    "usapho-b": {
      mode: "frq",
      title: "Mock USAPhO Exam — Part B",
      json: "/assets/psets/usapho/practice-exam-b.json",
      back: "/courses/usapho/",
      storageKey: "cambphys.practice-exam.usapho-b.v1",
    },
  };

  const STAGE = () => document.getElementById("exam-stage");
  const LETTERS = ["A","B","C","D","E","F","G"];

  let cfg = null;
  let data = null;
  let state = null;
  let tickTimer = null;

  async function init() {
    const examId = new URLSearchParams(location.search).get("exam") || "fma";
    cfg = EXAMS[examId];
    if (!cfg) { STAGE().innerHTML = "<p>Unknown exam.</p>"; return; }

    const res = await fetch(cfg.json);
    if (!res.ok) { STAGE().innerHTML = "<p>Could not load exam.</p>"; return; }
    data = await res.json();

    try {
      const raw = sessionStorage.getItem(cfg.storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && saved.started_at && !saved.finished) {
          const elapsed = (Date.now() - saved.started_at) / 1000;
          if (elapsed < data.time_limit_seconds) {
            state = saved;
            renderExam();
            return;
          }
          sessionStorage.removeItem(cfg.storageKey);
        } else if (saved && saved.finished) {
          state = saved;
          renderResults();
          return;
        }
      }
    } catch (_) {}

    renderRules();
  }

  function persist() {
    try { sessionStorage.setItem(cfg.storageKey, JSON.stringify(state)); } catch (_) {}
  }
  function clearStored() {
    try { sessionStorage.removeItem(cfg.storageKey); } catch (_) {}
  }
  // Custom confirm modal (replaces native confirm so the "website says" prefix
   // doesn't appear). `title` is the bold heading; `detail` is the smaller body.
   function customConfirm(title, detail) {
    return new Promise(resolve => {
      document.querySelectorAll(".exam-confirm-backdrop").forEach(n => n.remove());
      const back = document.createElement("div");
      back.className = "exam-confirm-backdrop";
      back.innerHTML = `
        <div class="exam-confirm" role="dialog" aria-modal="true">
          <h3>${title}</h3>
          ${detail ? `<p>${detail}</p>` : ""}
          <div class="exam-confirm-actions">
            <button type="button" class="exam-confirm-cancel">Cancel</button>
            <button type="button" class="exam-confirm-ok">OK</button>
          </div>
        </div>`;
      const close = (v) => { back.remove(); resolve(v); };
      back.querySelector(".exam-confirm-ok").addEventListener("click", () => close(true));
      back.querySelector(".exam-confirm-cancel").addEventListener("click", () => close(false));
      back.addEventListener("click", (e) => { if (e.target === back) close(false); });
      document.body.appendChild(back);
    });
  }

  function typeset(el) {
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(()=>{});
    }
  }

  // ---- Rules screen ------------------------------------------------------
  function renderRules() {
    const mins = Math.floor(data.time_limit_seconds / 60);
    const total = data.total || data.problems.length;
    const ruleItems = cfg.mode === "frq" ? `
        <li><strong>Have paper and pencil ready before you begin.</strong> Write all your work and final answers on paper — there are no input boxes on screen.</li>
        <li>You have <strong>${mins} minutes</strong> to work through <strong>${total} free-response questions</strong>.</li>
        <li>When time is up (or you click <strong>Finish Exam</strong>), the official solutions will be revealed in place so you can self-grade against your written work.</li>
        <li>You may exit at any time — your timer state will be discarded and you can retake.</li>` : `
        <li>You have <strong>${mins} minutes</strong> to complete <strong>${total} multiple-choice questions</strong>.</li>
        <li>Click on the choice you believe is correct.</li>
        <li>Correct answers are worth <strong>1 point</strong>. Incorrect answers are worth <strong>0 points</strong> (no penalty for guessing).</li>
        <li>You may finish early by clicking <strong>Finish Exam</strong> at the bottom.</li>
        <li>You may exit at any time — your progress will be discarded and you can retake.</li>
        <li>When the timer reaches <strong>00:00</strong>, the exam ends automatically.</li>`;
    STAGE().innerHTML = `
      <div class="exam-rules">
        <a class="pset-back rules-back" href="${cfg.back}">← Back to course</a>
        <h1>${cfg.title}</h1>
        <ul>${ruleItems}</ul>
        <p>The timer will begin the moment you press <strong>Begin Now</strong>.</p>
        <button type="button" class="exam-begin-btn" id="begin-btn">Begin Now</button>
      </div>`;
    document.getElementById("begin-btn").addEventListener("click", () => {
      state = { started_at: Date.now(), answers: {}, finished: false, bookmarks: [] };
      persist();
      renderExam();
    });
  }

  function bookmarkSet() {
    if (!state.bookmarks) state.bookmarks = [];
    return new Set(state.bookmarks);
  }
  function toggleBookmark(i) {
    const s = bookmarkSet();
    if (s.has(i)) s.delete(i); else s.add(i);
    state.bookmarks = [...s];
    persist();
    document.querySelectorAll(`[data-bm-toggle="${i}"]`).forEach(b => {
      const on = s.has(i);
      b.textContent = on ? "★" : "☆";
      b.classList.toggle("bookmarked", on);
    });
    refreshDrawer();
  }
  function refreshDrawer() {
    const list = document.getElementById("exam-drawer-list");
    if (!list) return;
    const bm = bookmarkSet();
    const parts = data.problems.map((p, i) =>
      `<li data-idx="${i}"><button type="button">` +
      `<span class="drawer-num">${p.num}</span>` +
      `<span class="drawer-bm">${bm.has(i) ? "★" : ""}</span>` +
      `</button></li>`).join("");
    list.innerHTML = parts;
    list.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => {
        const i = parseInt(li.dataset.idx, 10);
        document.getElementById("exam-drawer").classList.remove("open");
        const target = document.getElementById(`exam-q-${i}`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }
  function wireDrawer() {
    document.getElementById("jump-toggle").addEventListener("click", () => {
      document.getElementById("exam-drawer").classList.toggle("open");
    });
    document.getElementById("jump-close").addEventListener("click", () => {
      document.getElementById("exam-drawer").classList.remove("open");
    });
  }

  // ---- Active exam --------------------------------------------------------
  function renderExam() {
    const html = [];
    const bm = bookmarkSet();
    html.push(`
      <div class="exam-topbar">
        <h2>${cfg.title}</h2>
        <span class="exam-timer" id="exam-timer">--:--</span>
        <button type="button" class="pset-mini compact" id="jump-toggle" title="Jump to a specific problem">☰ Problem Viewer</button>
        <button type="button" class="exit-btn" id="exit-btn">Exit Exam</button>
      </div>
      <aside class="exam-drawer" id="exam-drawer">
        <div class="exam-drawer-head">
          <strong>Problems</strong>
          <button type="button" id="jump-close" class="exam-drawer-close" aria-label="Close">×</button>
        </div>
        <ol class="exam-drawer-list" id="exam-drawer-list"></ol>
      </aside>`);

    if (cfg.mode === "frq") {
      html.push(`<p class="exam-paper-reminder">Remember: write your work and answers on paper. Solutions will appear here when time is up or you click <strong>Finish Exam</strong>.</p>`);
    }

    function bmBtn(i) {
      const on = bm.has(i);
      return `<button type="button" class="exam-bm-btn ${on ? "bookmarked" : ""}" data-bm-toggle="${i}" title="Bookmark this question">${on ? "★" : "☆"}</button>`;
    }

    function renderMCQuestion(p, i) {
      const chosen = state.answers[i];
      return `
        <div class="exam-question" id="exam-q-${i}" data-q="${i}">
          <div class="stem">
            <span class="qnum">${p.num}.</span>${p.problem}
            ${bmBtn(i)}
          </div>
          <div class="choices">
            ${p.choices.map((c, ci) => `
              <label>
                <input type="radio" name="q${i}" value="${ci}" ${chosen === ci ? "checked" : ""}>
                <span class="letter">${LETTERS[ci]}.</span>
                <span class="choice-body">${c}</span>
              </label>`).join("")}
          </div>
        </div>`;
    }

    function renderFRQQuestion(p, i) {
      return `
        <div class="exam-question frq" id="exam-q-${i}" data-q="${i}">
          <div class="stem">
            <span class="qnum">${p.num}.</span>${p.problem}
            ${bmBtn(i)}
          </div>
        </div>`;
    }

    const renderQ = cfg.mode === "frq" ? renderFRQQuestion : renderMCQuestion;

    for (let i = 0; i < data.problems.length; i++) {
      const p = data.problems[i];
      if (p.preamble) {
        const next = data.problems[i + 1];
        html.push(`<div class="exam-group">`);
        html.push(`<div class="exam-preamble">${p.preamble}</div>`);
        html.push(renderQ(p, i));
        if (next && !next.preamble && cfg.mode !== "frq") {
          html.push(renderQ(next, i + 1));
          i++;
        }
        html.push(`</div>`);
      } else {
        html.push(renderQ(p, i));
      }
    }

    html.push(`
      <div class="exam-bottom">
        <button type="button" class="finish-exam-btn" id="finish-btn">Finish Exam</button>
      </div>`);

    STAGE().innerHTML = html.join("");

    STAGE().querySelectorAll('input[type=radio]').forEach(inp => {
      inp.addEventListener("change", () => {
        const q = parseInt(inp.name.slice(1), 10);
        state.answers[q] = parseInt(inp.value, 10);
        persist();
      });
    });
    STAGE().querySelectorAll('[data-bm-toggle]').forEach(b => {
      b.addEventListener("click", () => toggleBookmark(parseInt(b.dataset.bmToggle, 10)));
    });
    wireDrawer();
    refreshDrawer();
    document.getElementById("exit-btn").addEventListener("click", async () => {
      const ok = await customConfirm("Exit Exam?", "Your progress will be discarded.");
      if (!ok) return;
      clearStored();
      window.location.href = cfg.back;
    });
    document.getElementById("finish-btn").addEventListener("click", async () => {
      const detail = cfg.mode === "frq"
        ? "Solutions will be revealed."
        : "You can review your answers after.";
      const ok = await customConfirm("Finish the exam now?", detail);
      if (!ok) return;
      finalize();
    });

    if (tickTimer) clearInterval(tickTimer);
    tick();
    tickTimer = setInterval(tick, 1000);

    typeset(STAGE());
  }

  function tick() {
    if (!state || state.finished) return;
    const elapsed = Math.floor((Date.now() - state.started_at) / 1000);
    const remaining = Math.max(0, data.time_limit_seconds - elapsed);
    const el = document.getElementById("exam-timer");
    if (el) {
      const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
      const ss = String(remaining % 60).padStart(2, "0");
      el.textContent = `${mm}:${ss}`;
      el.classList.toggle("urgent", remaining <= 300);
    }
    if (remaining <= 0) {
      clearInterval(tickTimer); tickTimer = null;
      finalize(true);
    }
  }

  function finalize(timeUp) {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    state.finished = true;
    state.finished_at = Date.now();
    state.timeUp = !!timeUp;
    persist();
    renderResults();
    window.scrollTo(0, 0);
  }

  // ---- Results screen -----------------------------------------------------
  function renderResults() {
    const html = [];
    html.push(`
      <div class="results-top-actions">
        <a class="pset-back" href="${cfg.back}">← Back to course</a>
        <button type="button" class="retake-btn" id="retake-btn-top">Retake Exam</button>
      </div>`);

    if (cfg.mode === "mc") {
      let correct = 0;
      for (let i = 0; i < data.problems.length; i++) {
        const p = data.problems[i];
        const chosen = state.answers[i];
        const ans = p.correct;
        const isMulti = Array.isArray(ans);
        if (isMulti) {
          // Single-radio UI can't capture multi-select; count correct only if the chosen index is in the answer set.
          if (chosen != null && ans.includes(chosen)) correct++;
        } else if (chosen === ans) {
          correct++;
        }
      }
      const total = data.problems.length;
      html.push(`
        <div class="exam-score">
          <h2>Score: ${correct} / ${total}</h2>
          <div class="sub">${((correct/total)*100).toFixed(0)}%${state.timeUp ? " — time expired" : ""}</div>
        </div>`);
    } else {
      html.push(`
        <div class="exam-score">
          <h2>${state.timeUp ? "Time's up — self-grade against the solutions below." : "Self-grade against the solutions below."}</h2>
        </div>`);
    }

    function renderMCResult(p, i) {
      const chosen = state.answers[i];
      const ans = p.correct;
      const isMulti = Array.isArray(ans);
      const isCorrectChoice = (ci) => isMulti ? ans.includes(ci) : ci === ans;
      const isRight = isMulti ? (chosen != null && ans.includes(chosen)) : chosen === ans;
      return `
        <div class="result-question ${isRight ? "right" : "wrong"}" data-q="${i}">
          <div class="stem">
            <span class="qnum">${p.num}.</span>${p.problem}
          </div>
          <div class="choices">
            ${p.choices.map((c, ci) => {
              const cls = isCorrectChoice(ci) ? "correct"
                        : (ci === chosen ? "user-wrong" : "");
              const mark = isCorrectChoice(ci) ? " ← correct"
                        : (ci === chosen ? " ← your answer" : "");
              return `<label class="${cls}">
                <input type="radio" name="r${i}" disabled ${ci === chosen ? "checked" : ""}>
                <span class="letter">${LETTERS[ci]}.</span>
                <span class="choice-body">${c}</span>
                <span style="margin-left:auto;font-size:.85em;color:#666;">${mark}</span>
              </label>`;
            }).join("")}
          </div>
          ${p.solution ? `<div class="solution-box"><h4>Solution</h4><div>${p.solution}</div></div>` : ""}
        </div>`;
    }

    function renderFRQResult(p, i) {
      return `
        <div class="result-question frq" data-q="${i}">
          <div class="stem">
            <span class="qnum">${p.num}.</span>${p.problem}
          </div>
          <div class="solution-box">
            <h4>Official Solution</h4>
            <div>${p.solution}</div>
          </div>
        </div>`;
    }

    const renderR = cfg.mode === "frq" ? renderFRQResult : renderMCResult;

    for (let i = 0; i < data.problems.length; i++) {
      const p = data.problems[i];
      if (p.preamble) {
        const next = data.problems[i + 1];
        html.push(`<div class="exam-group">`);
        html.push(`<div class="exam-preamble">${p.preamble}</div>`);
        html.push(renderR(p, i));
        if (next && !next.preamble && cfg.mode !== "frq") {
          html.push(renderR(next, i + 1));
          i++;
        }
        html.push(`</div>`);
      } else {
        html.push(renderR(p, i));
      }
    }

    STAGE().innerHTML = html.join("");
    document.getElementById("retake-btn-top").addEventListener("click", async () => {
      const ok = await customConfirm("Retake Exam?", "Your current results will be erased.");
      if (!ok) return;
      clearStored();
      state = null;
      renderRules();
      window.scrollTo(0, 0);
    });
    typeset(STAGE());
  }

  window.cambphysExam = { init };
})();
