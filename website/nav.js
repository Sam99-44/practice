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
      .top-shell{
        width:100%;
        background:#fff;
        border-bottom:1px solid #e5e7eb;
        box-shadow:0 2px 10px rgba(0,0,0,.04);
      }

      .top-shell-inner{
        min-height:70px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        padding:10px 18px;
      }

      .nav-profile-left{
        display:flex;
        align-items:center;
        gap:12px;
        min-width:0;
        text-decoration:none;
      }

      .nav-account-icon-wrap{
        width:44px;
        height:44px;
        border-radius:999px;
        border:2px solid #dbeafe;
        background:#f8fafc;
        display:flex;
        align-items:center;
        justify-content:center;
        flex:0 0 auto;
      }

      .nav-account-icon{
        width:26px;
        height:26px;
        object-fit:contain;
        filter: invert(37%) sepia(86%) saturate(1498%) hue-rotate(190deg) brightness(96%) contrast(95%);
      }

      .nav-profile-meta{
        min-width:0;
        display:flex;
        flex-direction:column;
        line-height:1.15;
      }

      .nav-profile-name{
        font-family:Inter,Arial,sans-serif;
        font-size:15px;
        font-weight:700;
        color:#111827;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:240px;
      }

      .nav-profile-sub{
        font-family:Inter,Arial,sans-serif;
        font-size:12px;
        color:#64748b;
        margin-top:4px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        max-width:240px;
        text-transform:capitalize;
      }

      .nav-actions-right{
        display:flex;
        align-items:center;
        gap:10px;
        position:relative;
      }

      .nav-round-btn{
        width:42px;
        height:42px;
        border:none;
        border-radius:12px;
        background:#fff;
        display:flex;
        align-items:center;
        justify-content:center;
        cursor:pointer;
        transition:.2s ease;
      }

      .nav-round-btn:hover{
        background:#f8fafc;
      }

      .nav-round-btn img{
        width:22px;
        height:22px;
        object-fit:contain;
        filter: invert(37%) sepia(86%) saturate(1498%) hue-rotate(190deg) brightness(96%) contrast(95%);
      }

      .nav-menu-dropdown{
        position:absolute;
        top:54px;
        right:0;
        width:270px;
        background:#fff;
        border:1px solid #e5e7eb;
        border-radius:14px;
        box-shadow:0 18px 40px rgba(0,0,0,.14);
        padding:8px;
        display:none;
        z-index:1200;
      }

      .nav-menu-dropdown.open{
        display:block;
      }

      .nav-menu-link,
      .nav-menu-logout{
        width:100%;
        display:flex;
        align-items:center;
        gap:10px;
        border:none;
        background:#fff;
        text-decoration:none;
        color:#0f172a;
        font-family:Inter,Arial,sans-serif;
        font-size:14px;
        font-weight:500;
        padding:11px 12px;
        border-radius:10px;
        cursor:pointer;
      }

      .nav-menu-link:hover,
      .nav-menu-logout:hover{
        background:#f8fafc;
      }

      .nav-menu-link.active{
        background:#eef4ff;
        color:#1d4ed8;
        font-weight:700;
      }

      .nav-menu-link img,
      .nav-menu-logout img{
        width:18px;
        height:18px;
        object-fit:contain;
      }

      .nav-menu-divider{
        height:1px;
        background:#e5e7eb;
        margin:8px 0;
      }

      .nav-mobile-link{
        display:flex;
        align-items:center;
        gap:10px;
      }

      .nav-link{
        display:flex;
        align-items:center;
        gap:10px;
        text-decoration:none;
      }

      .nav-icon{
        width:18px;
        height:18px;
        object-fit:contain;
      }

      .btnTop{
        display:flex;
        align-items:center;
        gap:10px;
      }

      @media (max-width: 768px){
        .top-shell-inner{
          padding:10px 12px;
        }

        .nav-profile-name{
          max-width:140px;
        }

        .nav-profile-sub{
          max-width:140px;
        }
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

  function createNavLink({ href, text, icon, active }) {
    const link = document.createElement("a");
    link.href = href;
    link.className = "nav-link nav-menu-link";

    if (active) link.classList.add("active");

    link.innerHTML = `
      <img src="${icon}" alt="" class="nav-icon">
      <span>${text}</span>
    `;

    return link;
  }

  function createLogoutButton() {
    const btn = document.createElement("button");
    btn.className = "nav-menu-logout";
    btn.type = "button";

    btn.innerHTML = `
      <img src="${ICONS.logout}" alt="" class="nav-icon">
      <span>Logout</span>
    `;

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
      const shell = document.createElement("div");
      shell.className = "top-shell";

      const announcementLink =
        user.role === "learner" ? "announcements.html" : "admin-announcements.html";

      shell.innerHTML = `
        <div class="top-shell-inner">
          <a href="profile.html" class="nav-profile-left">
            <div class="nav-account-icon-wrap">
              <img src="${ICONS.account}" alt="Account" class="nav-account-icon">
            </div>

            <div class="nav-profile-meta">
              <div class="nav-profile-name">${user.username}</div>
              <div class="nav-profile-sub">${user.accountType}</div>
            </div>
          </a>

          <div class="nav-actions-right">
            <a href="${announcementLink}" class="nav-round-btn" aria-label="Announcements" title="Announcements">
              <img src="${ICONS.announcements}" alt="Announcements">
            </a>

            <button id="topMenuBtn" class="nav-round-btn" type="button" aria-label="Menu" title="Menu">
              <img src="${ICONS.menu}" alt="Menu">
            </button>

            <div id="topMenuDropdown" class="nav-menu-dropdown"></div>
          </div>
        </div>
      `;

      navRoot.appendChild(shell);

      const dropdown = shell.querySelector("#topMenuDropdown");
      const topMenuBtn = shell.querySelector("#topMenuBtn");

      if (dropdown) {
        const quickProfile = createNavLink({
          href: "profile.html",
          text: "My Profile",
          icon: ICONS.profile,
          active: currentFile === "profile.html",
        });

        const quickHelp = createNavLink({
          href: "support.html",
          text: "Help",
          icon: ICONS.support,
          active: currentFile === "support.html",
        });

        dropdown.appendChild(quickProfile);
        dropdown.appendChild(quickHelp);

        const divider = document.createElement("div");
        divider.className = "nav-menu-divider";
        dropdown.appendChild(divider);

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

          const alreadyAdded =
            item.href === "profile.html" || item.href === "support.html";

          if (!alreadyAdded) {
            const link = createNavLink({
              href: item.href,
              text: item.text,
              icon: item.icon,
              active,
            });
            dropdown.appendChild(link);
          }
        });

        const divider2 = document.createElement("div");
        divider2.className = "nav-menu-divider";
        dropdown.appendChild(divider2);

        dropdown.appendChild(createLogoutButton());
      }

      if (topMenuBtn && dropdown) {
        topMenuBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          dropdown.classList.toggle("open");
        });

        document.addEventListener("click", (e) => {
          if (!dropdown.contains(e.target) && !topMenuBtn.contains(e.target)) {
            dropdown.classList.remove("open");
          }
        });
      }

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
          icon: item.icon,
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

    navs.forEach((nav) => buildNav(nav, links, me));
  }

  setupNav();
})();
