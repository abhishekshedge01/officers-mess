import { getDB } from "../config/db.js";

export const auditLogger = (req, res, next) => {
  if (req.path === "/" || req.path.startsWith("/assets")) {
    return next();
  }

  const start = Date.now();

  res.on("finish", async () => {
    try {
      const durationMs = Date.now() - start;
      const db = getDB();
      if (!db) return;

      let user = null;
      if (req.user) {
        user = {
          id: req.user.id,
          role: req.user.role,
          rank: req.user.rank || "",
          name: req.user.name || "",
          email: req.user.email || req.body?.email || null,
          serviceId: req.user.serviceId || "",
        };
      } else if (req.body?.email) {
        user = {
          role: "GUEST",
          rank: req.body?.rank || "",
          name: req.body?.name || "",
          email: req.body?.email,
          serviceId: req.body?.serviceId || "",
        };
      }

      let eventType = "API_REQUEST";
      let description = req.method + " " + req.originalUrl + " -> " + res.statusCode;

      if (req.originalUrl.includes("/auth/login")) {
        eventType = res.statusCode === 200 ? "USER_LOGIN_SUCCESS" : "USER_LOGIN_FAILED";
        description = "Login attempt: " + (req.body?.email || "user");
      } else if (req.originalUrl.includes("/auth/register") || req.originalUrl.includes("/admin/users")) {
        eventType = "USER_CREATED";
        description = "Account created: " + (req.body?.email || req.body?.name || "new user");
      } else if (res.statusCode >= 400) {
        eventType = "API_ERROR";
        description = "API Error (" + res.statusCode + ") on " + req.method + " " + req.originalUrl;
      }

      await db.collection("audit_logs").insertOne({
        timestamp: new Date(),
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        user,
        ip: req.ip || req.headers["x-forwarded-for"] || "127.0.0.1",
        eventType,
        description,
        isError: res.statusCode >= 400,
      });
    } catch (err) {
      console.error("Audit log error:", err.message);
    }
  });

  next();
};
