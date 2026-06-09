// Employee Portal Backend Routes
// Handles employee access, employee management, department permissions, and logs.

import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import Employee from "../models/Employee.js";
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
  "tutor",
];

export const DEPARTMENT_PERMISSIONS = {
  admin: ["all"],
  tester: ["all"],
  academic: ["academic"],
  editor: ["academic"],
  operations: ["operations"],
  finance: ["finance"],
  support: ["support"],
  tutor: ["tutor"],
};

export const EMPLOYEE_DEPARTMENTS = [
  "academic",
  "operations",
  "finance",
  "support",
  "tutor",
  "admin",
];

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

function normalizeDepartment(department = "") {
  const d = String(department || "").trim().toLowerCase();
  return EMPLOYEE_DEPARTMENTS.includes(d) ? d : "";
}

function isEmployeeRole(role = "") {
  return EMPLOYEE_ROLES.includes(String(role || "").toLowerCase());
}

function roleToDepartment(role = "") {
  const r = normalizeRole(role);

  if (r === "admin" || r === "tester") return "admin";
  if (r === "editor") return "academic";

  return r;
}

function canAccessDepartment(role = "", department = "") {
  const r = String(role || "").toLowerCase();
  const d = String(department || "").toLowerCase();

  const allowed = DEPARTMENT_PERMISSIONS[r] || [];

  return allowed.includes("all") || allowed.includes(d);
}

function employeePayload(employee) {
  return {
    _id: employee._id,
    fullName: employee.fullName || "",
    username: employee.username || "",
    email: employee.email || "",
    role: employee.role || "",
    department: employee.department || "",
    employeeNumber: employee.employeeNumber || "",
    jobTitle: employee.jobTitle || "",
    phone: employee.phone || "",
    isActive: employee.isActive !== false,
    emailVerified: !!employee.emailVerified,
    lastLoginAt: employee.lastLoginAt || null,
    departments: DEPARTMENT_PERMISSIONS[employee.role] || [],
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
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
    const employee = await Employee.findById(req.user.userId).select(
      "fullName username email role department employeeNumber jobTitle phone isActive emailVerified lastLoginAt createdAt updatedAt"
    );

    if (!employee) {
      return res.status(401).json({ message: "Employee not found." });
    }

    if (!employee.isActive) {
      return res.status(403).json({ message: "Employee account is disabled." });
    }

    if (!isEmployeeRole(employee.role)) {
      return res.status(403).json({ message: "Employees only." });
    }

    req.employee = employee;
    next();
  } catch (error) {
    console.error("employeeOnly error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
}

async function adminEmployeeOnly(req, res, next) {
  try {
    const employee = await Employee.findById(req.user.userId).select(
      "role isActive"
    );

    if (!employee) {
      return res.status(401).json({ message: "Employee not found." });
    }

    if (!employee.isActive) {
      return res.status(403).json({ message: "Employee account is disabled." });
    }

    const role = String(employee.role || "").toLowerCase();

    if (!["admin", "tester"].includes(role)) {
      return res.status(403).json({ message: "Admin/tester only." });
    }

    req.employee = employee;
    next();
  } catch (error) {
    console.error("adminEmployeeOnly error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
}

function departmentRequired(department) {
  return async function (req, res, next) {
    try {
      const employee = await Employee.findById(req.user.userId).select(
        "role isActive"
      );

      if (!employee) {
        return res.status(401).json({ message: "Employee not found." });
      }

      if (!employee.isActive) {
        return res.status(403).json({ message: "Employee account is disabled." });
      }

      if (!isEmployeeRole(employee.role)) {
        return res.status(403).json({ message: "Employees only." });
      }

      if (!canAccessDepartment(employee.role, department)) {
        return res.status(403).json({
          message: `You do not have access to the ${department} department.`,
        });
      }

      req.employee = employee;
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

/* ------------------ FIRST ADMIN REGISTRATION ------------------ */

router.post("/register-first-admin", async (req, res) => {
  try {
    const { fullName, username, email, password, employeeNumber } = req.body;

    const cleanUserEmail = cleanEmail(email);

    if (!fullName || !username || !cleanUserEmail || !password) {
      return res.status(400).json({
        message: "All required fields must be provided.",
      });
    }

    if (!isValidEmail(cleanUserEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const employeeCount = await Employee.countDocuments();

    if (employeeCount > 0) {
      return res.status(403).json({
        message: "First administrator already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const employee = await Employee.create({
      fullName: cleanSpaces(fullName),
      username: cleanSpaces(username),
      email: cleanUserEmail,
      passwordHash,
      role: "admin",
      department: "admin",
      employeeNumber: employeeNumber || "EMP001",
      jobTitle: "System Administrator",
      emailVerified: true,
      isActive: true,
    });

    res.status(201).json({
      success: true,
      message: "Administrator account created successfully.",
      employeeId: employee._id,
    });
  } catch (error) {
    console.error("REGISTER FIRST ADMIN ERROR:", error);

    res.status(500).json({
      message: "Could not create administrator account.",
    });
  }
});

/* ------------------ EMPLOYEE LOGIN ------------------ */

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

    const employee = await Employee.findOne({ email: cleanUserEmail });

    if (!employee) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, employee.passwordHash);

    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    if (!employee.isActive) {
      return res.status(403).json({
        message: "This employee account is disabled.",
      });
    }

    if (!isEmployeeRole(employee.role)) {
      return res.status(403).json({
        message: "This login is for employees only.",
      });
    }

    if (employee.emailVerified === false) {
      return res.status(403).json({
        message: "Please verify your email address before logging in.",
      });
    }

    employee.lastLoginAt = new Date();
    await employee.save();

    const token = jwt.sign(
      {
        userId: employee._id,
        role: employee.role,
        accountType: "employee",
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    await EmployeeLog.create({
      employee: employee._id,
      action: "employee_login",
      details: { role: employee.role },
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });

    return res.json({
      message: "Employee login successful.",
      token,
      user: employeePayload(employee),
    });
  } catch (error) {
    console.error("POST /api/employees/login error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
});

/* ------------------ CURRENT EMPLOYEE ------------------ */

router.get("/me", employeeAuthRequired, employeeOnly, async (req, res) => {
  try {
    await writeEmployeeLog(req, "employee_opened_portal");

    return res.json(employeePayload(req.employee));
  } catch (error) {
    console.error("GET /api/employees/me error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
});

/* ------------------ CHECK DEPARTMENT ACCESS ------------------ */

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

/* ------------------ EMPLOYEE DASHBOARD STATS ------------------ */

router.get(
  "/stats/dashboard",
  employeeAuthRequired,
  adminEmployeeOnly,
  async (req, res) => {
    try {
      const total = await Employee.countDocuments({
        role: { $in: EMPLOYEE_ROLES },
      });

      const active = await Employee.countDocuments({
        role: { $in: EMPLOYEE_ROLES },
        isActive: true,
      });

      const inactive = await Employee.countDocuments({
        role: { $in: EMPLOYEE_ROLES },
        isActive: false,
      });

      const departments = {};

      for (const department of EMPLOYEE_DEPARTMENTS) {
        departments[department] = await Employee.countDocuments({
          role: { $in: EMPLOYEE_ROLES },
          department,
        });
      }

      const roles = {};

      for (const role of EMPLOYEE_ROLES) {
        roles[role] = await Employee.countDocuments({ role });
      }

      return res.json({
        total,
        active,
        inactive,
        disabled: inactive,
        departments,
        roles,
        academic: departments.academic || 0,
        operations: departments.operations || 0,
        finance: departments.finance || 0,
        support: departments.support || 0,
        tutors: departments.tutor || 0,
        admin: departments.admin || 0,
      });
    } catch (error) {
      console.error("GET /api/employees/stats/dashboard error:", error.message);

      return res.status(500).json({
        message: "Failed to load statistics.",
      });
    }
  }
);

/* ------------------ EMPLOYEE LOGS ------------------ */
/* IMPORTANT: This route must appear before "/:id" */

router.get(
  "/logs/recent",
  employeeAuthRequired,
  adminEmployeeOnly,
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);

      const logs = await EmployeeLog.find({})
        .populate("employee", "fullName username email role department")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return res.json(
        logs.map((log) => ({
          _id: log._id,
          date: log.createdAt,
          createdAt: log.createdAt,
          employee: log.employee,
          employeeName:
            log.employee?.fullName ||
            log.employee?.username ||
            "Unknown employee",
          role: log.employee?.role || "",
          department: log.employee?.department || "",
          action: log.action || "",
          severity: log.severity || "normal",
          status: log.status || "success",
          details: log.details || {},
          ipAddress: log.ipAddress || "",
          userAgent: log.userAgent || "",
        }))
      );
    } catch (error) {
      console.error("GET /api/employees/logs/recent error:", error.message);
      return res.status(500).json({ message: "Could not load logs." });
    }
  }
);

router.get(
  "/logs",
  employeeAuthRequired,
  adminEmployeeOnly,
  async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);

      const logs = await EmployeeLog.find({})
        .populate("employee", "fullName username email role department")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return res.json(logs);
    } catch (error) {
      console.error("GET /api/employees/logs error:", error.message);
      return res.status(500).json({ message: "Could not load logs." });
    }
  }
);

/* ------------------ EMPLOYEE SEARCH ------------------ */

router.get(
  "/search/:term",
  employeeAuthRequired,
  adminEmployeeOnly,
  async (req, res) => {
    try {
      const term = cleanSpaces(req.params.term || "");

      if (!term) {
        return res.json([]);
      }

      const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      const employees = await Employee.find({
        role: { $in: EMPLOYEE_ROLES },
        $or: [
          { fullName: rx },
          { username: rx },
          { email: rx },
          { employeeNumber: rx },
          { jobTitle: rx },
          { phone: rx },
        ],
      })
        .select(
          "fullName username email role department employeeNumber jobTitle phone isActive emailVerified lastLoginAt createdAt updatedAt"
        )
        .sort({ createdAt: -1 })
        .lean();

      return res.json(employees.map(employeePayload));
    } catch (error) {
      console.error("GET /api/employees/search/:term error:", error.message);

      return res.status(500).json({
        message: "Search failed.",
      });
    }
  }
);

/* ------------------ LIST EMPLOYEES ------------------ */

router.get("/", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const filter = {
      role: { $in: EMPLOYEE_ROLES },
    };

    if (req.query.role) {
      const role = normalizeRole(req.query.role);
      if (role) filter.role = role;
    }

    if (req.query.department) {
      const department = normalizeDepartment(req.query.department);
      if (department) filter.department = department;
    }

    if (req.query.status === "active") {
      filter.isActive = true;
    }

    if (req.query.status === "disabled") {
      filter.isActive = false;
    }

    if (req.query.q || req.query.search) {
      const term = cleanSpaces(req.query.q || req.query.search);
      const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      filter.$or = [
        { fullName: rx },
        { username: rx },
        { email: rx },
        { employeeNumber: rx },
        { jobTitle: rx },
        { phone: rx },
      ];
    }

    const employees = await Employee.find(filter)
      .select(
        "fullName username email role department employeeNumber jobTitle phone isActive emailVerified lastLoginAt createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .lean();

    return res.json(employees.map(employeePayload));
  } catch (error) {
    console.error("GET /api/employees error:", error.message);
    return res.status(500).json({ message: "Server error." });
  }
});

/* ------------------ GET SINGLE EMPLOYEE ------------------ */

router.get("/:id", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .select(
        "fullName username email role department employeeNumber jobTitle phone isActive emailVerified lastLoginAt createdAt updatedAt"
      )
      .lean();

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    return res.json(employeePayload(employee));
  } catch (error) {
    console.error("GET /api/employees/:id error:", error.message);
    return res.status(500).json({ message: "Could not load employee." });
  }
});

/* ------------------ CREATE EMPLOYEE ------------------ */

router.post("/", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      role,
      department,
      employeeNumber,
      jobTitle,
      phone,
      emailVerified = true,
      isActive = true,
    } = req.body;

    const cleanFullName = cleanSpaces(fullName);
    const cleanUsername = cleanSpaces(username);
    const cleanUserEmail = cleanEmail(email);
    const cleanRole = normalizeRole(role);
    const cleanDepartment = normalizeDepartment(
      department || roleToDepartment(cleanRole)
    );

    if (
      !cleanFullName ||
      !cleanUsername ||
      !cleanUserEmail ||
      !password ||
      !cleanRole ||
      !cleanDepartment
    ) {
      return res.status(400).json({
        message:
          "Full name, username, email, password, valid role and department are required.",
      });
    }

    if (!isValidEmail(cleanUserEmail)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const existingEmail = await Employee.findOne({
      email: cleanUserEmail,
    }).select("_id");

    if (existingEmail) {
      return res.status(409).json({ message: "Email already exists." });
    }

    const existingUsername = await Employee.findOne({
      username: cleanUsername,
    }).select("_id");

    if (existingUsername) {
      return res.status(409).json({ message: "Username already exists." });
    }

    if (employeeNumber) {
      const existingEmployeeNumber = await Employee.findOne({
        employeeNumber: cleanSpaces(employeeNumber),
      }).select("_id");

      if (existingEmployeeNumber) {
        return res.status(409).json({
          message: "Employee number already exists.",
        });
      }
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

    const employee = await Employee.create({
      fullName: cleanFullName,
      username: cleanUsername,
      email: cleanUserEmail,
      passwordHash,
      role: cleanRole,
      department: cleanDepartment,
      employeeNumber: cleanSpaces(employeeNumber || ""),
      jobTitle: cleanSpaces(jobTitle || ""),
      phone: cleanSpaces(phone || ""),
      emailVerified: !!emailVerified,
      isActive: !!isActive,
    });

    await writeEmployeeLog(req, "employee_created", {
      createdEmployeeId: employee._id,
      createdEmployeeRole: cleanRole,
      createdEmployeeDepartment: cleanDepartment,
    });

    return res.status(201).json({
      message: "Employee created successfully.",
      employee: employeePayload(employee),
    });
  } catch (error) {
    console.error("POST /api/employees error:", error.message);
    return res.status(500).json({ message: "Could not create employee." });
  }
});

/* ------------------ UPDATE EMPLOYEE ------------------ */

router.patch("/:id", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const {
      fullName,
      username,
      email,
      role,
      department,
      password,
      emailVerified,
      isActive,
      employeeNumber,
      jobTitle,
      phone,
    } = req.body;

    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    if (!isEmployeeRole(employee.role)) {
      return res.status(400).json({
        message: "This record is not a valid employee.",
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

      const exists = await Employee.findOne({
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

      const exists = await Employee.findOne({
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

      if (!department) {
        employee.department = roleToDepartment(newRole);
      }
    }

    if (typeof department === "string") {
      const cleanDepartment = normalizeDepartment(department);

      if (!cleanDepartment) {
        return res.status(400).json({ message: "Invalid employee department." });
      }

      employee.department = cleanDepartment;
    }

    if (typeof emailVerified === "boolean") {
      employee.emailVerified = emailVerified;
    }

    if (typeof isActive === "boolean") {
      employee.isActive = isActive;
    }

    if (typeof employeeNumber === "string") {
      const cleanEmployeeNumber = cleanSpaces(employeeNumber);

      if (cleanEmployeeNumber) {
        const exists = await Employee.findOne({
          _id: { $ne: employee._id },
          employeeNumber: cleanEmployeeNumber,
        }).select("_id");

        if (exists) {
          return res.status(409).json({
            message: "Employee number already exists.",
          });
        }
      }

      employee.employeeNumber = cleanEmployeeNumber;
    }

    if (typeof jobTitle === "string") {
      employee.jobTitle = cleanSpaces(jobTitle);
    }

    if (typeof phone === "string") {
      employee.phone = cleanSpaces(phone);
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
      updatedEmployeeDepartment: employee.department,
      isActive: employee.isActive,
    });

    return res.json({
      message: "Employee updated successfully.",
      employee: employeePayload(employee),
    });
  } catch (error) {
    console.error("PATCH /api/employees/:id error:", error.message);
    return res.status(500).json({ message: "Could not update employee." });
  }
});

/* ------------------ TOGGLE EMPLOYEE STATUS ------------------ */

router.patch(
  "/:id/toggle-status",
  employeeAuthRequired,
  adminEmployeeOnly,
  async (req, res) => {
    try {
      const employee = await Employee.findById(req.params.id);

      if (!employee) {
        return res.status(404).json({
          message: "Employee not found.",
        });
      }

      if (String(employee._id) === String(req.user.userId)) {
        return res.status(400).json({
          message: "You cannot disable your own account.",
        });
      }

      employee.isActive = !employee.isActive;

      await employee.save();

      await writeEmployeeLog(req, "employee_status_toggled", {
        employeeId: employee._id,
        isActive: employee.isActive,
      });

      return res.json({
        message: "Employee status updated.",
        employee: employeePayload(employee),
      });
    } catch (error) {
      console.error("PATCH /api/employees/:id/toggle-status error:", error.message);

      return res.status(500).json({
        message: "Failed to update status.",
      });
    }
  }
);

/* ------------------ DELETE EMPLOYEE ------------------ */

router.delete("/:id", employeeAuthRequired, adminEmployeeOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.user.userId)) {
      return res.status(400).json({
        message: "You cannot delete your own employee account.",
      });
    }

    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found." });
    }

    if (!isEmployeeRole(employee.role)) {
      return res.status(400).json({
        message: "This record is not a valid employee.",
      });
    }

    await Employee.deleteOne({ _id: id });

    await writeEmployeeLog(req, "employee_deleted", {
      deletedEmployeeId: id,
      deletedEmployeeEmail: employee.email,
      deletedEmployeeRole: employee.role,
      deletedEmployeeDepartment: employee.department,
    });

    return res.json({ message: "Employee deleted successfully." });
  } catch (error) {
    console.error("DELETE /api/employees/:id error:", error.message);
    return res.status(500).json({ message: "Could not delete employee." });
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
'''

