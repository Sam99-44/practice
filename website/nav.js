/* nav.js - shared navigation + auth helpers for Practice Online
   ✅ Profile is the first page
   ✅ Uses backend API
   ✅ Supports mobile + desktop navigation
   ✅ Admin links added only for admins
   ✅ Prevents duplicate links
   ✅ Uses progress-dashboard.html
   ✅ Adds admin-leaderboard.html
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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("me_cache");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
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

  function isLogoutButton(node) {
    if (!node) return false;
    if (node.tagName !== "BUTTON") return false;
    return (
      node.id === "logoutBtn" ||
      node.id === "logoutBtnMobile" ||
      node.classList.contains("logoutBtn") ||
      node.classList.contains("btnTop")
    );
  }

  function getLogoutButton(navRoot) {
    const buttons = [...navRoot.querySelectorAll("button")];
    return buttons.find(isLogoutButton) || null;
  }

  function clearNavLinks(navRoot) {
    [...navRoot.children].forEach((child) => {
      if (child.tagName === "A") {
        child.remove();
      }
    });
  }

  function createNavLink({ href, text, active, hidden = false, dataAdmin = false }) {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = text;
    if (active) link.classList.add("active");
    if (hidden) link.style.display = "none";
    if (dataAdmin) link.setAttribute("data-admin", "");
    return link;
  }

  function buildNav(navRoot, links) {
    if (!navRoot) return;

    const currentFile = getCurrentFile();
    const logoutButton = getLogoutButton(navRoot);

    clearNavLinks(navRoot);

    links.forEach((item) => {
      const hrefFile = (item.href || "").toLowerCase().split("/").pop();
      const active = hrefFile === currentFile;

      const link = createNavLink({
        href: item.href,
        text: item.text,
        active,
        hidden: item.hidden,
        dataAdmin: item.dataAdmin
      });

      navRoot.appendChild(link);
    });

    if (logoutButton) {
      navRoot.appendChild(logoutButton);
    }
  }

  async function setupNav() {
    const token = localStorage.getItem("token");
    const navs = getNavRoots();

    if (!navs.length) return;

    if (!token) {
      navs.forEach((nav) => buildNav(nav, []));
      return;
    }

    const me = await getMe(token);

    if (me === "UNAUTH") {
      logout();
      return;
    }

    if (!me) return;

    const role = String(me.role || "").toLowerCase();

    const links = [
      { href: "profile.html", text: "Profile" },
      { href: "learner-quizzes.html", text: "Practice" },
      { href: "results.html", text: "Results" },
      { href: "progress-dashboard.html", text: "Dashboard" },
      { href: "leaderboard.html", text: "Leaderboard" },
      { href: "announcements.html", text: "Announcements" },
      { href: "support.html", text: "Support" },
      { href: "subscription.html", text: "Subscription" }
    ];

    if (role === "admin") {
      links.push(
        { href: "admin.html", text: "Admin" },
        { href: "admin-leaderboard.html", text: "Admin Statistics" },
        { href: "admin-payments.html", text: "Admin Payments" }
      );
    }

    navs.forEach((nav) => buildNav(nav, links));

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
