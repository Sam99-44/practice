/* nav.js - WITH ICONS + ADMIN ANNOUNCEMENTS */

(function () {
  const API = "https://practice-backend-msgn.onrender.com";
  window.API = API;

  const ICONS = {
    profile: "/practice/icons/user.svg",
    practice: "/practice/icons/book.svg",
    results: "/practice/icons/chart.svg",
    dashboard: "/practice/icons/dashboard.svg",
    leaderboard: "/practice/icons/trophy.svg",
    admin: "/practice/icons/shield.svg",
    payments: "/practice/icons/credit-card.svg",
    announcements: "/practice/icons/bell.svg",
    support: "/practice/icons/help-circle.svg",
    subscription: "/practice/icons/star.svg",
    logout: "/practice/icons/logout-2-svgrepo-com.svg"
  };

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
    localStorage.clear();
    window.location.href = "login.html";
  }

  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);

  async function getMe(token) {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;
    return res.json();
  }

  function getNavRoots() {
    return [
      document.getElementById("desktopNav"),
      document.getElementById("mobileMenu"),
    ].filter(Boolean);
  }

  function clearNavLinks(navRoot) {
    [...navRoot.children].forEach((child) => {
      if (child.tagName === "A") child.remove();
      if (child.tagName === "BUTTON" && child.id === "logoutBtn") child.remove();
    });
  }

  function createNavLink({ href, text, icon, active }) {
    const link = document.createElement("a");
    link.href = href;
    link.className = "nav-link";

    if (active) link.classList.add("active");

    link.innerHTML = `
      <img src="${icon}" alt="" class="nav-icon">
      <span>${text}</span>
    `;

    return link;
  }

  function createLogoutButton() {
    const btn = document.createElement("button");
    btn.className = "btnTop";
    btn.type = "button";

    btn.innerHTML = `
      <img src="${ICONS.logout}" alt="" class="nav-icon">
      <span>Logout</span>
    `;

    btn.addEventListener("click", logout);
    return btn;
  }

  function buildNav(navRoot, links) {
    if (!navRoot) return;

    const currentFile = getCurrentFile();
    const adminAnnouncementAliases = ["admin-announcements.html", "admin-annoucements.html"];
    const learnerAnnouncementAliases = ["announcements.html"];

    clearNavLinks(navRoot);

    links.forEach((item) => {
      const hrefFile = item.href.toLowerCase().split("/").pop();

      let active = hrefFile === currentFile;

      if (
        hrefFile === "admin-announcements.html" &&
        adminAnnouncementAliases.includes(currentFile)
      ) {
        active = true;
      }

      if (
        hrefFile === "announcements.html" &&
        learnerAnnouncementAliases.includes(currentFile)
      ) {
        active = true;
      }

      const link = createNavLink({
        href: item.href,
        text: item.text,
        icon: item.icon,
        active,
      });

      navRoot.appendChild(link);
    });

    navRoot.appendChild(createLogoutButton());
  }

  async function setupNav() {
    const token = localStorage.getItem("token");
    const navs = getNavRoots();

    if (!token) return;

    const me = await getMe(token);
    if (!me) return;

    const role = (me.role || "").toLowerCase();

    let links = [];

    if (role === "learner") {
      links = [
        { href: "profile.html", text: "Profile", icon: ICONS.profile },
        { href: "learner-quizzes.html", text: "Practice", icon: ICONS.practice },
        { href: "results.html", text: "Results", icon: ICONS.results },
        { href: "progress-dashboard.html", text: "Dashboard", icon: ICONS.dashboard },
        { href: "announcements.html", text: "Announcements", icon: ICONS.announcements },
        { href: "support.html", text: "Support", icon: ICONS.support },
      ];
    } else if (role === "editor") {
      links = [
        { href: "profile.html", text: "Profile", icon: ICONS.profile },
        { href: "learner-quizzes.html", text: "Practice", icon: ICONS.practice },
        { href: "results.html", text: "Results", icon: ICONS.results },
        { href: "progress-dashboard.html", text: "Dashboard", icon: ICONS.dashboard },
        { href: "admin.html", text: "Admin", icon: ICONS.admin },
        { href: "admin-announcements.html", text: "Announcements", icon: ICONS.announcements },
      ];
    } else {
      links = [
        { href: "profile.html", text: "Profile", icon: ICONS.profile },
        { href: "learner-quizzes.html", text: "Practice", icon: ICONS.practice },
        { href: "results.html", text: "Results", icon: ICONS.results },
        { href: "progress-dashboard.html", text: "Dashboard", icon: ICONS.dashboard },
        { href: "leaderboard.html", text: "Leaderboard", icon: ICONS.leaderboard },
        { href: "admin.html", text: "Admin", icon: ICONS.admin },
        { href: "admin-dashboard.html", text: "Admin Dashboard", icon: ICONS.dashboard },
        { href: "admin-leaderboard.html", text: "Admin Stats", icon: ICONS.leaderboard },
        { href: "admin-payments.html", text: "Payments", icon: ICONS.payments },
        { href: "admin-announcements.html", text: "Announcements", icon: ICONS.announcements },
        { href: "subscription.html", text: "Subscription", icon: ICONS.subscription },
        { href: "support.html", text: "Support", icon: ICONS.support },
      ];
    }

    navs.forEach((nav) => buildNav(nav, links));
  }

  setupNav();
})();
