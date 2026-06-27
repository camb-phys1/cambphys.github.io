// Problem-set slideshow viewer.
// URL: /pset/?lesson=ap-01
// Depends on window.cambphysAuth (auth.js) and MathJax (loaded by the page).
(function () {
  let lessonId = null;
  let courseId = null;
  let problems = [];      // filtered, non-lecture-review items
  let lectureItems = [];  // any lecture-review items (currently unused for AP)
  let currentIndex = 0;
  let bookmarks = new Set();
  let completedProblems = new Set();   // per-problem completion (indices)
  let isCompleted = false;             // pset-level completion (the whole set)
  let lessonTitle = "";

  // ---- Init ----------------------------------------------------------------

  async function init() {
    const params = new URLSearchParams(window.location.search);
    lessonId = params.get("lesson");
    if (!lessonId || !/^[a-z]+-\d{2}$/.test(lessonId)) {
      stage().innerHTML = '<p class="pset-loading">Missing or invalid ?lesson= param.</p>';
      return;
    }
    courseId = lessonId.split("-")[0];

    // Look up lesson title from the courses catalog
    const lessons = window.cambphysCourses.buildLessons(courseId);
    const lesson = lessons.find(l => l.id === lessonId);
    lessonTitle = lesson ? lesson.title : lessonId;
    document.getElementById("pset-title").textContent = lessonTitle;
    const back = document.querySelector(".pset-back");
    back.href = `/courses/${courseId}/`;
    back.textContent = "← Back to course";

    // Restore saved state
    const prog = await window.cambphysAuth.getProgress(lessonId);
    if (prog) {
      isCompleted = !!prog.completed;
      const data = prog.data || {};
      bookmarks = new Set(data.bookmarks || []);
      completedProblems = new Set(data.completed_problems || []);
      currentIndex = Number.isInteger(data.current_slide) ? data.current_slide : 0;
    }

    // Fetch JSON
    let data;
    try {
      const res = await fetch(`/assets/psets/${courseId}/${lessonId}.json`);
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (e) {
      stage().innerHTML = `<p class="pset-loading">Could not load problems (${e.message}).</p>`;
      return;
    }

    // Split lecture-review items from real problems. AP's JSONs have no lecture
    // review, but the rule is: if section/subsection mentions "lecture", filter.
    problems = [];
    lectureItems = [];
    for (const item of data) {
      const s = ((item.section || "") + " " + (item.subsection || "")).toLowerCase();
      if (s.includes("lecture")) lectureItems.push(item);
      else problems.push(item);
    }

    if (currentIndex > problems.length) currentIndex = problems.length;

    wireNav();
    wireDrawer();
    render();
  }

  function stage() { return document.getElementById("pset-stage"); }

  // ---- Render --------------------------------------------------------------

  function render() {
    const total = problems.length;
    const onFinalSlide = currentIndex === total;
    document.getElementById("jump-toggle").textContent = "☰ Problem Viewer";

    if (onFinalSlide) {
      renderFinalSlide();
    } else {
      renderProblem(problems[currentIndex], currentIndex);
    }

    // Nav buttons
    document.getElementById("prev-btn").disabled = currentIndex === 0;
    document.getElementById("next-btn").textContent = onFinalSlide ? "Finish →" : "Next →";
    document.getElementById("next-btn").disabled = onFinalSlide;

    const bmBtn = document.getElementById("bookmark-btn");
    const compBtn = document.getElementById("complete-btn");
    if (onFinalSlide) {
      bmBtn.style.display = "none";
      compBtn.style.display = "none";
    } else {
      bmBtn.style.display = "";
      const isBookmarked = bookmarks.has(currentIndex);
      bmBtn.textContent = (isBookmarked ? "★" : "☆") + " Bookmark";
      bmBtn.classList.toggle("bookmarked", isBookmarked);

      compBtn.style.display = "";
      const isDone = completedProblems.has(currentIndex);
      compBtn.textContent = "✓ Mark Complete";
      compBtn.classList.toggle("completed", isDone);
    }

    // Math typeset
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([stage()]).catch(() => {});
    }

    // Refresh the jump-drawer list (so bookmarks + current marker stay accurate)
    refreshDrawer();

    // Persist current slide (debounced via simple await)
    saveStateDebounced();
  }

  function subsectionClass(s) {
    if (!s) return "";
    const ls = s.toLowerCase();
    // One-off overrides keyed by exact subsection text (no course required —
    // currently only used in F=ma Kinematics 2).
    if (ls.includes("projectile motion"))    return "sub-concept";
    if (ls.includes("olympiad kinematics"))  return "sub-challenge";
    // For AP1, "Exercises" → easy (green), "Problems" → medium (yellow)
    if (courseId === "ap") {
      if (ls.includes("challenge")) return "sub-challenge";
      if (ls === "problems")        return "sub-exercise"; // medium = yellow
      if (ls.includes("exercise"))  return "sub-concept";  // easy = green
      return "";
    }
    if (ls.includes("concept"))   return "sub-concept";
    if (ls.includes("challenge")) return "sub-challenge";
    if (ls.includes("exercise"))  return "sub-exercise";
    return "";
  }

  function subsectionLabel(s) {
    if (!s) return "";
    const ls = s.toLowerCase();
    if (ls.includes("projectile motion"))    return "Easy";
    if (ls.includes("olympiad kinematics"))  return "Hard";
    if (courseId === "ap") {
      if (ls.includes("challenge")) return "Hard";
      if (ls === "problems")        return "Medium";
      if (ls.includes("exercise"))  return "Easy";
      return s;
    }
    if (ls.includes("concept"))   return "Easy";
    if (ls.includes("exercise"))  return "Medium";
    if (ls.includes("challenge")) return "Hard";
    return s;
  }

  function refreshDrawer() {
    const list = document.getElementById("pset-drawer-list");
    if (!list) return;
    const parts = [];
    for (let i = 0; i < problems.length; i++) {
      const isCurrent = i === currentIndex;
      const marked = bookmarks.has(i);
      const done = completedProblems.has(i);
      const subClass = subsectionClass(problems[i].subsection);
      const subLabel = subsectionLabel(problems[i].subsection);
      const pill = subLabel && subClass
        ? `<span class="drawer-pill ${subClass}">${subLabel}</span>`
        : "";
      parts.push(
        `<li class="${isCurrent ? "current" : ""} ${subClass}" data-idx="${i}">` +
        `<button type="button">` +
        `<span class="drawer-num">${i + 1}</span>` +
        pill +
        `<span class="drawer-done">${done ? "✓" : ""}</span>` +
        `<span class="drawer-bm">${marked ? "★" : ""}</span>` +
        `</button></li>`);
    }
    parts.push(`<li class="${currentIndex === problems.length ? "current" : ""}" data-idx="${problems.length}">`
      + `<button type="button"><span class="drawer-num">✓</span><span>Finish</span></button></li>`);
    list.innerHTML = parts.join("");
    list.querySelectorAll("li").forEach(li => {
      li.addEventListener("click", () => {
        const idx = parseInt(li.dataset.idx, 10);
        currentIndex = Math.max(0, Math.min(problems.length, idx));
        closeDrawer();
        render();
      });
    });
  }

  function openDrawer()  { document.getElementById("pset-drawer").classList.add("open"); }
  function closeDrawer() { document.getElementById("pset-drawer").classList.remove("open"); }
  function wireDrawer() {
    document.getElementById("jump-toggle").addEventListener("click", () => {
      const open = document.getElementById("pset-drawer").classList.contains("open");
      open ? closeDrawer() : openDrawer();
    });
    document.getElementById("jump-close").addEventListener("click", closeDrawer);
  }

  function renderProblem(p, idx) {
    const subClass = subsectionClass(p.subsection);
    const subLabel = subsectionLabel(p.subsection);
    const subsec = subLabel
      ? `<span class="pset-subsection ${subClass}">${escapeHtml(subLabel)}</span>`
      : "";
    const probHtml = renderRichText(p.problem || "", lessonImagesBaseUrl(), p.problem_images || []);
    const solHtml  = renderRichText(p.solution || "", lessonImagesBaseUrl(), p.solution_images || []);

    stage().innerHTML = `
      ${subsec}
      <div class="pset-problem">
        <span class="pset-q-num">${idx + 1}.</span>${probHtml}
      </div>
      <div class="pset-reveal-row">
        <button type="button" class="pset-reveal-btn" id="reveal-btn">Reveal Solution</button>
      </div>
      <div class="pset-solution" id="solution" style="display:none;">
        <h4>Solution</h4>
        <div>${solHtml}</div>
      </div>
    `;

    document.getElementById("reveal-btn").addEventListener("click", () => {
      const sol = document.getElementById("solution");
      const btn = document.getElementById("reveal-btn");
      const show = sol.style.display === "none";
      sol.style.display = show ? "block" : "none";
      btn.textContent = show ? "Hide Solution" : "Reveal Solution";
      if (show && window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([sol]).catch(() => {});
      }
    });
  }

  function renderFinalSlide() {
    const bmList = [...bookmarks].sort((a, b) => a - b);
    const bmHtml = bmList.length
      ? `<div class="bookmark-list"><h4>Bookmarked questions</h4>${
          bmList.map(i =>
            `<a href="#" data-jump="${i}">Problem ${i + 1}</a>`
          ).join("")
        }</div>`
      : "";

    stage().innerHTML = `
      <div class="pset-final">
        <h2>End of ${escapeHtml(lessonTitle)}</h2>
        <p>You've reached the end of the problem set (${problems.length} problems).</p>
        ${bmHtml}
        <button type="button" id="mark-done-btn"
          class="pset-mark-done ${isCompleted ? 'done' : ''}">
          ${isCompleted ? "✓ Marked Complete" : "Mark this Problem Set as Done"}
        </button>
        <p style="margin-top:1rem;"><a href="/courses/${courseId}/">← Back to course</a></p>
      </div>`;

    document.getElementById("mark-done-btn").addEventListener("click", async () => {
      const btn = document.getElementById("mark-done-btn");
      btn.disabled = true;
      isCompleted = !isCompleted;
      btn.textContent = isCompleted ? "✓ Marked Complete" : "Mark this Problem Set as Done";
      btn.classList.toggle("done", isCompleted);
      await save();
      btn.disabled = false;
    });

    stage().querySelectorAll("[data-jump]").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        currentIndex = parseInt(a.dataset.jump, 10);
        render();
      });
    });
  }

  // ---- Rich text / LaTeX preprocessing ------------------------------------

  function renderRichText(raw, imgBase, imageList) {
    let s = escapeHtmlPreservingMath(raw || "");

    // Build a basename → URL lookup from the image list.
    const byName = {};
    for (const ref of imageList || []) {
      const fname = ref.split("/").pop();           // "trains.png"
      const base  = fname.replace(/\.[a-z0-9]+$/i, ""); // "trains"
      byName[base] = `${imgBase}/${fname}`;
      byName[fname] = `${imgBase}/${fname}`;
    }
    const usedImages = new Set();

    // Replace \includegraphics[...]{name} with an <img>. Tracks which images
    // were rendered inline so we don't also append them later.
    s = s.replace(/\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g, (m, name) => {
      const key = name.trim();
      const url = byName[key]
        || byName[key.replace(/\.[a-z0-9]+$/i, "")]
        || `${imgBase}/${key}.png`;
      usedImages.add(key);
      usedImages.add(key.replace(/\.[a-z0-9]+$/i, ""));
      return `<img src="${url}" alt="">`;
    });

    // Convert \begin{center}...\end{center} (text-mode LaTeX) to a centered div.
    s = s.replace(/\\begin\{center\}([\s\S]*?)\\end\{center\}/g,
      (m, body) => `<div style="text-align:center">${body}</div>`);

    // Process INNER lists first (enumerate/itemize), THEN the outer anum.
    // Otherwise nested \item from inner lists gets eaten by anum's split.
    s = s.replace(/\\begin\{enumerate\}(?:\s*\[([^\]]*)\])?([\s\S]*?)\\end\{enumerate\}/g,
      (m, opts, body) => {
        let type = "1";
        if (opts) {
          if (/\\Roman/.test(opts)) type = "I";
          else if (/\\roman/.test(opts)) type = "i";
          else if (/\\Alph/.test(opts))  type = "A";
          else if (/\\alph/.test(opts))  type = "a";
        }
        const items = body.split(/\\item\s+/)
          .map(x => x.trim()).filter(Boolean)
          .map(x => `<li>${x}</li>`).join("");
        return `<ol type="${type}">${items}</ol>`;
      });
    s = s.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (m, body) => {
      const items = body.split(/\\item\s+/)
        .map(x => x.trim()).filter(Boolean)
        .map(x => `<li>${x}</li>`).join("");
      return `<ul>${items}</ul>`;
    });

    // Now the outer \begin{anum}…\end{anum} can safely split on \item — the
    // nested enumerate's items have already been turned into <li>.
    s = s.replace(/\\begin\{anum\}([\s\S]*?)\\end\{anum\}/g, (m, body) => {
      const items = body.split(/\\item\s+/)
        .map(x => x.trim()).filter(Boolean)
        .map(x => `<li>${x}</li>`).join("");
      return `<ol type="a" class="anum">${items}</ol>`;
    });

    // Convert plain newlines into paragraph breaks for readability,
    // but only outside math (we used a sentinel below).
    s = s.replace(/\n\s*\n/g, "</p><p>");
    s = `<p>${s}</p>`;

    // Append any images that weren't already rendered inline by \includegraphics.
    if (imageList && imageList.length) {
      for (const imgRef of imageList) {
        const fname = imgRef.split("/").pop();
        const base  = fname.replace(/\.[a-z0-9]+$/i, "");
        if (usedImages.has(base) || usedImages.has(fname)) continue;
        s += `<img src="${imgBase}/${fname}" alt="">`;
      }
    }

    return s;
  }

  // Escape HTML special chars OUTSIDE of math regions and existing HTML tags.
  // The JSONs already contain HTML (e.g. <em>, <strong>, <a href=…>) from the
  // cleanup pass, so we need to preserve those through escaping.
  function escapeHtmlPreservingMath(s) {
    const tokens = [];
    const re = /\$\$[\s\S]*?\$\$|\$[^$]*\$|<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^<>]*)?>|&(?:[a-zA-Z]+|#\d+);/g;
    let last = 0; let m;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) {
        tokens.push({ keep: false, text: s.slice(last, m.index) });
      }
      tokens.push({ keep: true, text: m[0] });
      last = m.index + m[0].length;
    }
    if (last < s.length) tokens.push({ keep: false, text: s.slice(last) });

    return tokens.map(t => {
      if (t.keep) {
        // Math tokens start with `$`; escape their angle brackets so the browser
        // doesn't parse e.g. "$r<R$" as an HTML tag and swallow the rest. MathJax
        // reads decoded textContent, so it still sees the real <, >. Real HTML
        // tags/entities (also "kept") are left untouched.
        return t.text[0] === "$"
          ? t.text.replaceAll("<", "&lt;").replaceAll(">", "&gt;")
          : t.text;
      }
      return t.text
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\\%", "%");   // LaTeX escaped percent in text mode
    }).join("");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function lessonImagesBaseUrl() {
    return `/assets/psets/${courseId}/${lessonId}`;
  }

  // ---- Nav + persistence --------------------------------------------------

  function wireNav() {
    document.getElementById("prev-btn").addEventListener("click", () => {
      if (currentIndex > 0) { currentIndex--; render(); }
    });
    document.getElementById("next-btn").addEventListener("click", () => {
      if (currentIndex < problems.length) { currentIndex++; render(); }
    });
    document.getElementById("bookmark-btn").addEventListener("click", () => {
      if (bookmarks.has(currentIndex)) bookmarks.delete(currentIndex);
      else bookmarks.add(currentIndex);
      render();
    });
    document.getElementById("complete-btn").addEventListener("click", () => {
      if (completedProblems.has(currentIndex)) completedProblems.delete(currentIndex);
      else completedProblems.add(currentIndex);
      render();
    });
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft")  { document.getElementById("prev-btn").click(); }
      if (e.key === "ArrowRight") { document.getElementById("next-btn").click(); }
    });
  }

  let saveTimer = null;
  function saveStateDebounced() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  }

  async function save() {
    await window.cambphysAuth.saveProgress(lessonId, {
      completed: isCompleted,
      data: {
        bookmarks: [...bookmarks],
        completed_problems: [...completedProblems],
        current_slide: currentIndex,
        total_problems: problems.length,
      },
    });
  }

  window.cambphysPset = { init };
})();
