from pathlib import Path

request_quote_js = r'''import express from "express";
import QuoteRequest from "../models/QuoteRequest.js";

import {
  employeeAuthRequired,
  departmentRequired,
  writeEmployeeLog,
} from "./employees.js";

const router = express.Router();

function clean(value = "") {
  return String(value || "").trim();
}

function isValidEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function normalizeFinanceStatus(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "awaiting proof") return "Awaiting Proof";
  if (v === "under review") return "Under Review";
  if (v === "approved") return "Approved";
  if (v === "rejected") return "Rejected";
  if (v === "refunded") return "Refunded";

  return "Pending";
}

function normalizeQuoteStatus(value = "") {
  const v = String(value || "").trim().toLowerCase();

  if (v === "contacted") return "Contacted";
  if (v === "closed") return "Closed";

  return "New";
}

/* =========================================================
   PUBLIC: CREATE QUOTE REQUEST
   POST /api/request-quote
========================================================= */

router.post("/", async (req, res) => {
  try {
    const {
      fullName,
      email,
      cellphone,
      phone,
      grade,
      subject,
      package: selectedPackage,
      packagePlan,
      amount,
      message,
    } = req.body;

    const finalPhone = clean(cellphone || phone);
    const finalPackage = clean(selectedPackage || packagePlan);

    if (
      !clean(fullName) ||
      !clean(email) ||
      !finalPhone ||
      !clean(grade) ||
      !clean(subject) ||
      !finalPackage
    ) {
      return res.status(400).json({
        message: "Please complete all required fields.",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        message: "Please enter a valid email address.",
      });
    }

    const quote = await QuoteRequest.create({
      fullName: clean(fullName),
      email: clean(email).toLowerCase(),
      cellphone: finalPhone,
      grade: clean(grade),
      subject: clean(subject),
      package: finalPackage,
      amount: Number(amount) || 0,
      message: clean(message),

      contacted: false,
      paid: false,
      financeStatus: "Pending",
      status: "New",
      notes: "",
    });

    return res.status(201).json({
      message: "Quote request submitted successfully.",
      quoteId: quote._id,
      quote,
    });
  } catch (err) {
    console.error("POST /api/request-quote error:", err);

    return res.status(500).json({
      message: "Server error.",
    });
  }
});

/* =========================================================
   FINANCE: GET ALL QUOTE REQUESTS
   GET /api/request-quote
========================================================= */

router.get(
  "/",
  employeeAuthRequired,
  departmentRequired("finance"),
  async (req, res) => {
    try {
      const filter = {};

      if (req.query.status) {
        filter.status = normalizeQuoteStatus(req.query.status);
      }

      if (req.query.financeStatus) {
        filter.financeStatus = normalizeFinanceStatus(req.query.financeStatus);
      }

      if (req.query.contacted === "true") {
        filter.contacted = true;
      }

      if (req.query.contacted === "false") {
        filter.contacted = false;
      }

      if (req.query.paid === "true") {
        filter.paid = true;
      }

      if (req.query.paid === "false") {
        filter.paid = false;
      }

      if (req.query.q || req.query.search) {
        const term = clean(req.query.q || req.query.search);
        const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

        filter.$or = [
          { fullName: rx },
          { email: rx },
          { cellphone: rx },
          { grade: rx },
          { subject: rx },
          { package: rx },
          { message: rx },
          { notes: rx },
        ];
      }

      const quotes = await QuoteRequest.find(filter)
        .sort({ createdAt: -1 })
        .lean();

      return res.json(quotes);
    } catch (err) {
      console.error("GET /api/request-quote error:", err);

      return res.status(500).json({
        message: "Could not load quote requests.",
      });
    }
  }
);

/* =========================================================
   FINANCE: GET SINGLE QUOTE REQUEST
   GET /api/request-quote/:id
========================================================= */

router.get(
  "/:id",
  employeeAuthRequired,
  departmentRequired("finance"),
  async (req, res) => {
    try {
      const quote = await QuoteRequest.findById(req.params.id).lean();

      if (!quote) {
        return res.status(404).json({
          message: "Quote request not found.",
        });
      }

      return res.json(quote);
    } catch (err) {
      console.error("GET /api/request-quote/:id error:", err);

      return res.status(500).json({
        message: "Could not load quote request.",
      });
    }
  }
);

/* =========================================================
   FINANCE: UPDATE QUOTE REQUEST
   PATCH /api/request-quote/:id
========================================================= */

router.patch(
  "/:id",
  employeeAuthRequired,
  departmentRequired("finance"),
  async (req, res) => {
    try {
      const quote = await QuoteRequest.findById(req.params.id);

      if (!quote) {
        return res.status(404).json({
          message: "Quote request not found.",
        });
      }

      if ("fullName" in req.body) {
        quote.fullName = clean(req.body.fullName);
      }

      if ("email" in req.body) {
        if (!isValidEmail(req.body.email)) {
          return res.status(400).json({
            message: "Please enter a valid email address.",
          });
        }

        quote.email = clean(req.body.email).toLowerCase();
      }

      if ("cellphone" in req.body) {
        quote.cellphone = clean(req.body.cellphone);
      }

      if ("phone" in req.body) {
        quote.cellphone = clean(req.body.phone);
      }

      if ("grade" in req.body) {
        quote.grade = clean(req.body.grade);
      }

      if ("subject" in req.body) {
        quote.subject = clean(req.body.subject);
      }

      if ("package" in req.body) {
        quote.package = clean(req.body.package);
      }

      if ("packagePlan" in req.body) {
        quote.package = clean(req.body.packagePlan);
      }

      if ("amount" in req.body) {
        quote.amount = Number(req.body.amount) || 0;
      }

      if ("message" in req.body) {
        quote.message = clean(req.body.message);
      }

      if ("notes" in req.body) {
        quote.notes = clean(req.body.notes);
      }

      if ("contacted" in req.body) {
        quote.contacted = !!req.body.contacted;
      }

      if ("paid" in req.body) {
        quote.paid = !!req.body.paid;
      }

      if ("financeStatus" in req.body) {
        quote.financeStatus = normalizeFinanceStatus(req.body.financeStatus);
      }

      if ("status" in req.body) {
        quote.status = normalizeQuoteStatus(req.body.status);
      }

      if (quote.contacted && quote.status === "New") {
        quote.status = "Contacted";
      }

      if (quote.paid) {
        quote.financeStatus = "Approved";
      }

      await quote.save();

      await writeEmployeeLog(req, "quote_request_updated", {
        quoteRequestId: quote._id,
        email: quote.email,
        contacted: quote.contacted,
        paid: quote.paid,
        financeStatus: quote.financeStatus,
        status: quote.status,
      });

      return res.json({
        message: "Quote request updated successfully.",
        quote,
      });
    } catch (err) {
      console.error("PATCH /api/request-quote/:id error:", err);

      return res.status(500).json({
        message: "Could not update quote request.",
      });
    }
  }
);

/* =========================================================
   FINANCE: DELETE QUOTE REQUEST
   DELETE /api/request-quote/:id
========================================================= */

router.delete(
  "/:id",
  employeeAuthRequired,
  departmentRequired("finance"),
  async (req, res) => {
    try {
      const quote = await QuoteRequest.findById(req.params.id);

      if (!quote) {
        return res.status(404).json({
          message: "Quote request not found.",
        });
      }

      await QuoteRequest.deleteOne({ _id: quote._id });

      await writeEmployeeLog(req, "quote_request_deleted", {
        quoteRequestId: quote._id,
        email: quote.email,
      });

      return res.json({
        message: "Quote request deleted successfully.",
      });
    } catch (err) {
      console.error("DELETE /api/request-quote/:id error:", err);

      return res.status(500).json({
        message: "Could not delete quote request.",
      });
    }
  }
);

export default router;
'''

Path("/mnt/data/requestQuote.js").write_text(request_quote_js, encoding="utf-8")
print("/mnt/data/requestQuote.js")
