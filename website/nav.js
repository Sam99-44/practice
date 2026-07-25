/* nav.js - UPDATED WITHOUT REMOVING EXISTING ROLE LOGIC */

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
    logout: "/practice/icons/logout-2-svgrepo-com.svg",

    /* new requested icons */
    menu: "https://res.cloudinary.com/dopoxadlr/image/upload/v1773952155/menu_q2xag6.svg",
    account: "https://res.cloudinary.com/dopoxadlr/image/upload/v1773933113/account_m5xpia.svg"
  };

  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  function injectNavStyles() {
    if (document.getElementById("navInjectedStyles")) return;

    const style = document.createElement("style");
    style.id = "navInjectedStyles";
    style.textContent = `
      .top-shell,
      .nav-profile-left,
      .nav-actions-right,
      .nav-round-btn,
      .nav-menu-dropdown,
      .nav-account-icon-wrap,
      .nav-account-icon,
      .nav-icon,
      .nav-menu-link img,
      .nav-menu-logout img{
        display:none !important;
      }

      .nav-links,
      .mobile-menu{
        align-items:center;
        gap:10px;
      }

      .nav-link,
      .nav-menu-link,
      .nav-menu-logout{
        display:inline-flex;
        align-items:center;
        justify-content:center;
        gap:0;
        text-decoration:none;
        border:none;
        background:transparent;
        color:inherit;
        font-family:Arial,Helvetica,sans-serif;
        font-size:12px;
        font-weight:700;
        padding:0;
        cursor:pointer;
      }

      .nav-menu-link.active{
        text-decoration:underline;
        text-underline-offset:4px;
      }

      .mobile-menu .nav-link,
      .mobile-menu .nav-menu-link,
      .mobile-menu .nav-menu-logout{
        width:100%;
        justify-content:flex-start;
        padding:10px 0;
      }
    `;
    document.head.appendChild(style);
  }

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
      child.remove();
    });
  }

  function createNavLink({ href, text, active }) {
    const link = document.createElement("a");
    link.href = href;
    link.className = "nav-link nav-menu-link";

    if (active) link.classList.add("active");

    const label = document.createElement("span");
    label.textContent = text;
    link.appendChild(label);

    return link;
  }

  function createLogoutButton() {
    const btn = document.createElement("button");
    btn.className = "nav-menu-logout";
    btn.type = "button";
    btn.textContent = "Logout";
    btn.addEventListener("click", logout);
    return btn;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getUserDetails(me) {
    const user = me?.user || me || {};
    const username =
      user.username ||
      localStorage.getItem("username") ||
      "portaladmin";

    const accountType =
      user.accountType ||
      user.role ||
      localStorage.getItem("accountType") ||
      localStorage.getItem("role") ||
      "account";

    const role =
      user.role ||
      localStorage.getItem("role") ||
      "learner";

    return {
      username: escapeHtml(username),
      accountType: escapeHtml(accountType),
      role: String(role).toLowerCase()
    };
  }

  function buildNav(navRoot, links, me) {
    if (!navRoot) return;

    const currentFile = getCurrentFile();
    const adminAnnouncementAliases = ["admin-announcements.html", "admin-annoucements.html"];
    const learnerAnnouncementAliases = ["announcements.html"];
    const user = getUserDetails(me);

    clearNavLinks(navRoot);

    if (navRoot.id === "desktopNav") {
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

        navRoot.appendChild(
          createNavLink({
            href: item.href,
            text: item.text,
            active,
          })
        );
      });

      navRoot.appendChild(createLogoutButton());
      return;
    }

    if (navRoot.id === "mobileMenu") {
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
          active,
        });

        navRoot.appendChild(link);
      });

      navRoot.appendChild(createLogoutButton());
    }
  }

  async function setupNav() {
    injectNavStyles();

    const token = localStorage.getItem("token");
    const navs = getNavRoots();

    if (!token) return;

    const me = await getMe(token);
    if (!me) return;

    const user = me.user || me;
    const role = (user.role || "").toLowerCase();

    if (user.username) localStorage.setItem("username", user.username);
    if (user.role) localStorage.setItem("role", user.role);
    if (user.accountType) localStorage.setItem("accountType", user.accountType);

    let links = [];

    if (role === "learner") {
      links = [
        { href: "profile.html", text: "Profile"},
        { href: "learner-quizzes.html", text: "Practice"},
        { href: "results.html", text: "Results"},
        { href: "progress-dashboard.html", text: "Dashboard"},
        { href: "announcements.html", text: "Announcements"},
        { href: "support.html", text: "Support"},
      ];
    } else if (role === "editor") {
      links = [
        { href: "profile.html", text: "Profile"},
        { href: "learner-quizzes.html", text: "Practice"},
        { href: "results.html", text: "Results"},
        { href: "progress-dashboard.html", text: "Dashboard"},
        { href: "admin.html", text: "Admin"},
        { href: "admin-announcements.html", text: "Announcements"},
      ];
    } else {
      links = [
        { href: "profile.html", text: "Profile"},
        { href: "learner-quizzes.html", text: "Practice"},
        { href: "results.html", text: "Results"},
        { href: "progress-dashboard.html", text: "Dashboard"},
        { href: "leaderboard.html", text: "Leaderboard"},
        { href: "admin.html", text: "Admin"},
        { href: "admin-dashboard.html", text: "Admin Dashboard"},
        { href: "admin-leaderboard.html", text: "Admin Stats"},
        { href: "admin-payments.html", text: "Payments"},
        { href: "admin-announcements.html", text: "Announcements"},
        { href: "subscription.html", text: "Subscription"},
        { href: "support.html", text: "Support"},
      ];
    }

    navs.forEach((nav) => buildNav(nav, links, me));
  }

  setupNav();
})();
