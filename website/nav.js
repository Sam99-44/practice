/* nav.js - shared navigation + auth helpers for Practice Online
   ✅ Profile is now the first page
   ✅ Uses backend API
   ✅ Supports mobile + desktop navigation
   ✅ Admin links added only for admins
   ✅ Prevents duplicate links
*/

(function () {

  const API = "https://practice-backend-msgn.onrender.com";
  window.API = API;

  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {

    menuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("open");
    });

    mobileMenu.addEventListener("click", (e) => {
      if (e.target && e.target.tagName === "A") {
        mobileMenu.classList.remove("open");
      }
    });

  }

  function getCurrentFile() {
    const path = (window.location.pathname || "").toLowerCase();
    const parts = path.split("/");
    return parts[parts.length - 1] || "index.html";
  }

  function markActive(navRoot) {

    if (!navRoot) return;

    const currentFile = getCurrentFile();

    [...navRoot.querySelectorAll("a")].forEach((a) => {

      const href = (a.getAttribute("href") || "").toLowerCase();

      if (!href) return;

      const hrefFile = href.split("/").pop();

      if (hrefFile === currentFile) {
        a.classList.add("active");
      }

    });

  }

  function ensureLink(navRoot, { href, text }) {

    if (!navRoot) return;

    const exists = [...navRoot.querySelectorAll("a")].some((a) => {

      const h = (a.getAttribute("href") || "").toLowerCase();
      const t = (a.textContent || "").trim().toLowerCase();

      return h === href.toLowerCase() || t === text.toLowerCase();

    });

    if (exists) {
      markActive(navRoot);
      return;
    }

    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;

    navRoot.appendChild(link);

    markActive(navRoot);

  }

  function removeLink(navRoot, hrefOrText) {

    if (!navRoot) return;

    [...navRoot.querySelectorAll("a")].forEach((a) => {

      const h = (a.getAttribute("href") || "").toLowerCase();
      const t = (a.textContent || "").trim().toLowerCase();
      const key = hrefOrText.toLowerCase();

      if (h.includes(key) || t === key) {
        a.remove();
      }

    });

  }

  function logout() {

    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("me_cache");

    window.location.href = "login.html";

  }

  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);

  async function getMe(token) {

    const cached = localStorage.getItem("me_cache");

    if (cached) {

      try {

        const parsed = JSON.parse(cached);

        if (Date.now() - parsed.time < 120000) {
          return parsed.data;
        }

      } catch {}

    }

    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401 || res.status === 403) return "UNAUTH";
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);

    if (!data) return null;

    localStorage.setItem(
      "me_cache",
      JSON.stringify({
        time: Date.now(),
        data,
      })
    );

    return data;

  }

  function getNavRoots() {

    const roots = [

      document.getElementById("desktopNav"),
      document.getElementById("mobileMenu"),
      document.querySelector("nav.nav"),
      document.querySelector("nav"),
      document.querySelector(".nav-links"),
      document.querySelector(".top-nav-links")

    ].filter(Boolean);

    return [...new Set(roots)];

  }

  async function setupNav() {

    const token = localStorage.getItem("token");

    const navs = getNavRoots();

    navs.forEach(markActive);

    if (!token) {

      navs.forEach((nav) => {

        removeLink(nav, "profile.html");
        removeLink(nav, "dashboard.html");
        removeLink(nav, "subscription.html");
        removeLink(nav, "admin.html");
        removeLink(nav, "admin-payments.html");

      });

      return;

    }

    const me = await getMe(token);

    if (me === "UNAUTH") {
      logout();
      return;
    }

    if (!me) return;

    /* NAVIGATION ORDER */

    navs.forEach((nav) => {

      ensureLink(nav, { href: "profile.html", text: "Profile" });

      ensureLink(nav, { href: "learner-quizzes.html", text: "Practice" });

      ensureLink(nav, { href: "results.html", text: "Results" });

      ensureLink(nav, { href: "dashboard.html", text: "Dashboard" });

      ensureLink(nav, { href: "leaderboard.html", text: "Leaderboard" });

      ensureLink(nav, { href: "announcements.html", text: "Announcements" });

      ensureLink(nav, { href: "support.html", text: "Support" });

      ensureLink(nav, { href: "subscription.html", text: "Subscription" });

    });

    if (me.role === "admin") {

      navs.forEach((nav) => {

        ensureLink(nav, { href: "admin.html", text: "Admin" });

        ensureLink(nav, { href: "admin-payments.html", text: "Admin Payments" });

      });

    } else {

      navs.forEach((nav) => {

        removeLink(nav, "admin.html");
        removeLink(nav, "admin-payments.html");

      });

    }

    const navUsername = document.getElementById("navUsername");

    if (navUsername) {
      navUsername.textContent = me.username || "";
    }

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
