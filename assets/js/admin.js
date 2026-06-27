// Admin page logic: list upgrade requests, approve/reject with one click.
// Real authorization is in db/03_admin_policies.sql — this file is just UI.
(function () {
  const sb = window.cambphysSupabase;

  // Custom modal dialogs (replace native confirm/alert so the "website says"
  // prefix doesn't appear). Self-contained with inline styles — no external CSS.
  function buildModal(title, detail, buttons) {
    const back = document.createElement("div");
    back.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);" +
      "display:flex;align-items:center;justify-content:center;z-index:2000;padding:1rem;";
    const box = document.createElement("div");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.style.cssText = "background:#fff;border-radius:8px;padding:1.5rem 1.75rem 1.25rem;" +
      "max-width:440px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,0.2);";
    const h = document.createElement("h3");
    h.style.cssText = "margin:0 0 .5rem;font-size:1.15rem;";
    h.textContent = title;
    box.appendChild(h);
    if (detail) {
      const p = document.createElement("p");
      p.style.cssText = "margin:0 0 1.25rem;color:#555;font-size:.95rem;line-height:1.5;";
      p.textContent = detail;
      box.appendChild(p);
    }
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:.5rem;justify-content:flex-end;";
    box.appendChild(actions);
    back.appendChild(box);
    return { back, actions };
  }

  function mkBtn(label, kind) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    const bg = kind === "danger" ? "#b00020" : kind === "primary" ? "#2f5d8c" : "#e5e7eb";
    const fg = kind === "neutral" ? "#333" : "#fff";
    b.style.cssText = "padding:.5rem 1rem;border:0;border-radius:4px;font-size:.95rem;" +
      `cursor:pointer;background:${bg};color:${fg};`;
    return b;
  }

  function customConfirm(title, detail, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      document.querySelectorAll(".admin-modal-backdrop").forEach(n => n.remove());
      const { back, actions } = buildModal(title, detail);
      back.className = "admin-modal-backdrop";
      const cancel = mkBtn("Cancel", "neutral");
      const ok = mkBtn(opts.okLabel || "OK", opts.danger ? "danger" : "primary");
      actions.appendChild(cancel);
      actions.appendChild(ok);
      const close = (v) => { back.remove(); resolve(v); };
      ok.addEventListener("click", () => close(true));
      cancel.addEventListener("click", () => close(false));
      back.addEventListener("click", (e) => { if (e.target === back) close(false); });
      document.body.appendChild(back);
    });
  }

  function customAlert(title, detail) {
    return new Promise(resolve => {
      document.querySelectorAll(".admin-modal-backdrop").forEach(n => n.remove());
      const { back, actions } = buildModal(title, detail);
      back.className = "admin-modal-backdrop";
      const ok = mkBtn("OK", "primary");
      actions.appendChild(ok);
      const close = () => { back.remove(); resolve(); };
      ok.addEventListener("click", close);
      back.addEventListener("click", (e) => { if (e.target === back) close(); });
      document.body.appendChild(back);
    });
  }

  async function fetchRequests(statusFilter) {
    let q = sb.from("upgrade_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (statusFilter && statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return data || [];
  }

  async function signedProofUrl(path) {
    if (!path) return null;
    const { data, error } = await sb.storage
      .from("payment-proofs")
      .createSignedUrl(path, 3600);
    if (error) { console.error(error); return null; }
    return data.signedUrl;
  }

  async function approve(row) {
    const { error: e1 } = await sb.from("enrollments").upsert(
      { user_id: row.user_id, course_id: row.course_id, upgraded: true },
      { onConflict: "user_id,course_id" }
    );
    if (e1) return { error: e1 };
    const { error: e2 } = await sb.from("upgrade_requests")
      .update({ status: "approved" })
      .eq("id", row.id);
    return { error: e2 };
  }

  async function reject(row) {
    const { error } = await sb.from("upgrade_requests")
      .update({ status: "rejected" })
      .eq("id", row.id);
    return { error };
  }

  // Undo approve/reject: flip status back to pending. If the request had been
  // approved, also revoke the corresponding enrollment so the student loses
  // access (they'd otherwise stay upgraded after an undo).
  async function resetToPending(row) {
    if (row.status === "approved" && row.user_id) {
      const { error: e1 } = await sb.from("enrollments")
        .update({ upgraded: false })
        .eq("user_id", row.user_id)
        .eq("course_id", row.course_id);
      if (e1) return { error: e1 };
    }
    const { error } = await sb.from("upgrade_requests")
      .update({ status: "pending" })
      .eq("id", row.id);
    return { error };
  }

  // Permanently delete the request and its proof image.
  async function deleteRequest(row) {
    if (row.proof_image_path) {
      const { error: storErr } = await sb.storage
        .from("payment-proofs")
        .remove([row.proof_image_path]);
      if (storErr) console.warn("could not delete proof image:", storErr);
    }
    const { error } = await sb.from("upgrade_requests")
      .delete()
      .eq("id", row.id);
    return { error };
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  async function renderRequestCard(r) {
    const proofUrl = await signedProofUrl(r.proof_image_path);
    const referrals = (r.referral_sources || []).join(", ") || "(none)";
    const referralOther = r.referral_other ? ` — ${escapeHtml(r.referral_other)}` : "";
    const statusBadge =
      r.status === "approved" ? '<span class="badge ok">Approved</span>' :
      r.status === "rejected" ? '<span class="badge rej">Rejected</span>' :
      '<span class="badge pending">Pending</span>';

    const isPending = r.status === "pending";

    return `
      <div class="req-card" data-id="${r.id}">
        <div class="req-head">
          <div>
            <h3>${escapeHtml(r.student_first_name)} ${escapeHtml(r.student_last_name)}
              <span class="course-tag">${escapeHtml(r.course_id.toUpperCase())}</span>
            </h3>
            <div class="req-sub">Submitted ${fmtDate(r.created_at)} · Request #${r.id}</div>
          </div>
          <div>${statusBadge}</div>
        </div>

        <div class="req-grid">
          <div><b>Grade:</b> ${escapeHtml(r.student_grade)}</div>
          <div><b>State:</b> ${escapeHtml(r.state)}</div>
          <div><b>Student email:</b> ${escapeHtml(r.student_email)}</div>
          <div><b>Parent:</b> ${escapeHtml(r.parent_name)}</div>
          <div><b>Parent email:</b> <a href="mailto:${escapeHtml(r.parent_email)}">${escapeHtml(r.parent_email)}</a></div>
          <div><b>Heard from:</b> ${escapeHtml(referrals)}${referralOther}</div>
        </div>

        <div class="req-proof">
          ${proofUrl
            ? `<a href="${proofUrl}" target="_blank" rel="noopener">View payment screenshot ↗</a>`
            : '<span class="muted">(no proof image)</span>'}
        </div>

        <div class="req-actions">
          ${isPending ? `
            <button type="button" class="btn-approve" data-id="${r.id}">Approve & Upgrade</button>
            <button type="button" class="btn-reject"  data-id="${r.id}">Reject</button>
          ` : `
            <button type="button" class="btn-undo"    data-id="${r.id}">↶ Undo — back to Pending</button>
          `}
          <button type="button" class="btn-delete" data-id="${r.id}">Delete</button>
        </div>
      </div>
    `;
  }

  async function refresh() {
    const status = document.querySelector('input[name="filter"]:checked').value;
    const list = document.getElementById("req-list");
    list.innerHTML = '<p class="muted">Loading…</p>';
    const rows = await fetchRequests(status);
    if (!rows.length) {
      list.innerHTML = `<p class="muted">No ${status === "all" ? "" : status} requests.</p>`;
      return;
    }
    const cards = await Promise.all(rows.map(renderRequestCard));
    list.innerHTML = cards.join("");
    wireActions(rows);
  }

  function wireActions(rows) {
    const byId = Object.fromEntries(rows.map(r => [String(r.id), r]));
    document.querySelectorAll(".btn-approve").forEach(btn => {
      btn.addEventListener("click", async () => {
        const row = byId[btn.dataset.id];
        if (!await customConfirm("Approve request?", `Approve ${row.student_first_name} ${row.student_last_name} for ${row.course_id.toUpperCase()}?`, { okLabel: "Approve" })) return;
        btn.disabled = true; btn.textContent = "Approving...";
        const { error } = await approve(row);
        if (error) { await customAlert("Approve failed", error.message); btn.disabled = false; btn.textContent = "Approve & Upgrade"; return; }
        await refresh();
      });
    });
    document.querySelectorAll(".btn-reject").forEach(btn => {
      btn.addEventListener("click", async () => {
        const row = byId[btn.dataset.id];
        if (!await customConfirm("Reject request?", `Reject this request from ${row.student_first_name} ${row.student_last_name}?`, { okLabel: "Reject", danger: true })) return;
        btn.disabled = true; btn.textContent = "Rejecting...";
        const { error } = await reject(row);
        if (error) { await customAlert("Reject failed", error.message); btn.disabled = false; btn.textContent = "Reject"; return; }
        await refresh();
      });
    });
    document.querySelectorAll(".btn-undo").forEach(btn => {
      btn.addEventListener("click", async () => {
        const row = byId[btn.dataset.id];
        const wasApproved = row.status === "approved";
        const warning = wasApproved
          ? `Undo approval for ${row.student_first_name} ${row.student_last_name}? This will revoke their access to ${row.course_id.toUpperCase()}.`
          : `Undo rejection for ${row.student_first_name} ${row.student_last_name}? It will go back to Pending.`;
        if (!await customConfirm("Undo — back to Pending?", warning, { okLabel: "Undo" })) return;
        btn.disabled = true; btn.textContent = "Undoing...";
        const { error } = await resetToPending(row);
        if (error) { await customAlert("Undo failed", error.message); btn.disabled = false; btn.textContent = "↶ Undo — back to Pending"; return; }
        await refresh();
      });
    });
    document.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const row = byId[btn.dataset.id];
        if (!await customConfirm("Permanently delete request?", `Delete the request from ${row.student_first_name} ${row.student_last_name}? This removes the row AND the payment screenshot. Cannot be undone.`, { okLabel: "Delete", danger: true })) return;
        btn.disabled = true; btn.textContent = "Deleting...";
        const { error } = await deleteRequest(row);
        if (error) { await customAlert("Delete failed", error.message); btn.disabled = false; btn.textContent = "Delete"; return; }
        await refresh();
      });
    });
  }

  window.cambphysAdmin = { refresh };
})();
