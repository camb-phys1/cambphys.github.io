// Auth + progress helpers. Depends on window.cambphysSupabase from supabase-config.js.
(function () {
  const sb = window.cambphysSupabase;
  const ADMIN_EMAILS = ["cambphys@gmail.com"];

  async function signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    return { data, error };
  }

  async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return { data, error };
  }

  async function signOut() {
    return await sb.auth.signOut();
  }

  async function currentUser() {
    const { data } = await sb.auth.getUser();
    return data.user;
  }

  // Progress helpers — each user has one row per lesson_id.
  // `data` is a flexible JSONB column for whatever you want to track later
  // (e.g. { last_video_position: 312, quiz_attempts: 2, notes: "..." }).
  async function getProgress(lessonId) {
    const user = await currentUser();
    if (!user) return null;
    const { data, error } = await sb
      .from("progress")
      .select("*")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (error) console.error(error);
    return data;
  }

  async function getAllProgress() {
    const user = await currentUser();
    if (!user) return [];
    const { data, error } = await sb
      .from("progress")
      .select("*")
      .eq("user_id", user.id)
      .order("last_accessed", { ascending: false });
    if (error) console.error(error);
    return data || [];
  }

  async function saveProgress(lessonId, fields) {
    const user = await currentUser();
    if (!user) return { error: "not signed in" };
    const row = {
      user_id: user.id,
      lesson_id: lessonId,
      last_accessed: new Date().toISOString(),
      ...fields,
    };
    const { data, error } = await sb
      .from("progress")
      .upsert(row, { onConflict: "user_id,lesson_id" })
      .select()
      .maybeSingle();
    return { data, error };
  }

  // Returns true if the current user is an admin (UI-side hint only;
  // real authorization is enforced by RLS policies in the database).
  async function isAdmin() {
    const user = await currentUser();
    return !!(user && ADMIN_EMAILS.includes(user.email));
  }

  // Returns true if the current user has been upgraded for this course.
  async function isUpgraded(courseId) {
    const user = await currentUser();
    if (!user) return false;
    const { data, error } = await sb
      .from("enrollments")
      .select("upgraded")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();
    if (error) { console.error(error); return false; }
    return !!(data && data.upgraded);
  }

  // Redirects to /login/ if not signed in. Call at top of any gated page.
  async function requireAuth() {
    const user = await currentUser();
    if (!user) window.location.href = "/login/";
    return user;
  }

  window.cambphysAuth = {
    signUp,
    signIn,
    signOut,
    currentUser,
    getProgress,
    getAllProgress,
    saveProgress,
    isUpgraded,
    isAdmin,
    requireAuth,
  };
})();

// ---------------------------------------------------------------------------
// makeWideMathScrollable(root): a long *inline* equation ($…$) can't wrap, so
// it would spill out of the column and get clipped. Display math ($$…$$) and
// tables already scroll via CSS; this handles inline math by wrapping only the
// equations that actually overflow in a .math-scroll box, giving just that one
// its own horizontal scrollbar (on its own line) while the surrounding text
// stays put. Short inline math is left untouched (no baseline change).
// Call it after MathJax's typesetPromise resolves.
// ---------------------------------------------------------------------------
(function () {
  if (window.makeWideMathScrollable) return;

  function wrapWideMath(root) {
    if (!root || !root.querySelectorAll) return;
    const maths = root.querySelectorAll('mjx-container:not([display="true"])');
    maths.forEach((m) => {
      const parent = m.parentElement;
      if (!parent || parent.classList.contains("math-scroll")) return; // already wrapped
      const host = m.closest("li, p, .pset-solution, .pset-problem, .result-question, .exam-question, #notes-body");
      const avail = host ? host.clientWidth : (parent.clientWidth || 0);
      const width = m.getBoundingClientRect().width;
      if (avail && width > avail + 1) {
        const wrap = document.createElement("span");
        wrap.className = "math-scroll";
        parent.insertBefore(wrap, m);
        wrap.appendChild(m);
      }
    });
  }

  window.makeWideMathScrollable = wrapWideMath;

  // Re-check on resize/orientation change (debounced). Narrowing the window can
  // make a previously-fitting equation overflow; this catches those. (Already
  // wrapped equations stay wrapped — harmless, since .math-scroll only shows a
  // scrollbar when it still overflows.)
  let t;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => wrapWideMath(document.body), 200);
  });
})();
