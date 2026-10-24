(() => {
  const cfg = window.MANIT_FIND_CONFIG || {};
  const statusEl = document.getElementById("connectionStatus");
  const countEl = document.getElementById("reportCount");
  const grid = document.getElementById("reportsGrid");
  const boardMessage = document.getElementById("boardMessage");
  const form = document.getElementById("reportForm");
  const formMessage = document.getElementById("formMessage");
  const submitButton = document.getElementById("submitButton");
  const searchInput = document.getElementById("searchInput");
  const typeFilter = document.getElementById("typeFilter");
  const categoryFilter = document.getElementById("categoryFilter");
  const dialog = document.getElementById("detailDialog");
  const dialogContent = document.getElementById("dialogContent");
  const adminDialog = document.getElementById("adminDialog");
  const openAdminButton = document.getElementById("openAdminButton");
  const closeAdminDialog = document.getElementById("closeAdminDialog");
  const adminLoginForm = document.getElementById("adminLoginForm");
  const adminEmail = document.getElementById("adminEmail");
  const adminPassword = document.getElementById("adminPassword");
  const adminLoginButton = document.getElementById("adminLoginButton");
  const adminLogoutButton = document.getElementById("adminLogoutButton");
  const adminMessage = document.getElementById("adminMessage");
  let currentUser = null;
  let isAdmin = false;
  let reports = [];
  let client = null;

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const dateText = value => {
    if (!value) return "Date not provided";
    const d = new Date(value + (String(value).length === 10 ? "T12:00:00" : ""));
    return Number.isNaN(d.getTime()) ? "Date not provided" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  };
  const setStatus = (text, good = false) => {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-good", good);
  };

  function renderReports() {
    const query = searchInput.value.trim().toLowerCase();
    const type = typeFilter.value;
    const category = categoryFilter.value;
    const visible = reports.filter(r => {
      const matchesQuery = [r.title, r.location, r.description, r.category].join(" ").toLowerCase().includes(query);
      return matchesQuery && (type === "all" || r.type === type) && (category === "all" || r.category === category);
    });
    countEl.textContent = String(reports.length);
    grid.innerHTML = "";
    if (!visible.length) {
      boardMessage.hidden = false;
      boardMessage.textContent = reports.length ? "No reports match those filters. Try another search." : "No reports yet. Be the first to add one.";
      return;
    }
    boardMessage.hidden = true;
    visible.forEach(r => {
      const card = document.createElement("article");
      card.className = "report-card";
      card.innerHTML = `
        <div class="card-top"><span class="type-pill ${r.type === "found" ? "found" : "lost"}">${r.type === "found" ? "FOUND ITEM" : "LOST ITEM"}</span><span class="card-date">${escapeHtml(dateText(r.event_date || r.created_at))}</span></div>
        <div class="card-category">${escapeHtml(r.category || "Other")}</div>
        <h3>${escapeHtml(r.title)}</h3>
        <p class="card-location">⌖ ${escapeHtml(r.location)}</p>
        <p class="card-description">${escapeHtml(r.description)}</p>
        <button class="card-link" type="button">View details <span>↗</span></button>`;
      card.querySelector("button").addEventListener("click", () => showDetails(r));
      grid.appendChild(card);
    });
  }

  
async function showDetails(r) {
  dialogContent.innerHTML = `
    <div class="eyebrow">${r.type === "found" ? "FOUND ITEM" : "LOST ITEM"} · ${escapeHtml(r.category || "Other")}</div>
    <h2>${escapeHtml(r.title)}</h2>
    <p class="detail-location">⌖ ${escapeHtml(r.location)}</p>
    <p>${escapeHtml(r.description)}</p>
    <div class="detail-meta"><span>Reported</span><strong>${escapeHtml(dateText(r.created_at))}</strong></div>
    ${r.event_date ? `<div class="detail-meta"><span>Event date</span><strong>${escapeHtml(dateText(r.event_date))}</strong></div>` : ""}
    <div id="finder-contact"></div>
    <div class="privacy-note"><strong>Next step</strong><span>Use your campus's approved process or ask campus administration for help arranging a safe handover. Do not post private contact details publicly.</span></div>
    ${isAdmin ? '<button class="button button-gold resolve-button" id="resolveReportButton" type="button">Mark as Resolved</button>' : ""}`;

  dialog.showModal();

  const resolveButton = dialogContent.querySelector("#resolveReportButton");
  if (resolveButton) {
    resolveButton.addEventListener("click", async () => {
      if (!currentUser || !isAdmin) {
        alert("Please sign in with an authorized admin account first.");
        return;
      }
      if (!confirm("Mark this report as resolved? It will disappear from the active public board.")) return;
      resolveButton.disabled = true;
      resolveButton.textContent = "Updating…";
      const { data: resolved, error } = await client.rpc("admin_resolve_report", { p_report_id: r.id });
      if (error || resolved !== true) {
        resolveButton.disabled = false;
        resolveButton.textContent = "Mark as Resolved";
        alert("Could not resolve report: " + (error?.message || "The report was not changed. Check that you ran admin-resolve-function.sql."));
        return;
      }
      dialog.close();
      await loadReports();
    });
  }

  if (r.type !== "found" || !client) return;

  const contactBox = dialogContent.querySelector("#finder-contact");
  contactBox.textContent = "Loading finder contact…";

  const { data, error } = await client.rpc("get_found_item_email", {
    p_report_id: r.id
  });

  if (error || !data) {
    contactBox.textContent = "Finder contact is currently unavailable.";
    return;
  }

  const email = String(data).trim();

  const emailRow = document.createElement("div");
  emailRow.className = "detail-meta";

  const label = document.createElement("span");
  label.textContent = "Finder's email";

  const link = document.createElement("a");
  link.href = "mailto:" + email;
  link.textContent = email;

  emailRow.append(label, link);
  contactBox.replaceChildren(emailRow);
}


  async function refreshAdminState() {
    currentUser = null;
    isAdmin = false;
    if (!client) return;
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user || null;
    if (user) {
      const { data, error } = await client.from("site_admins").select("user_id").eq("user_id", user.id).maybeSingle();
      if (!error && data) {
        currentUser = user;
        isAdmin = true;
        adminMessage.textContent = "Signed in as an authorized administrator.";
        adminMessage.className = "form-message success";
        adminLoginButton.hidden = true;
        adminLogoutButton.hidden = false;
        adminEmail.disabled = true;
        adminPassword.hidden = true;
      } else {
        adminMessage.textContent = error ? "Signed in, but admin access could not be verified. Check the site_admins SELECT policy." : "This account is not listed as an administrator.";
        adminMessage.className = "form-message error";
      }
    } else {
      adminLoginButton.hidden = false;
      adminLogoutButton.hidden = true;
      adminEmail.disabled = false;
      adminPassword.hidden = false;
      adminMessage.textContent = "";
    }
    if (openAdminButton) openAdminButton.textContent = isAdmin ? "Admin signed in" : "Admin sign in";
  }

  adminLoginForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!client) {
      adminMessage.textContent = "Supabase is not configured.";
      adminMessage.className = "form-message error";
      return;
    }
    adminLoginButton.disabled = true;
    adminMessage.textContent = "Signing in…";
    const { error } = await client.auth.signInWithPassword({
      email: adminEmail.value.trim(),
      password: adminPassword.value
    });
    adminLoginButton.disabled = false;
    if (error) {
      adminMessage.textContent = "Sign-in failed: " + error.message;
      adminMessage.className = "form-message error";
      return;
    }
    await refreshAdminState();
    if (isAdmin) {
      adminPassword.value = "";
      adminDialog.close();
      await loadReports();
    }
  });

  adminLogoutButton.addEventListener("click", async () => {
    if (client) await client.auth.signOut();
    await refreshAdminState();
    await loadReports();
  });

  openAdminButton.addEventListener("click", async () => {
    await refreshAdminState();
    adminDialog.showModal();
  });
  closeAdminDialog.addEventListener("click", () => adminDialog.close());
  adminDialog.addEventListener("click", e => { if (e.target === adminDialog) adminDialog.close(); });

  async function loadReports() {
    if (!client) return;
    boardMessage.hidden = false;
    boardMessage.textContent = "Loading shared reports…";
    const { data, error } = await client.from("reports")
      .select("id,type,category,title,location,description,event_date,created_at")
      .eq("is_resolved", false)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      setStatus("Connection needs attention");
      boardMessage.textContent = "Couldn't load reports. Check that the SQL setup completed and your Supabase URL/key are correct. Details: " + error.message;
      return;
    }
    reports = data || [];
    setStatus("Live shared board", true);
    renderReports();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!client) {
      formMessage.textContent = "Add your Supabase Project URL and publishable key in config.js first.";
      formMessage.className = "form-message error";
      return;
    }
    const values = new FormData(form);
    const title = String(values.get("title") || "").trim();
    const location = String(values.get("location") || "").trim();
    const description = String(values.get("description") || "").trim();
    const contactEmail = String(values.get("contact_email") || "").trim();
    if (!title || !location || !description || !contactEmail) {
      formMessage.textContent = "Please complete all required fields, including your contact email.";
      formMessage.className = "form-message error";
      return;
    }
    const emailInput = form.elements.namedItem("contact_email");

if (!emailInput.checkValidity()) {
  formMessage.textContent = "Please enter a valid email address.";
  formMessage.className = "form-message error";
  emailInput.focus();
  return;
}

    submitButton.disabled = true;
    submitButton.textContent = "Publishing…";
    formMessage.textContent = "";
    const payload = {
      type: values.get("type"),
      status: values.get("type"),
      category: values.get("category"),
      title,
      location,
      description,
      event_date: values.get("event_date") || null
    };

    try {
      const { data: report, error: reportError } = await client
        .from("reports")
        .insert(payload)
        .select("id")
        .single();

      if (reportError) throw new Error("Report wasn't saved: " + reportError.message);

      const { error: contactError } = await client.from("report_contacts").insert({
        report_id: report.id,
        contact_email: contactEmail
      });

      submitButton.disabled = false;
      submitButton.innerHTML = 'Publish report <span>↗</span>';

      if (contactError) {
        formMessage.textContent = "Your report was published, but its contact email could not be saved. Please contact the site administrator before submitting it again. Details: " + contactError.message;
        formMessage.className = "form-message error";
        await loadReports();
        return;
      }

      form.reset();
      formMessage.textContent = "Report published. Your contact email is stored privately; email messaging still needs to be configured.";
      formMessage.className = "form-message success";
      await loadReports();
      document.getElementById("board").scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Publish report <span>↗</span>';
      formMessage.textContent = error.message || "Something went wrong while publishing the report.";
      formMessage.className = "form-message error";
    }
  });

  [searchInput, typeFilter, categoryFilter].forEach(el => el.addEventListener("input", renderReports));
  document.getElementById("refreshButton").addEventListener("click", loadReports);
  document.getElementById("closeDialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });

  const ready = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY &&
    !cfg.SUPABASE_URL.includes("PASTE_") && !cfg.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_") &&
    window.supabase && window.supabase.createClient;
  if (!ready) {
    setStatus("Setup required");
    boardMessage.textContent = "Your website is ready, but it still needs your Supabase Project URL and publishable key in config.js.";
  } else {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY);
    refreshAdminState().then(loadReports);
  }
})();
