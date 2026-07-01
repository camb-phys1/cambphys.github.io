// Course catalog + accordion renderer with gating.
// Depends on window.cambphysAuth (auth.js) and window.cambphysSupabase (supabase-config.js).
(function () {
  const COURSES = {
    ap:     { title: "AP Course Series",     short: "AP" },
    fma:    { title: "F=ma Course Series",   short: "F=ma" },
    usapho: { title: "USAPhO Course Series", short: "USAPhO" },
  };

  // Per-course lesson titles. Each entry's index (1-based) is the lesson number.
  // `has_pset: true` means a JSON problem set exists at /assets/psets/<course>/<id>.json.
  const LESSON_TITLES = {
    ap: [
      "1D Kinematics",
      "2D Kinematics",
      "Newton's Laws",
      "Applications of Newton's Laws",
      "Circular Motion",
      "Gravitation",
      "Work and Kinetic Energy",
      "Conservation of Energy",
      "Impulse and Momentum",
      "Collisions",
      "Simple Harmonic Motion",
      "Rotational Kinematics",
      "Rotational Dynamics",
      "Angular Momentum",
      "Fluids",
      "Review",
    ],
    fma: [
      "Problem Solving",
      "Kinematics 1",
      "Kinematics 2",
      "Forces 1",
      "Forces 2",
      "Energy",
      "Momentum",
      "Rotation 1",
      "Rotation 2",
      "Complex Systems",
      "Statics",
      "Fluids",
      "Gravitation",
      "Fictitious Forces",
      "Oscillations",
      "Review",
    ],
    usapho: [
      "Electrostatics",
      "Conductors",
      "DC Circuits",
      "Magnetic Fields",
      "Induction",
      "AC Circuits",
      "EM Waves",
      "Thermodynamics 1",
      "Thermodynamics 2",
      "Thermodynamics 3",
      "Relativistic Kinematics",
      "Relativistic Dynamics",
      "Waves 1",
      "Waves 2",
      "Modern Physics",
      "Review",
    ],
  };

  // Lessons with a JSON pset available. Keyed by lesson id.
  const HAS_PSET = new Set([
    "ap-01","ap-02","ap-03","ap-04","ap-05","ap-06","ap-07","ap-08",
    "ap-09","ap-10","ap-11","ap-12","ap-13","ap-14","ap-15",
    "fma-01","fma-02","fma-03","fma-04","fma-05","fma-06","fma-07","fma-08",
    "fma-09","fma-10","fma-11","fma-12","fma-13","fma-14","fma-15",
    "usapho-01","usapho-02","usapho-03","usapho-04","usapho-05","usapho-06",
    "usapho-07","usapho-08","usapho-09","usapho-10","usapho-11","usapho-12",
    "usapho-13","usapho-14","usapho-15",
  ]);
  // Lessons with lecture notes available (same set as HAS_PSET for now).
  const HAS_NOTES = new Set(HAS_PSET);
  // Lessons that have a video manifest at /assets/psets/<course>/<id>-video.json
  const HAS_VIDEO = new Set([
    "ap-01","ap-02","ap-03","ap-04","ap-05","ap-06","ap-07","ap-08",
    "ap-09","ap-10","ap-11","ap-12","ap-13","ap-14","ap-15","ap-16",
    "fma-01","fma-02","fma-03","fma-04","fma-05","fma-06","fma-07","fma-08",
    "fma-09","fma-10","fma-11","fma-12","fma-13","fma-14","fma-15","fma-16",
    "usapho-01","usapho-02","usapho-03","usapho-04","usapho-05","usapho-06",
    "usapho-07","usapho-08","usapho-09","usapho-10","usapho-11","usapho-12",
    "usapho-13","usapho-14","usapho-15","usapho-16",
  ]);
  // Lessons that have a JSON slideshow file alongside them.
  const HAS_SLIDES = new Set([
    "ap-01","ap-02","ap-03","ap-04","ap-05","ap-06","ap-07","ap-08",
    "ap-09","ap-10","ap-11","ap-12","ap-13","ap-14","ap-15","ap-16",
    "fma-01","fma-02","fma-03","fma-04","fma-05","fma-06","fma-07","fma-08",
    "fma-09","fma-10","fma-11","fma-12","fma-13","fma-14","fma-15","fma-16",
    "usapho-01","usapho-02","usapho-03","usapho-04","usapho-05","usapho-06",
    "usapho-07","usapho-08","usapho-09","usapho-10","usapho-11","usapho-12",
    "usapho-13","usapho-14","usapho-15",
  ]);

  function buildLessons(courseId) {
    const titles = LESSON_TITLES[courseId];
    const lessons = [];
    for (let i = 1; i <= 16; i++) {
      const n = String(i).padStart(2, "0");
      const id = `${courseId}-${n}`;
      lessons.push({
        id,
        number: i,
        title: titles ? (titles[i - 1] || `Lesson ${i}`) : `Lesson ${i}`,
        video:     HAS_VIDEO.has(id) ? `/video/?lesson=${id}` : "#",
        hasVideo:  HAS_VIDEO.has(id),
        slideshow: "#",
        notes:     "#",
        psetUrl:   HAS_PSET.has(id) ? `/pset/?lesson=${id}` : "#",
        hasPset:   HAS_PSET.has(id),
        notesUrl:  HAS_NOTES.has(id) ? `/notes/?lesson=${id}` : "#",
        hasNotes:  HAS_NOTES.has(id),
        slidesUrl: HAS_SLIDES.has(id) ? `/slides/?lesson=${id}` : "#",
        hasSlides: HAS_SLIDES.has(id),
        mockUrl:   courseId === "usapho" && HAS_PSET.has(id) ? `/usapho-mock/?lesson=${id}` : "#",
        hasMock:   courseId === "usapho" && HAS_PSET.has(id),
      });
    }
    return lessons;
  }

  window.cambphysCourses = { COURSES, LESSON_TITLES, buildLessons, renderCourse };

  // ---- Rendering -----------------------------------------------------------

  async function renderCourse(courseId, mountEl) {
    const course = COURSES[courseId];
    if (!course) { mountEl.textContent = "Unknown course."; return; }

    const user = await window.cambphysAuth.requireAuth();
    if (!user) return;

    const upgraded = await window.cambphysAuth.isUpgraded(courseId);
    const lessons = buildLessons(courseId);

    // Pull all progress rows once and index by lesson_id for fast lookup.
    const allProgress = await window.cambphysAuth.getAllProgress();
    const progressById = Object.fromEntries(allProgress.map(r => [r.lesson_id, r]));

    const header = document.createElement("div");
    header.className = "course-header";
    header.innerHTML = `
      <h1>${course.title}</h1>
      <p class="course-status">
        ${upgraded
          ? '<span class="badge ok">Full access</span>'
          : '<span class="badge locked">Free preview — Lesson 1 only</span>'}
      </p>`;
    mountEl.appendChild(header);

    const list = document.createElement("div");
    list.className = "lesson-list";

    // Extra non-lesson "course-level" items appended after the lessons.
    // Right now this is just the F=ma practice exam.
    const extras = [];
    if (courseId === "fma") {
      extras.push({
        id: "fma-practice-exam",
        title: "Practice F=ma Exam",
        url: "/practice-exam/?exam=fma",
        icon: "/pictures/fmaicon.png",
        kind: "exam",
      });
    }
    if (courseId === "ap") {
      extras.push({
        id: "ap-practice-mc",
        title: "Practice AP1 Exam — Multiple Choice",
        url: "/practice-exam/?exam=ap-mc",
        icon: "/pictures/apicon.png",
        kind: "exam",
      });
      extras.push({
        id: "ap-practice-frq",
        title: "Practice AP1 Exam — Free Response",
        url: "/practice-exam/?exam=ap-frq",
        icon: "/pictures/apicon.png",
        kind: "exam",
      });
    }
    if (courseId === "usapho") {
      extras.push({
        id: "usapho-practice-a",
        title: "Mock USAPhO Exam — Part A",
        url: "/practice-exam/?exam=usapho-a",
        icon: "/pictures/usaphoicon.png",
        kind: "exam",
      });
      extras.push({
        id: "usapho-practice-b",
        title: "Mock USAPhO Exam — Part B",
        url: "/practice-exam/?exam=usapho-b",
        icon: "/pictures/usaphoicon.png",
        kind: "exam",
      });
    }

    for (const lesson of lessons) {
      const locked = !upgraded && lesson.number > 1;
      const prog = progressById[lesson.id];
      const completed = !!(prog && prog.completed);

      const det = document.createElement("details");
      det.className = "lesson" + (locked ? " locked" : "") + (completed ? " completed" : "");
      det.innerHTML = `
        <summary>
          <span class="lesson-num">${String(lesson.number).padStart(2, "0")}</span>
          <span class="lesson-title">${lesson.title}</span>
          ${completed ? '<span class="done-icon" title="Problem set complete">✓</span>' : ""}
          ${locked ? '<span class="lock-icon" aria-label="locked"><img src="/pictures/Lock icon.JPG" alt="locked"></span>' : ""}
        </summary>
        <div class="lesson-body">
          <div class="lesson-readings" data-lesson="${lesson.id}"></div>
          <div class="lesson-resources">
            <a href="${lesson.video}"     class="resource ${lesson.hasVideo ? '' : 'disabled'}">▶ Video</a>
            <a href="${lesson.slidesUrl}" class="resource ${lesson.hasSlides ? '' : 'disabled'}">▥ Slideshow</a>
            <a href="${lesson.notesUrl}"  class="resource ${lesson.hasNotes ? '' : 'disabled'}">≡ Notes</a>
            <a href="${lesson.psetUrl}"   class="resource ${lesson.hasPset  ? '' : 'disabled'}">✎ Problem Set</a>
            ${courseId === "usapho" ? `<a href="${lesson.mockUrl}" class="resource ${lesson.hasMock ? '' : 'disabled'}">⏱ Mock</a>` : ""}
          </div>
        </div>`;

      if (locked) {
        const summary = det.querySelector("summary");
        summary.addEventListener("click", (e) => {
          e.preventDefault();
          showUpgradeModal(course.title, courseId);
        });
      }
      list.appendChild(det);
    }
    // Append any course-level extras as a row matching the lesson rows.
    for (const ex of extras) {
      const locked = !upgraded; // gate extras on full upgrade
      const tile = document.createElement("a");
      tile.href = locked ? "#" : ex.url;
      tile.className = "lesson lesson-extra" + (locked ? " locked" : "");
      tile.innerHTML = `
        <img class="lesson-extra-icon" src="${ex.icon || '/pictures/fmaicon.png'}" alt="">
        <span class="lesson-title">${ex.title}</span>
        ${locked ? '<span class="lock-icon" aria-label="locked"><img src="/pictures/Lock icon.JPG" alt="locked"></span>' : ""}`;
      if (locked) {
        tile.addEventListener("click", (e) => {
          e.preventDefault();
          showUpgradeModal(course.title, courseId);
        });
      }
      list.appendChild(tile);
    }

    mountEl.appendChild(list);

    // After the list is in the DOM, lazy-fetch readings for each unlocked lesson.
    loadReadings(courseId, lessons, upgraded);
  }

  async function loadReadings(courseId, lessons, upgraded) {
    for (const lesson of lessons) {
      if (!upgraded && lesson.number > 1) continue;
      const el = document.querySelector(`.lesson-readings[data-lesson="${lesson.id}"]`);
      if (!el) continue;
      try {
        const r = await fetch(`/assets/psets/${courseId}/${lesson.id}-readings.json`);
        if (!r.ok) continue;
        const data = await r.json();
        if (data.items && data.items.length) {
          el.innerHTML = '<span class="readings-label">Readings:</span> '
            + data.items.map(escapeHtml).join("; ");
        }
      } catch (e) { /* ignore — readings are optional */ }
    }
  }

  function escapeHtml(s) {
    return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  }

  function showUpgradeModal(courseTitle, courseId) {
    document.querySelectorAll(".cp-modal-backdrop").forEach(n => n.remove());

    const backdrop = document.createElement("div");
    backdrop.className = "cp-modal-backdrop";
    backdrop.innerHTML = `
      <div class="cp-modal" role="dialog" aria-modal="true">
        <h2>Upgrade required</h2>
        <p>This lesson is part of the full <strong>${courseTitle}</strong>.
           You currently have free preview access (Lesson 1 only).</p>
        <p>Unlock all 16 lessons (video, slideshow, notes, and problem set) for the full course.</p>
        <div class="cp-modal-actions">
          <button type="button" class="cp-modal-close cp-btn-secondary">Close</button>
          <a class="cp-btn-primary" href="/upgrade/?course=${encodeURIComponent(courseId)}">Upgrade Now</a>
        </div>
      </div>`;
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop || e.target.classList.contains("cp-modal-close")) {
        backdrop.remove();
      }
    });
    document.body.appendChild(backdrop);
  }
})();
