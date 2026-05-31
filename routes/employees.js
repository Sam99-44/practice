// routes/employees.js
// Employee Portal Backend Routes
// Handles employee access, employee management, department permissions, and logs.

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import EmployeeLog from "../models/EmployeeLog.js";

const router = express.Router();

/* ------------------ EMPLOYEE ROLE STRUCTURE ------------------ */

export const EMPLOYEE_ROLES = [
  "admin",
  "tester",
  "academic",
  "editor",
  "operations",
  "finance",
  "support",
  "Tutor"
];

export const DEPARTMENT_PERMISSIONS = {
  admin: ["all"],
  tester: ["all"],
  academic: ["academic"],
  editor: ["academic"],
  operations: ["operations"],
  finance: ["finance"],
  support: ["support"],
};

function cleanSpaces(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function cleanEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(email));
}

function normalizeRole(role = "") {
  const r = String(role || "").trim().toLowerCase();
  return EMPLOYEE_ROLES.includes(r) ? r : "";
}

function isEmployeeRole(role = "") {
  return EMPLOYEE_ROLES.includes(String(role || "").toLowerCase());
}

function canAccessDepartment(role = "", department = "") {
  const r = String(role || "").toLowerCase();
  const d = String(department || "").toLowerCase();

  const allowed = DEPARTMENT_PERMISSIONS[r] || [];

  return allowed.includes("all") || allowed.includes(d);
}

/* ------------------ AUTH MIDDLEWARE ------------------ */

function employeeAuthRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing token." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

async function employeeOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select(
      "fullName username email role accountType"
    );

    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    if (!isEmployeeRole(user.role)) {
      return res.status(403).json({ message: "Employees only." });
    }

    req.employee = user;
    next();
  } catch (error) {
    console.error("employeeOnly error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
}

async function adminEmployeeOnly(req, res, next) {
  try {
    const user = await User.findById(req.user.userId).select("role");

    if (!user) {
      return res.status(401).json({ message: "User not found." });
    }

    const role = String(user.role || "").toLowerCase();

    if (!["admin", "tester"].includes(role)) {
      return res.status(403).json({ message: "Admin/tester only." });
    }

    req.employee = user;
    next();
  } catch (error) {
    console.error("adminEmployeeOnly error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
}

function departmentRequired(department) {
  return async function (req, res, next) {
    try {
      const user = await User.findById(req.user.userId).select("role");

      if (!user) {
        return res.status(401).json({ message: "User not found." });
      }

      if (!isEmployeeRole(user.role)) {
        return res.status(403).json({ message: "Employees only." });
      }

      if (!canAccessDepartment(user.role, department)) {
        return res.status(403).json({
          message: `You do not have access to the ${department} department.`,
        });
      }

      req.employee = user;
      next();
    } catch (error) {
      console.error("departmentRequired error:", error.message);
      return res.status(500).json({ message: "Server error." });
    }
  };
}

/* ------------------ LOG HELPER ------------------ */

async function writeEmployeeLog(req, action, details = {}) {
  try {
    if (!req.user?.userId) return;

    await EmployeeLog.create({
      employee: req.user.userId,
      action,
      details,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });
  } catch (error) {
    console.error("Employee log failed:", error.message);
  }
}

/* ------------------ ROUTE 1: EMPLOYEE LOGIN ------------------ */
/*
  Optional route. You can keep using /api/login if you want.
  This route blocks learners and only allows employee roles.
*/
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const cleanUserEmail = cleanEmail(email);

    if (!cleanUserEmail || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    if (!isValidEmail(cleanUserEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const user = await User.findOne({ email: cleanUserEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (!isEmployeeRole(user.role)) {
      return res.status(403).json({
        message: "This login is for employees only.",
      });
    }

    if (user.emailVerified === false) {
      return res.status(403).json({
        message: "Please verify your email address before logging in.",
      });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await EmployeeLog.create({
      employee: user._id,
      action: "employee_login",
      details: { role: user.role },
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    return res.json({
      message: "Employee login successful.",
      token,
      user: {
        _id: user._id,
        fullName: user.fullName || "",
        username: user.username || "",
        email: user.email || "",
        role: user.role || "",
        departments: DEPARTMENT_PERMISSIONS[user.role] || [],
      },
    });
  } catch (error) {
    console.error("POST /api/employees/login error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
});

/* ------------------ ROUTE 2: CURRENT EMPLOYEE ------------------ */

router.get("/me", employeeAuthRequired, employeeOnly, async (req, res) => {
  try {
    const user = req.employee;

    await writeEmployeeLog(req, "employee_opened_portal");

    return res.json({
      _id: user._id,
      fullName: user.fullName || "",
      username: user.username || "",
      email: user.email || "",
      role: user.role || "",
      departments: DEPARTMENT_PERMISSIONS[user.role] || [],
    });
  } catch (error) {
    console.error("GET /api/employees/me error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
});

/* ------------------ ROUTE 3: CHECK DEPARTMENT ACCESS ------------------ */

router.get(
  "/access/:department",
  employeeAuthRequired,
  employeeOnly,
  async (req, res) => {
    try {
      const department = String(req.params.department || "").toLowerCase();
      const role = String(req.employee.role || "").toLowerCase();

      return res.json({
        role,
        department,
        allowed: canAccessDepartment(role, department),
      });
    } catch (error) {
      console.error("GET /api/employees/access/:department error:", error.message);
      return res.status(500).json({ message: "Server error." });
    }
  }
);

/* ------------------ ROUTE 4: LIST EMPLOYEES ------------------ */

router.get("/", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const employees = await User.find({
      role: { $in: EMPLOYEE_ROLES },
    })
      .select(
        "fullName username email role accountType emailVerified createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json(
      employees.map((u) => ({
        _id: u._id,
        fullName: u.fullName || "",
        username: u.username || "",
        email: u.email || "",
        role: u.role || "",
        accountType: u.accountType || "",
        emailVerified: !!u.emailVerified,
        departments: DEPARTMENT_PERMISSIONS[u.role] || [],
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }))
    );
  } catch (error) {
    console.error("GET /api/employees error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
});

/* ------------------ ROUTE 5: CREATE EMPLOYEE ------------------ */

router.post("/", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      role,
      emailVerified = true,
    } = req.body;

    const cleanFullName = cleanSpaces(fullName);
    const cleanUsername = cleanSpaces(username);
    const cleanUserEmail = cleanEmail(email);
    const cleanRole = normalizeRole(role);

    if (!cleanFullName || !cleanUsername || !cleanUserEmail || !password || !cleanRole) {
      return res.status(400).json({
        message: "Full name, username, email, password, and valid role are required.",
      });
    }

    if (!isValidEmail(cleanUserEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const existingEmail = await User.findOne({ email: cleanUserEmail }).select("_id");
    if (existingEmail) {
      return res.status(409).json({ message: "Email already exists." });
    }

    const existingUsername = await User.findOne({ username: cleanUsername }).select("_id");
    if (existingUsername) {
      return res.status(409).json({ message: "Username already exists." });
    }

    const strongPasswordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

    if (!strongPasswordRegex.test(String(password))) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const employee = await User.create({
      fullName: cleanFullName,
      username: cleanUsername,
      email: cleanUserEmail,
      passwordHash,
      role: cleanRole,
      accountType: "employee",
      grade: null,
      emailVerified: !!emailVerified,
    });

    await writeEmployeeLog(req, "employee_created", {
      createdEmployeeId: employee._id,
      createdEmployeeRole: cleanRole,
    });

    return res.status(201).json({
      message: "Employee created successfully.",
      employee: {
        _id: employee._id,
        fullName: employee.fullName,
        username: employee.username,
        email: employee.email,
        role: employee.role,
        accountType: employee.accountType,
        departments: DEPARTMENT_PERMISSIONS[employee.role] || [],
      },
    });
  } catch (error) {
    console.error("POST /api/employees error:", error.message);
    return res.status(500).json({ message: "Could not create employee." });
  }
});

/* ------------------ ROUTE 6: UPDATE EMPLOYEE ------------------ */

router.patch("/:id", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, username, email, role, password, emailVerified } = req.body;

    const employee = await User.findById(id);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    if (!isEmployeeRole(employee.role)) {
      return res.status(400).json({
        message: "This user is not an employee.",
      });
    }

    if (typeof fullName === "string") {
      employee.fullName = cleanSpaces(fullName);
    }

    if (typeof username === "string") {
      const newUsername = cleanSpaces(username);

      if (!newUsername) {
        return res.status(400).json({ message: "Username cannot be empty." });
      }

      const exists = await User.findOne({
        _id: { $ne: employee._id },
        username: newUsername,
      }).select("_id");

      if (exists) {
        return res.status(409).json({ message: "Username already exists." });
      }

      employee.username = newUsername;
    }

    if (typeof email === "string") {
      const newEmail = cleanEmail(email);

      if (!isValidEmail(newEmail)) {
        return res.status(400).json({
          message: "Please enter a valid email address.",
        });
      }

      const exists = await User.findOne({
        _id: { $ne: employee._id },
        email: newEmail,
      }).select("_id");

      if (exists) {
        return res.status(409).json({ message: "Email already exists." });
      }

      employee.email = newEmail;
    }

    if (typeof role === "string") {
      const newRole = normalizeRole(role);

      if (!newRole) {
        return res.status(400).json({ message: "Invalid employee role." });
      }

      employee.role = newRole;
    }

    if (typeof emailVerified === "boolean") {
      employee.emailVerified = emailVerified;
    }

    if (typeof password === "string" && password.trim()) {
      const strongPasswordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

      if (!strongPasswordRegex.test(password)) {
        return res.status(400).json({
          message:
            "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
        });
      }

      employee.passwordHash = await bcrypt.hash(password, 10);
    }

    await employee.save();

    await writeEmployeeLog(req, "employee_updated", {
      updatedEmployeeId: employee._id,
      updatedEmployeeRole: employee.role,
    });

    return res.json({
      message: "Employee updated successfully.",
      employee: {
        _id: employee._id,
        fullName: employee.fullName || "",
        username: employee.username || "",
        email: employee.email || "",
        role: employee.role || "",
        accountType: employee.accountType || "",
        emailVerified: !!employee.emailVerified,
        departments: DEPARTMENT_PERMISSIONS[employee.role] || [],
      },
    });
  } catch (error) {
    console.error("PATCH /api/employees/:id error:", error.message);
    return res.status(500).json({ message: "Could not update employee." });
  }
});

/* ------------------ ROUTE 7: DELETE EMPLOYEE ------------------ */

router.delete("/:id", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({
        message: "You cannot delete your own employee account.",
      });
    }

    const employee = await User.findById(id);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    if (!isEmployeeRole(employee.role)) {
      return res.status(400).json({
        message: "This user is not an employee.",
      });
    }

    await User.deleteOne({ _id: id });

    await writeEmployeeLog(req, "employee_deleted", {
      deletedEmployeeId: id,
      deletedEmployeeEmail: employee.email,
      deletedEmployeeRole: employee.role,
    });

    return res.json({ message: "Employee deleted successfully." });
  } catch (error) {
    console.error("DELETE /api/employees/:id error:", error.message);
    return res.status(500).json({ message: "Could not delete employee." });
  }
});

/* ------------------ ROUTE 8: EMPLOYEE LOGS ------------------ */

router.get("/logs/recent", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

    const logs = await EmployeeLog.find({})
      .populate("employee", "fullName username email role")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json(logs);
  } catch (error) {
    console.error("GET /api/employees/logs/recent error:", error.message);
    return res.status(500).json({ message: "Could not load logs." });
  }
});

/* ------------------ EXPORTS FOR OTHER ROUTES ------------------ */

export {
  employeeAuthRequired,
  employeeOnly,
  adminEmployeeOnly,
  departmentRequired,
  canAccessDepartment,
  writeEmployeeLog,
};

export default router;
