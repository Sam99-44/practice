/* nav.js - shared navigation + auth helpers for Practice Online (SAFE)
   ✅ Adds Support link to BOTH desktop + mobile nav (if present)
   ✅ Auto-hides Admin link for non-admin users
   ✅ Keeps existing logic + styling safe
*/

(function () {
  const API = "https://practice-backend-msgn.onrender.com";
  window.API = API;

  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => mobileMenu.classList.toggle("open"));
    mobileMenu.addEventListener("click", (e) => {
      if (e.target && e.target.tagName === "A") mobileMenu.classList.remove("open");
    });
  }

  // ✅ Inject "Support" link into desktop + mobile nav (only if nav exists)
  function ensureSupportLink() {
    const addLinkIfMissing = (navRoot) => {
      if (!navRoot) return;

      // Don't duplicate
      const already = [...navRoot.querySelectorAll("a")].some((a) => {
        const href = (a.getAttribute("href") || "").toLowerCase();
        const text = (a.textContent || "").trim().toLowerCase();
        return href.includes("support") || text === "support";
      });
      if (already) return;

      // Create link
      const a = document.createElement("a");
      a.href = "support.html";
      a.textContent = "Support";

      // Insert after Results (best) else after Practice else at end
      const links = [...navRoot.querySelectorAll("a")];
      const resultsLink = links.find((x) => (x.getAttribute("href") || "").includes("results"));
      const practiceLink = links.find((x) => (x.getAttribute("href") || "").includes("learner-quizzes"));

      if (resultsLink && resultsLink.parentNode === navRoot) {
        resultsLink.insertAdjacentElement("afterend", a);
      } else if (practiceLink && practiceLink.parentNode === navRoot) {
        practiceLink.insertAdjacentElement("afterend", a);
      } else {
        navRoot.appendChild(a);
      }

      // ✅ Optional: set active underline automatically (matches your "active" class usage)
      try {
        const path = (window.location.pathname || "").toLowerCase();
        const isSupport = path.endsWith("/support.html") || path.endsWith("support.html");
        if (isSupport) a.classList.add("active");
      } catch {}
    };

    // Desktop nav: common patterns you use
    addLinkIfMissing(document.querySelector("nav.nav"));
    addLinkIfMissing(document.getElementById("desktopNav"));

    // Mobile nav (if your mobile menu contains links)
    addLinkIfMissing(document.getElementById("mobileMenu"));
  }

  // run immediately
  ensureSupportLink();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("me_cache");
    window.location.href = "login.html";
  }

  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);

  function setDisplay(nodeList, show) {
    nodeList.forEach((el) => (el.style.display = show ? "" : "none"));
  }

  async function getMe(token) {
    const cached = localStorage.getItem("me_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.time < 120000) return parsed.data;
      } catch {}
    }

    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) return "UNAUTH";
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    if (!data) return null;

    localStorage.setItem("me_cache", JSON.stringify({ time: Date.now(), data }));
    return data;
  }

  async function setupNav() {
    const token = localStorage.getItem("token");

    const authEls = document.querySelectorAll("[data-auth]");
    const guestEls = document.querySelectorAll("[data-guest]");
    const adminEls = document.querySelectorAll("[data-admin]");

    setDisplay(adminEls, false);

    if (!token) {
      setDisplay(authEls, false);
      setDisplay(guestEls, true);
      return;
    }

    setDisplay(authEls, true);
    setDisplay(guestEls, false);

    const me = await getMe(token);
    if (me === "UNAUTH") return logout();
    if (!me) return;

    if (me.role === "admin") setDisplay(adminEls, true);

    const navUsername = document.getElementById("navUsername");
    if (navUsername) navUsername.textContent = me.username || "";
  }

  setupNav();

  window.auth = {
    API,
    token: () => localStorage.getItem("token"),
    logout,
    authHeader: () => {
      const t = localStorage.getItem("token");
      return t ? { Authorization: `Bearer ${t}` } : {};
    },
  };
})();
