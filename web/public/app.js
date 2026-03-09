// ===== Study Platform Frontend =====

const API = "/api";
let currentPage = "dashboard";
let timerInterval = null;
let timerRunning = false;
let timerSeconds = 25 * 60;
let timerOriginalSeconds = 25 * 60;
let reviewCards = [];
let reviewIndex = 0;
let reviewFlipped = false;
let currentQuizId = null;
let quizAnswers = {};
let currentUser = null;

// ===== Auth =====
function getToken() { return localStorage.getItem("studyhub_token"); }
function setToken(token) { localStorage.setItem("studyhub_token", token); }
function clearToken() { localStorage.removeItem("studyhub_token"); }

function showAuthCard(cardId) {
  document.getElementById("signInCard").classList.toggle("hidden", cardId !== "signInCard");
  document.getElementById("signUpCard").classList.toggle("hidden", cardId !== "signUpCard");
  document.getElementById("signInError").classList.add("hidden");
  document.getElementById("signUpError").classList.add("hidden");
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  btn.textContent = isPassword ? "🙈" : "👁️";
}

function showApp() {
  document.getElementById("authOverlay").classList.add("hidden");
  if (currentUser) {
    document.getElementById("userName").textContent = currentUser.name;
    document.getElementById("userEmail").textContent = currentUser.email;
    document.getElementById("userAvatar").textContent = currentUser.name.charAt(0).toUpperCase();
  }
  navigateTo("dashboard");
}

function showAuth() {
  document.getElementById("authOverlay").classList.remove("hidden");
  showAuthCard("signInCard");
}

async function checkAuth() {
  const token = getToken();
  if (!token) { showAuth(); return; }
  try {
    currentUser = await api("/auth/me");
    showApp();
  } catch {
    clearToken();
    showAuth();
  }
}

async function handleSignIn(e) {
  e.preventDefault();
  const errEl = document.getElementById("signInError");
  const btn = document.getElementById("signInBtn");
  errEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "Signing in...";
  try {
    const email = document.getElementById("signInEmail").value.trim();
    const password = document.getElementById("signInPassword").value;
    const data = await fetch(API + "/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; });
    setToken(data.token);
    currentUser = data.user;
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
}

async function handleSignUp(e) {
  e.preventDefault();
  const errEl = document.getElementById("signUpError");
  const btn = document.getElementById("signUpBtn");
  errEl.classList.add("hidden");

  const name = document.getElementById("signUpName").value.trim();
  const email = document.getElementById("signUpEmail").value.trim();
  const password = document.getElementById("signUpPassword").value;
  const confirm = document.getElementById("signUpConfirm").value;

  if (password !== confirm) {
    errEl.textContent = "Passwords don't match";
    errEl.classList.remove("hidden");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating account...";
  try {
    const data = await fetch(API + "/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; });
    setToken(data.token);
    currentUser = data.user;
    showApp();
    toast("Welcome to StudyHub, " + escapeHtml(currentUser.name) + "!");
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
}

function handleLogout() {
  clearToken();
  currentUser = null;
  showAuth();
  toast("Signed out", "info");
}

// ===== Navigation =====
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

function navigateTo(page) {
  currentPage = page;
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
  const pageEl = document.getElementById(`page-${page}`);
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add("active");
  if (navEl) navEl.classList.add("active");

  // Close mobile sidebar
  document.getElementById("sidebar").classList.remove("open");

  // Load page data
  switch (page) {
    case "dashboard": loadDashboard(); break;
    case "subjects": loadSubjects(); break;
    case "notes": loadSubjectSelectors(); loadNotes(); break;
    case "flashcards": loadSubjectSelectors(); loadFlashcards(); break;
    case "quizzes": loadSubjectSelectors(); loadQuizzes(); break;
    case "timer": loadSubjectSelectors(); loadSessions(); break;
    case "settings": loadSettings(); break;
  }
}

// Mobile menu
document.getElementById("menuBtn").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

// ===== API Helpers =====
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...opts.headers };
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = await fetch(API + path, {
    headers,
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    clearToken();
    currentUser = null;
    showAuth();
    throw new Error("Session expired. Please sign in again.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ===== Toast =====
function toast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  const icons = { success: "✅", error: "❌", info: "ℹ️" };
  el.innerHTML = `<span>${icons[type] || ""}</span> ${escapeHtml(message)}`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ===== Modal =====
function openModal(id) {
  document.getElementById(id).classList.add("active");
  loadSubjectSelectors();
}
function closeModal(id) {
  document.getElementById(id).classList.remove("active");
}

// Close modal on overlay click
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("active");
  });
});

// ===== Subject Selectors =====
async function loadSubjectSelectors() {
  try {
    const subjects = await api("/subjects");
    const selectors = ["noteSubject", "cardSubject", "quizSubject", "timerSubject", "noteSubjectFilter", "cardSubjectFilter"];
    selectors.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const currentVal = el.value;
      const isFilter = id.includes("Filter") || id === "timerSubject";
      el.innerHTML = isFilter
        ? `<option value="">${id === "timerSubject" ? "General" : "All Subjects"}</option>`
        : `<option value="">Select Subject</option>`;
      subjects.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.icon} ${s.name}`;
        el.appendChild(opt);
      });
      if (currentVal) el.value = currentVal;
    });
  } catch (e) { /* ignore */ }
}

// ===== Color & Icon Pickers =====
document.querySelectorAll(".color-picker").forEach((picker) => {
  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".color-opt");
    if (!btn) return;
    picker.querySelectorAll(".color-opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});
document.querySelectorAll(".icon-picker").forEach((picker) => {
  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".icon-opt");
    if (!btn) return;
    picker.querySelectorAll(".icon-opt").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  });
});

// ===== Dashboard =====
async function loadDashboard() {
  try {
    const data = await api("/dashboard/stats");
    document.getElementById("statSubjects").textContent = data.totalSubjects;
    document.getElementById("statNotes").textContent = data.totalNotes;
    document.getElementById("statCards").textContent = data.totalCards;
    document.getElementById("statTodayMin").textContent = data.studyToday;
    document.getElementById("weeklyTotal").textContent = `${data.studyThisWeek} min`;
    document.getElementById("dueCount").textContent = data.cardsToReview;
    document.getElementById("streakCount").textContent = data.streak;

    // Weekly chart
    const chartEl = document.getElementById("weeklyChart");
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekData = new Array(7).fill(0);
    const today = new Date();
    data.weeklyData.forEach((d) => {
      const date = new Date(d.session_date + "T00:00:00");
      const diff = Math.floor((today - date) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < 7) weekData[6 - diff] = d.minutes;
    });
    const maxMin = Math.max(...weekData, 1);
    chartEl.innerHTML = weekData
      .map((min, i) => {
        const dayIndex = (today.getDay() - 6 + i + 7) % 7;
        const h = (min / maxMin) * 120;
        return `<div class="chart-bar-wrapper">
          <span class="chart-value">${min}m</span>
          <div class="chart-bar" style="height:${Math.max(h, 4)}px"></div>
          <span class="chart-label">${days[dayIndex]}</span>
        </div>`;
      })
      .join("");

    // Subject breakdown
    const breakdownEl = document.getElementById("subjectBreakdown");
    const maxBreakdown = Math.max(...data.subjectBreakdown.map((s) => s.minutes), 1);
    breakdownEl.innerHTML = data.subjectBreakdown.length
      ? data.subjectBreakdown
          .map(
            (s) => `<div class="breakdown-item">
            <div class="breakdown-dot" style="background:${s.color}"></div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between">
                <span class="breakdown-name">${escapeHtml(s.name)}</span>
                <span class="breakdown-time">${s.minutes}m</span>
              </div>
              <div class="breakdown-bar-track">
                <div class="breakdown-bar-fill" style="width:${(s.minutes / maxBreakdown) * 100}%;background:${s.color}"></div>
              </div>
            </div>
          </div>`
          )
          .join("")
      : `<div class="empty-state"><p>No study data yet</p></div>`;

    // Recent quizzes
    const quizEl = document.getElementById("recentQuizzes");
    quizEl.innerHTML = data.recentAttempts.length
      ? data.recentAttempts
          .map(
            (a) => `<div class="quiz-score-item">
            <div class="quiz-score-info">
              <span class="quiz-score-title">${escapeHtml(a.quiz_title)}</span>
              <span class="quiz-score-subject">${escapeHtml(a.subject_name)}</span>
            </div>
            <span class="badge ${a.score / a.total >= 0.7 ? "badge-success" : "badge-danger"}">${Math.round((a.score / a.total) * 100)}%</span>
          </div>`
          )
          .join("")
      : `<div class="empty-state"><p>No quiz attempts yet</p></div>`;
  } catch (e) {
    console.error("Dashboard error:", e);
  }
}

// ===== Subjects =====
async function loadSubjects() {
  try {
    const subjects = await api("/subjects");
    const grid = document.getElementById("subjectsGrid");
    grid.innerHTML = subjects.length
      ? subjects
          .map(
            (s) => `<div class="subject-card" style="border-top: 3px solid ${s.color}" onclick="viewSubject(${s.id}, '${escapeHtml(s.name)}')">
          <div class="subject-card-actions">
            <button onclick="event.stopPropagation(); deleteSubject(${s.id})" title="Delete">🗑</button>
          </div>
          <div class="subject-card-icon">${s.icon}</div>
          <div class="subject-card-name">${escapeHtml(s.name)}</div>
          <div class="subject-card-stats">
            <span>📝 ${s.note_count} notes</span>
            <span>🃏 ${s.card_count} cards</span>
            <span>❓ ${s.quiz_count} quizzes</span>
          </div>
        </div>`
          )
          .join("")
      : `<div class="empty-state">
          <div class="empty-state-icon">📘</div>
          <div class="empty-state-text">No subjects yet. Create your first subject!</div>
          <button class="btn btn-primary" onclick="openModal('subjectModal')">+ New Subject</button>
        </div>`;
  } catch (e) {
    toast("Failed to load subjects", "error");
  }
}

async function createSubject(e) {
  e.preventDefault();
  const name = document.getElementById("subjectName").value.trim();
  const colorEl = document.querySelector(".color-picker .color-opt.active");
  const iconEl = document.querySelector(".icon-picker .icon-opt.active");
  const color = colorEl?.dataset.color || "#6C63FF";
  const icon = iconEl?.dataset.icon || "📘";
  try {
    await api("/subjects", { method: "POST", body: { name, color, icon } });
    toast("Subject created!");
    closeModal("subjectModal");
    document.getElementById("subjectName").value = "";
    loadSubjects();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteSubject(id) {
  if (!confirm("Delete this subject and all its content?")) return;
  try {
    await api(`/subjects/${id}`, { method: "DELETE" });
    toast("Subject deleted");
    loadSubjects();
  } catch (e) {
    toast("Failed to delete", "error");
  }
}

function viewSubject(id, name) {
  // Navigate to notes filtered by this subject
  navigateTo("notes");
  setTimeout(() => {
    document.getElementById("noteSubjectFilter").value = id;
    loadNotes();
  }, 100);
}

// ===== Notes =====
async function loadNotes() {
  try {
    const subjectId = document.getElementById("noteSubjectFilter")?.value || "";
    const query = subjectId ? `?subject_id=${subjectId}` : "";
    const notes = await api(`/notes${query}`);
    const grid = document.getElementById("notesGrid");
    grid.innerHTML = notes.length
      ? notes
          .map(
            (n) => `<div class="note-card" onclick="viewNote(${n.id})">
          <div class="note-card-header">
            <div class="note-card-title">${n.pinned ? '<span class="pin-icon">📌</span>' : ""} ${escapeHtml(n.title)}</div>
            <span class="note-card-subject" style="background:${n.subject_color}22;color:${n.subject_color}">${escapeHtml(n.subject_name)}</span>
          </div>
          <div class="note-card-preview">${escapeHtml(n.content || "No content")}</div>
          <div class="note-card-date">${new Date(n.updated_at).toLocaleDateString()}</div>
        </div>`
          )
          .join("")
      : `<div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <div class="empty-state-text">No notes yet. Start taking notes!</div>
          <button class="btn btn-primary" onclick="openModal('noteModal')">+ New Note</button>
        </div>`;
  } catch (e) {
    toast("Failed to load notes", "error");
  }
}

async function viewNote(id) {
  try {
    const notes = await api("/notes");
    const note = notes.find((n) => n.id === id);
    if (!note) return;
    document.getElementById("noteViewTitle").textContent = note.title;
    document.getElementById("noteViewMeta").textContent = `${note.subject_name} • Updated ${new Date(note.updated_at).toLocaleString()}`;
    document.getElementById("noteViewContent").textContent = note.content || "No content";
    document.getElementById("noteViewEditBtn").onclick = () => { closeModal("noteViewModal"); editNote(note); };
    document.getElementById("noteViewDeleteBtn").onclick = () => { deleteNote(note.id); closeModal("noteViewModal"); };
    openModal("noteViewModal");
  } catch (e) {
    toast("Failed to load note", "error");
  }
}

function editNote(note) {
  document.getElementById("noteEditId").value = note.id;
  document.getElementById("noteModalTitle").textContent = "Edit Note";
  document.getElementById("noteSubject").value = note.subject_id;
  document.getElementById("noteTitle").value = note.title;
  document.getElementById("noteContent").value = note.content;
  openModal("noteModal");
}

async function saveNote(e) {
  e.preventDefault();
  const editId = document.getElementById("noteEditId").value;
  const subject_id = document.getElementById("noteSubject").value;
  const title = document.getElementById("noteTitle").value.trim();
  const content = document.getElementById("noteContent").value;

  try {
    if (editId) {
      await api(`/notes/${editId}`, { method: "PUT", body: { subject_id: Number(subject_id), title, content } });
      toast("Note updated!");
    } else {
      await api("/notes", { method: "POST", body: { subject_id: Number(subject_id), title, content } });
      toast("Note created!");
    }
    closeModal("noteModal");
    document.getElementById("noteEditId").value = "";
    document.getElementById("noteModalTitle").textContent = "New Note";
    document.getElementById("noteTitle").value = "";
    document.getElementById("noteContent").value = "";
    loadNotes();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteNote(id) {
  if (!confirm("Delete this note?")) return;
  try {
    await api(`/notes/${id}`, { method: "DELETE" });
    toast("Note deleted");
    loadNotes();
  } catch (e) {
    toast("Failed to delete", "error");
  }
}

// ===== Flashcards =====
async function loadFlashcards() {
  try {
    const subjectId = document.getElementById("cardSubjectFilter")?.value || "";
    const query = subjectId ? `?subject_id=${subjectId}` : "";
    const cards = await api(`/flashcards${query}`);
    const list = document.getElementById("flashcardsList");
    list.innerHTML = cards.length
      ? cards
          .map(
            (c) => `<div class="fc-card">
          <button class="fc-card-delete" onclick="deleteFlashcard(${c.id})" title="Delete">&times;</button>
          <span class="fc-card-subject" style="background:${c.subject_color}22;color:${c.subject_color}">${escapeHtml(c.subject_name)}</span>
          <div class="fc-card-q">${escapeHtml(c.question)}</div>
          <div class="fc-card-a">${escapeHtml(c.answer)}</div>
        </div>`
          )
          .join("")
      : `<div class="empty-state">
          <div class="empty-state-icon">🃏</div>
          <div class="empty-state-text">No flashcards yet. Create your first card!</div>
          <button class="btn btn-primary" onclick="openModal('flashcardModal')">+ New Card</button>
        </div>`;
  } catch (e) {
    toast("Failed to load flashcards", "error");
  }
}

async function createFlashcard(e) {
  e.preventDefault();
  const subject_id = document.getElementById("cardSubject").value;
  const question = document.getElementById("cardQuestion").value.trim();
  const answer = document.getElementById("cardAnswer").value.trim();
  try {
    await api("/flashcards", { method: "POST", body: { subject_id: Number(subject_id), question, answer } });
    toast("Flashcard created!");
    closeModal("flashcardModal");
    document.getElementById("cardQuestion").value = "";
    document.getElementById("cardAnswer").value = "";
    loadFlashcards();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function deleteFlashcard(id) {
  if (!confirm("Delete this flashcard?")) return;
  try {
    await api(`/flashcards/${id}`, { method: "DELETE" });
    toast("Card deleted");
    loadFlashcards();
  } catch (e) {
    toast("Failed to delete", "error");
  }
}

// ===== Flashcard Review =====
async function startReview() {
  try {
    const cards = await api("/flashcards/review");
    if (!cards.length) {
      toast("No cards due for review!", "info");
      return;
    }
    reviewCards = cards;
    reviewIndex = 0;
    reviewFlipped = false;
    document.getElementById("flashcardsList").classList.add("hidden");
    document.getElementById("reviewMode").classList.remove("hidden");
    showReviewCard();
  } catch (e) {
    toast("Failed to start review", "error");
  }
}

function showReviewCard() {
  const card = reviewCards[reviewIndex];
  document.getElementById("reviewQuestion").textContent = card.question;
  document.getElementById("reviewAnswer").textContent = card.answer;
  document.getElementById("reviewCardInner").classList.remove("flipped");
  document.getElementById("reviewActions").classList.add("hidden");
  document.getElementById("reviewCounter").textContent = `${reviewIndex + 1} / ${reviewCards.length}`;
  document.getElementById("reviewProgressBar").style.width = `${((reviewIndex + 1) / reviewCards.length) * 100}%`;
  reviewFlipped = false;
}

function flipCard() {
  reviewFlipped = !reviewFlipped;
  document.getElementById("reviewCardInner").classList.toggle("flipped");
  if (reviewFlipped) {
    document.getElementById("reviewActions").classList.remove("hidden");
  }
}

async function rateCard(quality) {
  const card = reviewCards[reviewIndex];
  try {
    await api(`/flashcards/${card.id}/review`, { method: "PUT", body: { quality } });
  } catch (e) { /* continue anyway */ }

  reviewIndex++;
  if (reviewIndex < reviewCards.length) {
    showReviewCard();
  } else {
    toast(`Review complete! ${reviewCards.length} cards reviewed.`, "success");
    endReview();
  }
}

function endReview() {
  document.getElementById("reviewMode").classList.add("hidden");
  document.getElementById("flashcardsList").classList.remove("hidden");
  loadFlashcards();
}

// ===== Quizzes =====
async function loadQuizzes() {
  try {
    const quizzes = await api("/quizzes");
    const list = document.getElementById("quizzesList");
    list.innerHTML = quizzes.length
      ? quizzes
          .map(
            (q) => `<div class="quiz-card">
          <div class="quiz-card-title">${escapeHtml(q.title)}</div>
          <div class="quiz-card-subject">${escapeHtml(q.subject_name)}</div>
          <div class="quiz-card-meta">
            <span>📋 ${q.question_count} questions</span>
            ${q.best_score != null ? `<span>🏆 Best: ${q.best_score}%</span>` : ""}
          </div>
          <div class="quiz-card-actions">
            <button class="btn btn-primary btn-sm" onclick="takeQuiz(${q.id})">Take Quiz</button>
            <button class="btn btn-danger btn-sm" onclick="deleteQuiz(${q.id})">Delete</button>
          </div>
        </div>`
          )
          .join("")
      : `<div class="empty-state">
          <div class="empty-state-icon">❓</div>
          <div class="empty-state-text">No quizzes yet. Create your first quiz!</div>
          <button class="btn btn-primary" onclick="openModal('quizModal')">+ Create Quiz</button>
        </div>`;
  } catch (e) {
    toast("Failed to load quizzes", "error");
  }
}

let quizQuestionCount = 1;
function addQuizQuestion() {
  quizQuestionCount++;
  const builder = document.getElementById("quizQuestionsBuilder");
  const block = document.createElement("div");
  block.className = "quiz-q-block";
  block.innerHTML = `
    <h4>Question ${quizQuestionCount}</h4>
    <div class="form-group"><input type="text" class="form-input qq-text" placeholder="Question text" required></div>
    <div class="form-row">
      <div class="form-group"><input type="text" class="form-input qq-a" placeholder="A)" required></div>
      <div class="form-group"><input type="text" class="form-input qq-b" placeholder="B)" required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><input type="text" class="form-input qq-c" placeholder="C)" required></div>
      <div class="form-group"><input type="text" class="form-input qq-d" placeholder="D)" required></div>
    </div>
    <div class="form-group">
      <label>Correct Answer</label>
      <select class="form-input qq-correct" required>
        <option value="A">A</option><option value="B">B</option>
        <option value="C">C</option><option value="D">D</option>
      </select>
    </div>`;
  builder.appendChild(block);
}

async function createQuiz(e) {
  e.preventDefault();
  const subject_id = document.getElementById("quizSubject").value;
  const title = document.getElementById("quizTitle").value.trim();
  const blocks = document.querySelectorAll(".quiz-q-block");
  const questions = [];
  blocks.forEach((b) => {
    const text = b.querySelector(".qq-text")?.value.trim();
    const a = b.querySelector(".qq-a")?.value.trim();
    const optB = b.querySelector(".qq-b")?.value.trim();
    const c = b.querySelector(".qq-c")?.value.trim();
    const d = b.querySelector(".qq-d")?.value.trim();
    const correct = b.querySelector(".qq-correct")?.value;
    if (text && a && optB && c && d) {
      questions.push({ question: text, option_a: a, option_b: optB, option_c: c, option_d: d, correct_option: correct });
    }
  });
  try {
    await api("/quizzes", { method: "POST", body: { subject_id: Number(subject_id), title, questions } });
    toast("Quiz created!");
    closeModal("quizModal");
    document.getElementById("quizTitle").value = "";
    // Reset quiz builder
    const builder = document.getElementById("quizQuestionsBuilder");
    builder.innerHTML = `<div class="quiz-q-block" data-index="0">
      <h4>Question 1</h4>
      <div class="form-group"><input type="text" class="form-input qq-text" placeholder="Question text" required></div>
      <div class="form-row">
        <div class="form-group"><input type="text" class="form-input qq-a" placeholder="A)" required></div>
        <div class="form-group"><input type="text" class="form-input qq-b" placeholder="B)" required></div>
      </div>
      <div class="form-row">
        <div class="form-group"><input type="text" class="form-input qq-c" placeholder="C)" required></div>
        <div class="form-group"><input type="text" class="form-input qq-d" placeholder="D)" required></div>
      </div>
      <div class="form-group"><label>Correct Answer</label>
        <select class="form-input qq-correct" required>
          <option value="A">A</option><option value="B">B</option>
          <option value="C">C</option><option value="D">D</option>
        </select>
      </div></div>`;
    quizQuestionCount = 1;
    loadQuizzes();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function takeQuiz(id) {
  try {
    const quiz = await api(`/quizzes/${id}`);
    currentQuizId = id;
    quizAnswers = {};
    document.getElementById("quizTakingTitle").textContent = quiz.title;
    const container = document.getElementById("quizQuestions");
    container.innerHTML = quiz.questions
      .map(
        (q, i) => `<div class="quiz-q-card" data-qid="${q.id}">
        <h4>Q${i + 1}. ${escapeHtml(q.question)}</h4>
        <div class="quiz-options">
          ${["A", "B", "C", "D"]
            .map(
              (opt) => `<div class="quiz-option" data-qid="${q.id}" data-opt="${opt}" onclick="selectQuizOption(this)">
              <span class="quiz-option-letter">${opt}</span>
              <span>${escapeHtml(q[`option_${opt.toLowerCase()}`])}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>`
      )
      .join("");
    document.getElementById("quizzesList").classList.add("hidden");
    document.getElementById("quizTaking").classList.remove("hidden");
    document.getElementById("quizResults").classList.add("hidden");
  } catch (e) {
    toast("Failed to load quiz", "error");
  }
}

function selectQuizOption(el) {
  const qid = el.dataset.qid;
  const opt = el.dataset.opt;
  // Deselect siblings
  el.parentElement.querySelectorAll(".quiz-option").forEach((o) => o.classList.remove("selected"));
  el.classList.add("selected");
  quizAnswers[qid] = opt;
}

async function submitQuiz() {
  try {
    const result = await api(`/quizzes/${currentQuizId}/attempt`, { method: "POST", body: { answers: quizAnswers } });
    const pct = Math.round((result.score / result.total) * 100);
    document.getElementById("scoreValue").textContent = pct + "%";
    document.getElementById("scoreText").textContent = `You scored ${result.score} out of ${result.total}`;
    const circle = document.getElementById("scoreCircle");
    circle.style.borderColor = pct >= 70 ? "var(--success)" : pct >= 40 ? "var(--warning)" : "var(--danger)";

    document.getElementById("resultDetails").innerHTML = result.results
      .map(
        (r) =>
          `<div class="result-item ${r.correct ? "result-correct" : "result-wrong"}">
          ${r.correct ? "✅" : "❌"} Question ${r.id} - Your answer: ${r.user_answer || "—"} ${!r.correct ? `(Correct: ${r.correct_option})` : ""}
        </div>`
      )
      .join("");

    document.getElementById("quizTaking").classList.add("hidden");
    document.getElementById("quizResults").classList.remove("hidden");
    toast(`Quiz completed! Score: ${pct}%`, pct >= 70 ? "success" : "info");
  } catch (e) {
    toast("Failed to submit quiz", "error");
  }
}

function cancelQuiz() {
  document.getElementById("quizTaking").classList.add("hidden");
  document.getElementById("quizResults").classList.add("hidden");
  document.getElementById("quizzesList").classList.remove("hidden");
  loadQuizzes();
}

async function deleteQuiz(id) {
  if (!confirm("Delete this quiz?")) return;
  try {
    await api(`/quizzes/${id}`, { method: "DELETE" });
    toast("Quiz deleted");
    loadQuizzes();
  } catch (e) {
    toast("Failed to delete", "error");
  }
}

// ===== Study Timer =====
function setTimerDuration() {
  if (timerRunning) return;
  const mins = Number(document.getElementById("timerDuration").value);
  timerSeconds = mins * 60;
  timerOriginalSeconds = timerSeconds;
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  document.getElementById("timerDisplay").textContent =
    `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function toggleTimer() {
  if (timerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  timerRunning = true;
  document.getElementById("timerStartBtn").textContent = "Pause";
  document.getElementById("timerLabel").textContent = "Stay focused!";
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      completeTimer();
    }
  }, 1000);
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  document.getElementById("timerStartBtn").textContent = "Resume";
  document.getElementById("timerLabel").textContent = "Paused";
}

function resetTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerSeconds = timerOriginalSeconds;
  updateTimerDisplay();
  document.getElementById("timerStartBtn").textContent = "Start";
  document.getElementById("timerLabel").textContent = "Focus Time";
}

async function completeTimer() {
  clearInterval(timerInterval);
  timerRunning = false;
  const mins = Math.round(timerOriginalSeconds / 60);
  const subjectId = document.getElementById("timerSubject").value;
  try {
    await api("/sessions", {
      method: "POST",
      body: { subject_id: subjectId ? Number(subjectId) : null, duration_minutes: mins },
    });
    toast(`Study session complete! ${mins} minutes logged.`, "success");
  } catch (e) { /* ignore */ }
  resetTimer();
  loadSessions();
}

async function loadSessions() {
  try {
    const sessions = await api("/sessions?days=30");
    const list = document.getElementById("recentSessions");
    list.innerHTML = sessions.length
      ? sessions
          .slice(0, 10)
          .map(
            (s) => `<div class="session-item">
          <div>
            <div>${s.subject_name || "General"}</div>
            <div class="session-subject">${new Date(s.session_date).toLocaleDateString()}</div>
          </div>
          <span class="session-duration">${s.duration_minutes} min</span>
        </div>`
          )
          .join("")
      : `<div class="empty-state"><p>No sessions yet</p></div>`;
  } catch (e) { /* ignore */ }
}

// ===== Settings =====
async function loadSettings() {
  try {
    if (currentUser) {
      document.getElementById("settingName").value = currentUser.name || "";
      document.getElementById("settingEmail").value = currentUser.email || "";
    }
    const s = await api("/settings");
    document.getElementById("settingGoal").value = s.study_goal_minutes || 60;
    document.getElementById("settingTimerDuration").value = s.timer_duration || 25;
    document.getElementById("settingNotifications").checked = !!s.notifications;
    document.getElementById("settingSounds").checked = !!s.sound_effects;
    document.getElementById("settingReminder").checked = !!s.daily_reminder;
  } catch (e) {
    toast("Failed to load settings", "error");
  }
}

async function saveProfile() {
  const name = document.getElementById("settingName").value.trim();
  if (!name) return toast("Name is required", "error");
  try {
    await api("/auth/me", { method: "PUT", body: { name } });
    currentUser.name = name;
    document.getElementById("userName").textContent = name;
    document.getElementById("userAvatar").textContent = name.charAt(0).toUpperCase();
    toast("Profile updated!");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function changePassword() {
  const currentPassword = document.getElementById("settingCurrentPwd").value;
  const newPassword = document.getElementById("settingNewPwd").value;
  const confirm = document.getElementById("settingConfirmPwd").value;
  if (!currentPassword || !newPassword) return toast("Fill in all password fields", "error");
  if (newPassword.length < 8) return toast("New password must be at least 8 characters", "error");
  if (newPassword !== confirm) return toast("New passwords don't match", "error");
  try {
    await api("/auth/me", { method: "PUT", body: { currentPassword, newPassword } });
    document.getElementById("settingCurrentPwd").value = "";
    document.getElementById("settingNewPwd").value = "";
    document.getElementById("settingConfirmPwd").value = "";
    toast("Password changed successfully!");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function saveStudySettings() {
  try {
    await api("/settings", {
      method: "PUT",
      body: {
        study_goal_minutes: Number(document.getElementById("settingGoal").value),
        timer_duration: Number(document.getElementById("settingTimerDuration").value),
        notifications: document.getElementById("settingNotifications").checked,
        sound_effects: document.getElementById("settingSounds").checked,
        daily_reminder: document.getElementById("settingReminder").checked,
      },
    });
    toast("Study preferences saved!");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function exportData() {
  try {
    const data = await api("/settings/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studyhub-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Data exported!");
  } catch (e) {
    toast("Failed to export data", "error");
  }
}

async function deleteAccount() {
  if (!confirm("Are you sure? This will permanently delete your account and ALL data. This cannot be undone!")) return;
  if (!confirm("Really delete everything? Type OK to confirm.")) return;
  try {
    await api("/settings/account", { method: "DELETE" });
    clearToken();
    currentUser = null;
    showAuth();
    toast("Account deleted", "info");
  } catch (e) {
    toast("Failed to delete account", "error");
  }
}

// ===== Chat Assistant =====
let chatOpen = false;
let chatLoaded = false;

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById("chatPanel");
  const fab = document.getElementById("chatFabIcon");
  if (chatOpen) {
    panel.classList.remove("hidden");
    fab.textContent = "✕";
    if (!chatLoaded) {
      loadChatHistory();
      chatLoaded = true;
    }
    setTimeout(() => document.getElementById("chatInput").focus(), 100);
  } else {
    panel.classList.add("hidden");
    fab.textContent = "\uD83E\uDD16";
  }
}

async function loadChatHistory() {
  try {
    const messages = await api("/chat/history");
    if (messages.length === 0) return;
    const container = document.getElementById("chatMessages");
    container.innerHTML = "";
    messages.forEach((m) => appendChatBubble(m.role, m.content, m.created_at));
    scrollChat();
  } catch (e) { /* ignore */ }
}

function appendChatBubble(role, content, timestamp) {
  const container = document.getElementById("chatMessages");
  // Remove welcome if present
  const welcome = container.querySelector(".chat-welcome");
  if (welcome) welcome.remove();

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble chat-bubble-${role === "user" ? "user" : "assistant"}`;
  bubble.innerHTML = `<div>${escapeHtml(content)}</div>`;
  if (timestamp) {
    const time = document.createElement("div");
    time.className = "chat-bubble-time";
    time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    bubble.appendChild(time);
  }
  container.appendChild(bubble);
}

function showTypingIndicator() {
  const container = document.getElementById("chatMessages");
  const typing = document.createElement("div");
  typing.className = "chat-typing";
  typing.id = "chatTyping";
  typing.innerHTML = `<span class="chat-typing-dot"></span><span class="chat-typing-dot"></span><span class="chat-typing-dot"></span>`;
  container.appendChild(typing);
  scrollChat();
}

function removeTypingIndicator() {
  const el = document.getElementById("chatTyping");
  if (el) el.remove();
}

function scrollChat() {
  const container = document.getElementById("chatMessages");
  container.scrollTop = container.scrollHeight;
}

async function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  appendChatBubble("user", message);
  scrollChat();

  const sendBtn = document.getElementById("chatSendBtn");
  sendBtn.disabled = true;
  showTypingIndicator();

  try {
    const data = await api("/chat/send", { method: "POST", body: { message } });
    removeTypingIndicator();
    appendChatBubble("assistant", data.reply);
    scrollChat();
  } catch (e) {
    removeTypingIndicator();
    appendChatBubble("assistant", "Sorry, I encountered an error. Please try again.");
    scrollChat();
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

function sendChatSuggestion(text) {
  document.getElementById("chatInput").value = text;
  sendChatMessage(new Event("submit"));
}

async function clearChatHistory() {
  if (!confirm("Clear all chat history?")) return;
  try {
    await api("/chat/history", { method: "DELETE" });
    const container = document.getElementById("chatMessages");
    container.innerHTML = `<div class="chat-welcome">
      <span class="chat-welcome-icon">\uD83E\uDD16</span>
      <h4>Hi! I'm your Study Assistant</h4>
      <p>Ask me anything about studying — tips, progress, strategies, or just say hi!</p>
      <div class="chat-suggestions">
        <button class="chat-suggestion" onclick="sendChatSuggestion('How am I doing?')">\uD83D\uDCCA My Progress</button>
        <button class="chat-suggestion" onclick="sendChatSuggestion('Give me study tips')">\uD83D\uDCA1 Study Tips</button>
        <button class="chat-suggestion" onclick="sendChatSuggestion('Do I have cards to review?')">\uD83C\uDCCF Review Cards</button>
        <button class="chat-suggestion" onclick="sendChatSuggestion('What can you do?')">\uD83E\uDD16 Capabilities</button>
      </div>
    </div>`;
    toast("Chat history cleared", "info");
  } catch (e) {
    toast("Failed to clear chat", "error");
  }
}

// ===== Init =====
checkAuth();
