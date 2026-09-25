const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Resend } = require("resend");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

/* =========================================================
   CONFIGURATION
========================================================= */

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const NOTIFICATION_EMAIL =
  process.env.NOTIFICATION_EMAIL || "robii254.ke@gmail.com";

const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "Maka-Villa Website <onboarding@resend.dev>";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const ADMIN_PANEL_URL =
  process.env.ADMIN_PANEL_URL ||
  "http://localhost:5500/admin.html";

/*
  Session lifetime:
  8 hours
*/
const SESSION_DURATION = 8 * 60 * 60 * 1000;

/*
  Password reset lifetime:
  15 minutes
*/
const RESET_TOKEN_DURATION = 15 * 60 * 1000;

/* =========================================================
   DATA FILES
========================================================= */

const BOOKINGS_FILE = path.join(__dirname, "bookings.json");
const REVIEWS_FILE = path.join(__dirname, "reviews.json");
const USERS_FILE = path.join(__dirname, "users.json");

/* =========================================================
   IN-MEMORY SESSIONS / PASSWORD RESET TOKENS
========================================================= */

const sessions = new Map();
const passwordResetTokens = new Map();

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  cors({
    origin: true,
    credentials: false
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================================================
   GENERIC JSON HELPERS
========================================================= */

function loadJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        JSON.stringify(fallback, null, 2),
        "utf8"
      );
      return fallback;
    }

    const raw = fs.readFileSync(filePath, "utf8").trim();

    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error("Error reading JSON file:", filePath);
    console.error(error.message);

    return fallback;
  }
}

function saveJsonFile(filePath, data) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/* =========================================================
   BOOKINGS
========================================================= */

function loadBookings() {
  const data = loadJsonFile(BOOKINGS_FILE, []);

  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.bookings)) {
    return data.bookings;
  }

  return [];
}

function saveBookings(bookings) {
  saveJsonFile(BOOKINGS_FILE, bookings);
}

/* =========================================================
   REVIEWS
========================================================= */

function loadReviews() {
  const data = loadJsonFile(REVIEWS_FILE, []);

  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.reviews)) {
    return data.reviews;
  }

  return [];
}

function saveReviews(reviews) {
  saveJsonFile(REVIEWS_FILE, reviews);
}

/* =========================================================
   USERS
========================================================= */

function loadUsers() {
  const data = loadJsonFile(USERS_FILE, []);

  if (Array.isArray(data)) {
    return data;
  }

  if (data && Array.isArray(data.users)) {
    return data.users;
  }

  return [];
}

function saveUsers(users) {
  saveJsonFile(USERS_FILE, users);
}

/* =========================================================
   BASIC HELPERS
========================================================= */

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generateReference() {
  return `MAKA-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function generateReviewId() {
  return `REV-${crypto
    .randomBytes(5)
    .toString("hex")
    .toUpperCase()}`;
}

function generateUserId() {
  return `USR-${crypto
    .randomBytes(5)
    .toString("hex")
    .toUpperCase()}`;
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

/* =========================================================
   PASSWORD HASHING
========================================================= */

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");

    crypto.scrypt(
      password,
      salt,
      64,
      {
        N: 16384,
        r: 8,
        p: 1
      },
      (error, derivedKey) => {
        if (error) {
          return reject(error);
        }

        resolve(
          `scrypt:${salt}:${derivedKey.toString("hex")}`
        );
      }
    );
  });
}

function verifyPassword(password, storedHash) {
  return new Promise((resolve) => {
    try {
      if (!storedHash || !storedHash.startsWith("scrypt:")) {
        return resolve(false);
      }

      const parts = storedHash.split(":");

      if (parts.length !== 3) {
        return resolve(false);
      }

      const salt = parts[1];
      const storedKey = Buffer.from(parts[2], "hex");

      crypto.scrypt(
        password,
        salt,
        storedKey.length,
        {
          N: 16384,
          r: 8,
          p: 1
        },
        (error, derivedKey) => {
          if (error) {
            return resolve(false);
          }

          if (derivedKey.length !== storedKey.length) {
            return resolve(false);
          }

          resolve(
            crypto.timingSafeEqual(
              derivedKey,
              storedKey
            )
          );
        }
      );
    } catch (error) {
      resolve(false);
    }
  });
}

/* =========================================================
   ADMIN USER BOOTSTRAP
========================================================= */

async function ensureFirstAdmin() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.warn(
      "WARNING: ADMIN_USERNAME or ADMIN_PASSWORD is not configured in Render."
    );

    return;
  }

  let users = loadUsers();

  const existing = users.find(
    (user) =>
      user.username.toLowerCase() ===
      ADMIN_USERNAME.toLowerCase()
  );

  if (!existing) {
    const passwordHash = await hashPassword(
      ADMIN_PASSWORD
    );

    const firstAdmin = {
      id: generateUserId(),
      name: "Maka-Villa Administrator",
      username: ADMIN_USERNAME,
      email: NOTIFICATION_EMAIL,
      passwordHash,
      role: "admin",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.push(firstAdmin);
    saveUsers(users);

    console.log(
      `First administrator account created: ${ADMIN_USERNAME}`
    );

    return;
  }

  /*
    If the Render ADMIN_PASSWORD changes,
    keep the first admin synchronized.
  */
  const passwordMatches = await verifyPassword(
    ADMIN_PASSWORD,
    existing.passwordHash
  );

  if (!passwordMatches) {
    existing.passwordHash = await hashPassword(
      ADMIN_PASSWORD
    );

    existing.active = true;
    existing.updatedAt = new Date().toISOString();

    saveUsers(users);

    console.log(
      `Administrator password synchronized for: ${ADMIN_USERNAME}`
    );
  }
}

/* =========================================================
   SESSION HELPERS
========================================================= */

function createSession(user) {
  const token = generateSessionToken();

  sessions.set(token, {
    userId: user.id,
    username: user.username,
    role: user.role,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION
  });

  return token;
}

function getBearerToken(req) {
  const authorization = clean(
    req.headers.authorization
  );

  if (!authorization) {
    return "";
  }

  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.substring(7).trim();
}

function getSession(req) {
  const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  return {
    token,
    ...session
  };
}

/* =========================================================
   ADMIN AUTHENTICATION MIDDLEWARE
========================================================= */

function requireAdmin(req, res, next) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json({
      success: false,
      error: "Authentication required."
    });
  }

  const users = loadUsers();

  const user = users.find(
    (item) => item.id === session.userId
  );

  if (!user || user.active === false) {
    return res.status(401).json({
      success: false,
      error: "Your account is no longer active."
    });
  }

  req.adminUser = user;
  req.adminSession = session;

  next();
}

/* =========================================================
   ADMIN ROLE CHECK
========================================================= */

function requireAdminRole(req, res, next) {
  if (
    !req.adminUser ||
    req.adminUser.role !== "admin"
  ) {
    return res.status(403).json({
      success: false,
      error: "Administrator permission required."
    });
  }

  next();
}

/* =========================================================
   BOOKING NORMALIZATION
========================================================= */

function normalizeBooking(body) {
  const type = clean(
    body?.type ||
      body?.bookingType ||
      body?.service
  );

  return {
    name: clean(body?.name),
    phone: clean(
      body?.phone ||
        body?.telephone ||
        body?.whatsapp
    ),
    email: clean(body?.email),
    type,
    date: clean(body?.date),
    time: clean(body?.time),
    guests: clean(
      body?.guests ||
        body?.people ||
        body?.numberOfGuests
    ),
    checkin: clean(
      body?.checkin ||
        body?.checkIn ||
        body?.arrival
    ),
    checkout: clean(
      body?.checkout ||
        body?.checkOut ||
        body?.departure
    ),
    room: clean(
      body?.room ||
        body?.roomType
    ),
    message: clean(
      body?.message ||
        body?.request ||
        body?.notes
    ),
    details:
      body?.details &&
      typeof body.details === "object"
        ? body.details
        : {}
  };
}

/* =========================================================
   BOOKING DETAILS FOR EMAIL
========================================================= */

function getBookingDetailsText(booking) {
  const lines = [
    `Reference: ${booking.reference}`,
    `Name: ${booking.name}`,
    `Phone: ${booking.phone}`,
    `Email: ${booking.email || "Not provided"}`,
    `Type: ${booking.type || "Not specified"}`,
    `Status: ${booking.status || "Pending"}`
  ];

  if (booking.date) {
    lines.push(`Date: ${booking.date}`);
  }

  if (booking.time) {
    lines.push(`Time: ${booking.time}`);
  }

  if (booking.guests) {
    lines.push(`Guests: ${booking.guests}`);
  }

  if (booking.checkin) {
    lines.push(`Check-in: ${booking.checkin}`);
  }

  if (booking.checkout) {
    lines.push(`Check-out: ${booking.checkout}`);
  }

  if (booking.room) {
    lines.push(`Room: ${booking.room}`);
  }

  if (booking.message) {
    lines.push(`Request: ${booking.message}`);
  }

  return lines.join("\n");
}

/* =========================================================
   EMAIL SENDING
========================================================= */

async function sendBookingEmails(booking) {
  if (!resend) {
    console.warn(
      "Resend is not configured. Booking emails skipped."
    );

    return {
      emailSent: false,
      notificationSent: false
    };
  }

  let emailSent = false;
  let notificationSent = false;

  const bookingText =
    getBookingDetailsText(booking);

  /*
    CUSTOMER EMAIL
  */

  if (booking.email) {
    try {
      console.log(
        `Sending customer email to: ${booking.email}`
      );

      const customerResult =
        await resend.emails.send({
          from: RESEND_FROM_EMAIL,
          to: [booking.email],
          subject:
            `Maka-Villa Booking Received - ${booking.reference}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;line-height:1.6;color:#222;">
              <h2 style="color:#8a6a28;">
                Maka-Villa
              </h2>

              <p>Hello ${escapeHtml(
                booking.name
              )},</p>

              <p>
                Thank you for making a booking request
                with Maka-Villa.
              </p>

              <div style="
                background:#f7f4ed;
                padding:20px;
                border-radius:10px;
                margin:20px 0;
              ">
                <h3>Your Booking</h3>

                <p>
                  <strong>Reference:</strong>
                  ${escapeHtml(
                    booking.reference
                  )}
                </p>

                <p>
                  <strong>Type:</strong>
                  ${escapeHtml(
                    booking.type
                  )}
                </p>

                <p>
                  <strong>Date:</strong>
                  ${escapeHtml(
                    booking.date ||
                      booking.checkin ||
                      "Not specified"
                  )}
                </p>

                ${
                  booking.time
                    ? `
                      <p>
                        <strong>Time:</strong>
                        ${escapeHtml(
                          booking.time
                        )}
                      </p>
                    `
                    : ""
                }

                ${
                  booking.guests
                    ? `
                      <p>
                        <strong>Guests:</strong>
                        ${escapeHtml(
                          booking.guests
                        )}
                      </p>
                    `
                    : ""
                }

                ${
                  booking.checkout
                    ? `
                      <p>
                        <strong>Check-out:</strong>
                        ${escapeHtml(
                          booking.checkout
                        )}
                      </p>
                    `
                    : ""
                }

                ${
                  booking.room
                    ? `
                      <p>
                        <strong>Room:</strong>
                        ${escapeHtml(
                          booking.room
                        )}
                      </p>
                    `
                    : ""
                }
              </div>

              <p>
                Your request has been received and is
                currently <strong>Pending</strong>.
              </p>

              <p>
                Please keep your booking reference:
              </p>

              <p style="
                font-size:22px;
                font-weight:bold;
                letter-spacing:2px;
              ">
                ${escapeHtml(
                  booking.reference
                )}
              </p>

              <p>
                We will contact you with confirmation.
              </p>

              <p>
                Regards,<br>
                <strong>Maka-Villa</strong>
              </p>
            </div>
          `
        });

      if (customerResult?.data?.id) {
        emailSent = true;

        console.log(
          "CUSTOMER CONFIRMATION EMAIL SENT"
        );

        console.log(
          "Customer email ID:",
          customerResult.data.id
        );
      } else if (!customerResult?.error) {
        emailSent = true;

        console.log(
          "CUSTOMER CONFIRMATION EMAIL SENT"
        );
      }
    } catch (error) {
      console.error(
        "Customer email error:",
        error.message
      );
    }
  }

  /*
    BUSINESS NOTIFICATION
  */

  try {
    console.log(
      `Sending business notification to: ${NOTIFICATION_EMAIL}`
    );

    const notificationResult =
      await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: [NOTIFICATION_EMAIL],
        subject:
          `NEW Maka-Villa Booking - ${booking.reference}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto;">
            <h2 style="color:#8a6a28;">
              New Maka-Villa Booking
            </h2>

            <p>
              A new booking has been submitted.
            </p>

            <div style="
              background:#f7f4ed;
              padding:20px;
              border-radius:10px;
            ">
              <pre style="
                white-space:pre-wrap;
                font-family:Arial,sans-serif;
                line-height:1.7;
              ">${escapeHtml(
                bookingText
              )}</pre>
            </div>
          </div>
        `
      });

    if (notificationResult?.data?.id) {
      notificationSent = true;

      console.log(
        "BUSINESS NOTIFICATION EMAIL SENT"
      );

      console.log(
        "Notification email ID:",
        notificationResult.data.id
      );
    } else if (!notificationResult?.error) {
      notificationSent = true;

      console.log(
        "BUSINESS NOTIFICATION EMAIL SENT"
      );
    }
  } catch (error) {
    console.error(
      "Business notification email error:",
      error.message
    );
  }

  return {
    emailSent,
    notificationSent
  };
}

/* =========================================================
   SEND PASSWORD RESET EMAIL
========================================================= */

async function sendPasswordResetEmail(user, token) {
  if (!resend) {
    throw new Error(
      "Email service is not configured."
    );
  }

  const resetUrl =
    `${ADMIN_PANEL_URL}` +
    `?resetToken=${encodeURIComponent(token)}`;

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: [user.email],
    subject: "Maka-Villa Admin Password Reset",
    html: `
      <div style="
        font-family:Arial,sans-serif;
        max-width:650px;
        margin:auto;
        color:#222;
        line-height:1.6;
      ">

        <h2 style="color:#8a6a28;">
          Maka-Villa Admin
        </h2>

        <p>
          Hello ${escapeHtml(
            user.name || user.username
          )},
        </p>

        <p>
          A password reset was requested for your
          Maka-Villa administrator account.
        </p>

        <p>
          Use the button below to create a new password.
        </p>

        <p style="margin:30px 0;">
          <a
            href="${escapeHtml(resetUrl)}"
            style="
              display:inline-block;
              padding:14px 24px;
              background:#8a6a28;
              color:#fff;
              text-decoration:none;
              border-radius:8px;
              font-weight:bold;
            "
          >
            Reset Password
          </a>
        </p>

        <p>
          This reset link expires in
          <strong>15 minutes</strong>.
        </p>

        <p>
          If you did not request this reset,
          you can ignore this email.
        </p>

        <p>
          Regards,<br>
          <strong>Maka-Villa</strong>
        </p>
      </div>
    `
  });
}

/* =========================================================
   HEALTH / HOME
========================================================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "Maka-Villa backend is running!",
    service:
      "Maka-Villa Bar, Restaurant & Accommodation",
    emailService: resend
      ? "Resend enabled"
      : "Resend disabled",
    reviewsService: "Enabled",
    adminService: "Enabled",
    endpoints: {
      bookings: "/api/bookings",
      publicStatus:
        "/api/bookings/:reference",
      reviews: "/api/reviews",
      adminLogin:
        "/api/admin/login",
      adminBookings:
        "/api/admin/bookings",
      adminStats:
        "/api/admin/stats",
      adminReviews:
        "/api/admin/reviews"
    }
  });
});

/* =========================================================
   CUSTOMER BOOKING
========================================================= */

app.post("/api/bookings", async (req, res) => {
  try {
    console.log("\n==============================");
    console.log("NEW BOOKING REQUEST");
    console.log("==============================");

    console.log(
      "Request body:",
      JSON.stringify(
        req.body,
        null,
        2
      )
    );

    const bookingData =
      normalizeBooking(req.body);

    console.log(
      "Normalized booking:",
      JSON.stringify(
        bookingData,
        null,
        2
      )
    );

    if (!bookingData.name) {
      return res.status(400).json({
        success: false,
        error: "Name is required."
      });
    }

    if (!bookingData.phone) {
      return res.status(400).json({
        success: false,
        error: "Phone number is required."
      });
    }

    const typeLower =
      bookingData.type.toLowerCase();

    const isAccommodation =
      typeLower.includes(
        "accommodation"
      ) ||
      typeLower.includes("room") ||
      typeLower.includes("stay");

    const isRestaurant =
      typeLower.includes(
        "restaurant"
      ) ||
      typeLower.includes("bar") ||
      typeLower.includes("event") ||
      typeLower.includes("dining");

    if (isAccommodation) {
      if (
        !bookingData.checkin ||
        !bookingData.checkout
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Check-in and check-out dates are required for accommodation bookings."
        });
      }
    }

    if (isRestaurant) {
      if (!bookingData.date) {
        return res.status(400).json({
          success: false,
          error:
            "Booking date is required."
        });
      }

      const guests =
        Number(bookingData.guests);

      if (
        !Number.isFinite(guests) ||
        guests < 1
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Number of guests must be at least 1."
        });
      }
    }

    const bookings = loadBookings();

    const booking = {
      id: crypto
        .randomUUID(),
      reference:
        generateReference(),
      ...bookingData,
      status: "Pending",
      createdAt:
        new Date().toISOString(),
      updatedAt:
        new Date().toISOString()
    };

    bookings.push(booking);

    saveBookings(bookings);

    console.log(
      "\nBOOKING SAVED SUCCESSFULLY"
    );

    console.log(
      "Reference:",
      booking.reference
    );

    console.log(
      "Customer:",
      booking.name
    );

    console.log(
      "Phone:",
      booking.phone
    );

    console.log(
      "Type:",
      booking.type
    );

    console.log(
      "Status:",
      booking.status
    );

    const emailResults =
      await sendBookingEmails(
        booking
      );

    console.log(
      "Email results:",
      JSON.stringify(
        emailResults
      )
    );

    return res.status(201).json({
      success: true,
      message:
        "Booking submitted successfully.",
      reference:
        booking.reference,
      emailSent:
        emailResults.emailSent,
      notificationSent:
        emailResults.notificationSent,
      booking
    });
  } catch (error) {
    console.error(
      "BOOKING ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Unable to process booking.",
      details:
        process.env.NODE_ENV ===
        "production"
          ? undefined
          : error.message
    });
  }
});

/* =========================================================
   PUBLIC BOOKINGS
========================================================= */

app.get("/api/bookings", (req, res) => {
  const bookings = loadBookings();

  res.json({
    success: true,
    count: bookings.length,
    bookings
  });
});

/* =========================================================
   PUBLIC BOOKING STATUS
========================================================= */

app.get(
  "/api/bookings/:reference",
  (req, res) => {
    const reference =
      clean(
        req.params.reference
      ).toUpperCase();

    const bookings =
      loadBookings();

    const booking =
      bookings.find(
        (item) =>
          String(
            item.reference || ""
          ).toUpperCase() ===
          reference
      );

    if (!booking) {
      return res.status(404).json({
        success: false,
        error:
          "Booking not found."
      });
    }

    res.json({
      success: true,
      booking: {
        reference:
          booking.reference,
        name:
          booking.name,
        type:
          booking.type,
        status:
          booking.status,
        date:
          booking.date,
        time:
          booking.time,
        guests:
          booking.guests,
        checkin:
          booking.checkin,
        checkout:
          booking.checkout,
        room:
          booking.room,
        createdAt:
          booking.createdAt,
        updatedAt:
          booking.updatedAt
      }
    });
  }
);

/* =========================================================
   PUBLIC REVIEWS
========================================================= */

app.get("/api/reviews", (req, res) => {
  try {
    const reviews =
      loadReviews()
        .sort(
          (a, b) =>
            new Date(
              b.createdAt
            ) -
            new Date(
              a.createdAt
            )
        );

    const totalRating =
      reviews.reduce(
        (sum, review) =>
          sum +
          Number(
            review.rating || 0
          ),
        0
      );

    const averageRating =
      reviews.length
        ? Number(
            (
              totalRating /
              reviews.length
            ).toFixed(1)
          )
        : 0;

    res.json({
      success: true,
      count: reviews.length,
      averageRating,
      reviews
    });
  } catch (error) {
    console.error(
      "GET REVIEWS ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        "Unable to load reviews."
    });
  }
});

/* =========================================================
   ADD PUBLIC REVIEW
========================================================= */

app.post("/api/reviews", (req, res) => {
  try {
    const name =
      clean(
        req.body?.name
      );

    const comment =
      clean(
        req.body?.comment ||
          req.body?.review ||
          req.body?.message
      );

    const rating =
      Number(
        req.body?.rating
      );

    if (!name) {
      return res.status(400).json({
        success: false,
        error:
          "Name is required."
      });
    }

    if (name.length > 80) {
      return res.status(400).json({
        success: false,
        error:
          "Name is too long."
      });
    }

    if (
      !Number.isInteger(
        rating
      ) ||
      rating < 1 ||
      rating > 5
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Rating must be between 1 and 5."
      });
    }

    if (
      comment.length < 5
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Review must contain at least 5 characters."
      });
    }

    if (
      comment.length > 1000
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Review is too long."
      });
    }

    const reviews =
      loadReviews();

    const review = {
      id:
        generateReviewId(),
      name,
      rating,
      comment,
      createdAt:
        new Date().toISOString()
    };

    reviews.push(review);

    saveReviews(reviews);

    res.status(201).json({
      success: true,
      message:
        "Review submitted successfully.",
      review
    });
  } catch (error) {
    console.error(
      "ADD REVIEW ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        "Unable to submit review."
    });
  }
});

/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post(
  "/api/admin/login",
  async (req, res) => {
    try {
      const username =
        clean(
          req.body?.username
        );

      const password =
        clean(
          req.body?.password
        );

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error:
            "Username and password are required."
        });
      }

      let users =
        loadUsers();

      /*
        FIRST ADMIN BOOTSTRAP

        The Render environment variables
        remain valid as the original
        administrator credentials.
      */

      if (
        ADMIN_USERNAME &&
        ADMIN_PASSWORD &&
        username ===
          ADMIN_USERNAME &&
        password ===
          ADMIN_PASSWORD
      ) {
        let user =
          users.find(
            (item) =>
              item.username.toLowerCase() ===
              username.toLowerCase()
          );

        if (!user) {
          user = {
            id:
              generateUserId(),
            name:
              "Maka-Villa Administrator",
            username,
            email:
              NOTIFICATION_EMAIL,
            passwordHash:
              await hashPassword(
                password
              ),
            role: "admin",
            active: true,
            createdAt:
              new Date().toISOString(),
            updatedAt:
              new Date().toISOString()
          };

          users.push(user);
          saveUsers(users);
        } else {
          user.passwordHash =
            await hashPassword(
              password
            );

          user.active = true;
          user.role = "admin";
          user.updatedAt =
            new Date().toISOString();

          saveUsers(users);
        }

        const token =
          createSession(
            user
          );

        return res.json({
          success: true,
          message:
            "Login successful.",
          token,
          user: {
            id:
              user.id,
            name:
              user.name,
            username:
              user.username,
            email:
              user.email,
            role:
              user.role
          }
        });
      }

      /*
        NORMAL USER LOGIN
      */

      const user =
        users.find(
          (item) =>
            item.username.toLowerCase() ===
              username.toLowerCase() &&
            item.active !== false
        );

      if (!user) {
        return res.status(401).json({
          success: false,
          error:
            "Invalid username or password."
        });
      }

      const passwordCorrect =
        await verifyPassword(
          password,
          user.passwordHash
        );

      if (!passwordCorrect) {
        return res.status(401).json({
          success: false,
          error:
            "Invalid username or password."
        });
      }

      const token =
        createSession(
          user
        );

      res.json({
        success: true,
        message:
          "Login successful.",
        token,
        user: {
          id:
            user.id,
          name:
            user.name,
          username:
            user.username,
          email:
            user.email,
          role:
            user.role
        }
      });
    } catch (error) {
      console.error(
        "ADMIN LOGIN ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to process login."
      });
    }
  }
);

/* =========================================================
   CURRENT ADMIN USER
========================================================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  (req, res) => {
    res.json({
      success: true,
      user: {
        id:
          req.adminUser.id,
        name:
          req.adminUser.name,
        username:
          req.adminUser.username,
        email:
          req.adminUser.email,
        role:
          req.adminUser.role
      }
    });
  }
);

/* =========================================================
   ADMIN LOGOUT
========================================================= */

app.post(
  "/api/admin/logout",
  requireAdmin,
  (req, res) => {
    sessions.delete(
      req.adminSession.token
    );

    res.json({
      success: true,
      message:
        "Logged out successfully."
    });
  }
);

/* =========================================================
   ADMIN BOOKINGS
========================================================= */

app.get(
  "/api/admin/bookings",
  requireAdmin,
  (req, res) => {
    try {
      const bookings =
        loadBookings();

      bookings.sort(
        (a, b) =>
          new Date(
            b.createdAt || 0
          ) -
          new Date(
            a.createdAt || 0
          )
      );

      res.json({
        success: true,
        count: bookings.length,
        bookings
      });
    } catch (error) {
      console.error(
        "ADMIN BOOKINGS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load bookings."
      });
    }
  }
);

/* =========================================================
   ADMIN STATS
========================================================= */

app.get(
  "/api/admin/stats",
  requireAdmin,
  (req, res) => {
    try {
      const bookings =
        loadBookings();

      const stats = {
        total: bookings.length,
        restaurant: 0,
        accommodation: 0,
        pending: 0,
        confirmed: 0,
        cancelled: 0,
        completed: 0,
        today: 0,
        upcoming: 0
      };

      const today =
        new Date()
          .toISOString()
          .split("T")[0];

      bookings.forEach(
        (booking) => {
          const type =
            clean(
              booking.type
            ).toLowerCase();

          const status =
            clean(
              booking.status ||
                "Pending"
            ).toLowerCase();

          if (
            type.includes(
              "restaurant"
            ) ||
            type.includes("bar") ||
            type.includes("dining") ||
            type.includes("event")
          ) {
            stats.restaurant++;
          }

          if (
            type.includes(
              "accommodation"
            ) ||
            type.includes("room") ||
            type.includes("stay")
          ) {
            stats.accommodation++;
          }

          if (
            status ===
            "pending"
          ) {
            stats.pending++;
          }

          if (
            status ===
            "confirmed"
          ) {
            stats.confirmed++;
          }

          if (
            status ===
            "cancelled"
          ) {
            stats.cancelled++;
          }

          if (
            status ===
            "completed"
          ) {
            stats.completed++;
          }

          const bookingDate =
            clean(
              booking.date ||
                booking.checkin
            );

          if (
            bookingDate ===
            today
          ) {
            stats.today++;
          }

          if (
            bookingDate &&
            bookingDate >
              today
          ) {
            stats.upcoming++;
          }
        }
      );

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error(
        "ADMIN STATS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load statistics."
      });
    }
  }
);

/* =========================================================
   ADMIN UPDATE BOOKING STATUS
========================================================= */

app.patch(
  "/api/admin/bookings/:reference",
  requireAdmin,
  async (req, res) => {
    try {
      const reference =
        clean(
          req.params.reference
        ).toUpperCase();

      const newStatus =
        clean(
          req.body?.status
        );

      const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Cancelled",
        "Completed"
      ];

      if (
        !allowedStatuses.includes(
          newStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid booking status."
        });
      }

      const bookings =
        loadBookings();

      const index =
        bookings.findIndex(
          (booking) =>
            String(
              booking.reference ||
                ""
            ).toUpperCase() ===
            reference
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          error:
            "Booking not found."
        });
      }

      bookings[index].status =
        newStatus;

      bookings[index].updatedAt =
        new Date().toISOString();

      saveBookings(
        bookings
      );

      res.json({
        success: true,
        message:
          "Booking status updated.",
        booking:
          bookings[index]
      });
    } catch (error) {
      console.error(
        "UPDATE BOOKING STATUS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update booking status."
      });
    }
  }
);

/* =========================================================
   OLD STATUS ENDPOINT
   KEPT FOR COMPATIBILITY
========================================================= */

app.patch(
  "/api/bookings/:reference/status",
  requireAdmin,
  async (req, res) => {
    try {
      const reference =
        clean(
          req.params.reference
        ).toUpperCase();

      const newStatus =
        clean(
          req.body?.status
        );

      const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Cancelled",
        "Completed"
      ];

      if (
        !allowedStatuses.includes(
          newStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid booking status."
        });
      }

      const bookings =
        loadBookings();

      const index =
        bookings.findIndex(
          (booking) =>
            String(
              booking.reference ||
                ""
            ).toUpperCase() ===
            reference
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          error:
            "Booking not found."
        });
      }

      bookings[index].status =
        newStatus;

      bookings[index].updatedAt =
        new Date().toISOString();

      saveBookings(
        bookings
      );

      res.json({
        success: true,
        message:
          "Booking status updated.",
        booking:
          bookings[index]
      });
    } catch (error) {
      console.error(
        "STATUS UPDATE ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update booking status."
      });
    }
  }
);

/* =========================================================
   ADMIN REVIEWS
========================================================= */

app.get(
  "/api/admin/reviews",
  requireAdmin,
  (req, res) => {
    try {
      const reviews =
        loadReviews()
          .sort(
            (a, b) =>
              new Date(
                b.createdAt
              ) -
              new Date(
                a.createdAt
              )
          );

      res.json({
        success: true,
        count:
          reviews.length,
        reviews
      });
    } catch (error) {
      console.error(
        "ADMIN REVIEWS ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load reviews."
      });
    }
  }
);

/* =========================================================
   DELETE REVIEW
========================================================= */

app.delete(
  "/api/admin/reviews/:id",
  requireAdmin,
  requireAdminRole,
  (req, res) => {
    try {
      const reviewId =
        clean(
          req.params.id
        );

      const reviews =
        loadReviews();

      const index =
        reviews.findIndex(
          (review) =>
            review.id ===
            reviewId
        );

      if (index === -1) {
        return res.status(404).json({
          success: false,
          error:
            "Review not found."
        });
      }

      const deletedReview =
        reviews[index];

      reviews.splice(
        index,
        1
      );

      saveReviews(
        reviews
      );

      res.json({
        success: true,
        message:
          "Review deleted successfully.",
        review:
          deletedReview
      });
    } catch (error) {
      console.error(
        "DELETE REVIEW ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete review."
      });
    }
  }
);

/* =========================================================
   CREATE STAFF / ADMIN ACCOUNT
========================================================= */

app.post(
  "/api/admin/users",
  requireAdmin,
  requireAdminRole,
  async (req, res) => {
    try {
      const name =
        clean(
          req.body?.name
        );

      const username =
        clean(
          req.body?.username
        );

      const email =
        clean(
          req.body?.email
        );

      const password =
        clean(
          req.body?.password
        );

      const requestedRole =
        clean(
          req.body?.role
        ).toLowerCase();

      const role =
        requestedRole ===
        "admin"
          ? "admin"
          : "staff";

      if (!name) {
        return res.status(400).json({
          success: false,
          error:
            "Name is required."
        });
      }

      if (
        username.length < 3
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Username must contain at least 3 characters."
        });
      }

      if (!email) {
        return res.status(400).json({
          success: false,
          error:
            "Email is required."
        });
      }

      if (
        !password ||
        password.length < 8
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Password must contain at least 8 characters."
        });
      }

      const users =
        loadUsers();

      const usernameExists =
        users.some(
          (user) =>
            user.username.toLowerCase() ===
            username.toLowerCase()
        );

      if (usernameExists) {
        return res.status(409).json({
          success: false,
          error:
            "That username already exists."
        });
      }

      const emailExists =
        users.some(
          (user) =>
            user.email.toLowerCase() ===
            email.toLowerCase()
        );

      if (emailExists) {
        return res.status(409).json({
          success: false,
          error:
            "That email is already registered."
        });
      }

      const passwordHash =
        await hashPassword(
          password
        );

      const user = {
        id:
          generateUserId(),
        name,
        username,
        email,
        passwordHash,
        role,
        active: true,
        createdAt:
          new Date().toISOString(),
        updatedAt:
          new Date().toISOString()
      };

      users.push(user);

      saveUsers(users);

      res.status(201).json({
        success: true,
        message:
          "Account created successfully.",
        user: {
          id:
            user.id,
          name:
            user.name,
          username:
            user.username,
          email:
            user.email,
          role:
            user.role,
          active:
            user.active,
          createdAt:
            user.createdAt
        }
      });
    } catch (error) {
      console.error(
        "CREATE USER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create account."
      });
    }
  }
);

/* =========================================================
   LIST ADMIN USERS
========================================================= */

app.get(
  "/api/admin/users",
  requireAdmin,
  requireAdminRole,
  (req, res) => {
    const users =
      loadUsers();

    const safeUsers =
      users.map(
        (user) => ({
          id:
            user.id,
          name:
            user.name,
          username:
            user.username,
          email:
            user.email,
          role:
            user.role,
          active:
            user.active,
          createdAt:
            user.createdAt
        })
      );

    res.json({
      success: true,
      count:
        safeUsers.length,
      users:
        safeUsers
    });
  }
);

/* =========================================================
   ENABLE / DISABLE ADMIN USER
========================================================= */

app.patch(
  "/api/admin/users/:id",
  requireAdmin,
  requireAdminRole,
  (req, res) => {
    try {
      const userId =
        clean(
          req.params.id
        );

      const active =
        req.body?.active;

      if (
        typeof active !==
        "boolean"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Active must be true or false."
        });
      }

      const users =
        loadUsers();

      const user =
        users.find(
          (item) =>
            item.id ===
            userId
        );

      if (!user) {
        return res.status(404).json({
          success: false,
          error:
            "User not found."
        });
      }

      /*
        Do not allow the currently
        logged-in administrator to
        accidentally disable their own account.
      */

      if (
        user.id ===
        req.adminUser.id &&
        active === false
      ) {
        return res.status(400).json({
          success: false,
          error:
            "You cannot disable your own account."
        });
      }

      user.active =
        active;

      user.updatedAt =
        new Date().toISOString();

      saveUsers(users);

      res.json({
        success: true,
        message:
          "User account updated.",
        user: {
          id:
            user.id,
          name:
            user.name,
          username:
            user.username,
          email:
            user.email,
          role:
            user.role,
          active:
            user.active
        }
      });
    } catch (error) {
      console.error(
        "UPDATE USER ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update user."
      });
    }
  }
);

/* =========================================================
   FORGOT PASSWORD
========================================================= */

app.post(
  "/api/admin/forgot-password",
  async (req, res) => {
    try {
      const identifier =
        clean(
          req.body?.email ||
            req.body?.username
        );

      /*
        Always return the same
        message so the endpoint
        does not reveal whether
        an account exists.
      */

      const genericMessage =
        "If an administrator account matches those details, a password reset email has been sent.";

      if (!identifier) {
        return res.json({
          success: true,
          message:
            genericMessage
        });
      }

      const users =
        loadUsers();

      const user =
        users.find(
          (item) =>
            item.email.toLowerCase() ===
              identifier.toLowerCase() ||
            item.username.toLowerCase() ===
              identifier.toLowerCase()
        );

      if (!user || user.active === false) {
        return res.json({
          success: true,
          message:
            genericMessage
        });
      }

      if (!user.email) {
        return res.json({
          success: true,
          message:
            genericMessage
        });
      }

      const token =
        generateResetToken();

      passwordResetTokens.set(
        token,
        {
          userId:
            user.id,
          expiresAt:
            Date.now() +
            RESET_TOKEN_DURATION
        }
      );

      try {
        await sendPasswordResetEmail(
          user,
          token
        );
      } catch (emailError) {
        passwordResetTokens.delete(
          token
        );

        console.error(
          "PASSWORD RESET EMAIL ERROR:",
          emailError
        );

        /*
          Still use generic
          response to the client.
        */
      }

      res.json({
        success: true,
        message:
          genericMessage
      });
    } catch (error) {
      console.error(
        "FORGOT PASSWORD ERROR:",
        error
      );

      res.json({
        success: true,
        message:
          "If an administrator account matches those details, a password reset email has been sent."
      });
    }
  }
);

/* =========================================================
   CHECK PASSWORD RESET TOKEN
========================================================= */

app.get(
  "/api/admin/reset-password/:token",
  (req, res) => {
    const token =
      clean(
        req.params.token
      );

    const reset =
      passwordResetTokens.get(
        token
      );

    if (!reset) {
      return res.status(400).json({
        success: false,
        error:
          "This password reset link is invalid or has expired."
      });
    }

    if (
      Date.now() >
      reset.expiresAt
    ) {
      passwordResetTokens.delete(
        token
      );

      return res.status(400).json({
        success: false,
        error:
          "This password reset link has expired."
      });
    }

    res.json({
      success: true,
      message:
        "Password reset token is valid."
    });
  }
);

/* =========================================================
   RESET PASSWORD
========================================================= */

app.post(
  "/api/admin/reset-password",
  async (req, res) => {
    try {
      const token =
        clean(
          req.body?.token
        );

      const newPassword =
        clean(
          req.body?.password
        );

      if (!token) {
        return res.status(400).json({
          success: false,
          error:
            "Reset token is required."
        });
      }

      if (
        !newPassword ||
        newPassword.length < 8
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Password must contain at least 8 characters."
        });
      }

      const reset =
        passwordResetTokens.get(
          token
        );

      if (!reset) {
        return res.status(400).json({
          success: false,
          error:
            "This password reset link is invalid or has expired."
        });
      }

      if (
        Date.now() >
        reset.expiresAt
      ) {
        passwordResetTokens.delete(
          token
        );

        return res.status(400).json({
          success: false,
          error:
            "This password reset link has expired."
        });
      }

      const users =
        loadUsers();

      const user =
        users.find(
          (item) =>
            item.id ===
            reset.userId
        );

      if (!user) {
        passwordResetTokens.delete(
          token
        );

        return res.status(400).json({
          success: false,
          error:
            "Account not found."
        });
      }

      user.passwordHash =
        await hashPassword(
          newPassword
        );

      user.updatedAt =
        new Date().toISOString();

      saveUsers(users);

      /*
        One-time reset token.
      */

      passwordResetTokens.delete(
        token
      );

      /*
        Invalidate any existing
        sessions belonging to this
        user.
      */

      for (
        const [
          sessionToken,
          session
        ] of sessions.entries()
      ) {
        if (
          session.userId ===
          user.id
        ) {
          sessions.delete(
            sessionToken
          );
        }
      }

      res.json({
        success: true,
        message:
          "Password reset successfully. You can now log in with your new password."
      });
    } catch (error) {
      console.error(
        "RESET PASSWORD ERROR:",
        error
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to reset password."
      });
    }
  }
);

/* =========================================================
   CLEAN EXPIRED SESSIONS
========================================================= */

setInterval(() => {
  const now =
    Date.now();

  for (
    const [
      token,
      session
    ] of sessions.entries()
  ) {
    if (
      now >
      session.expiresAt
    ) {
      sessions.delete(
        token
      );
    }
  }

  for (
    const [
      token,
      reset
    ] of passwordResetTokens.entries()
  ) {
    if (
      now >
      reset.expiresAt
    ) {
      passwordResetTokens.delete(
        token
      );
    }
  }
}, 10 * 60 * 1000);

/* =========================================================
   404 HANDLER
========================================================= */

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,
      error:
        "Endpoint not found."
    });
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(
      "SERVER ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        "Internal server error."
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  try {
    await ensureFirstAdmin();

    app.listen(
      PORT,
      () => {
        console.log("");
        console.log(
          "=========================================="
        );
        console.log(
          "       MAKA-VILLA BACKEND SERVER"
        );
        console.log(
          "=========================================="
        );
        console.log(
          `Server running on port ${PORT}`
        );
        console.log(
          `Email service: ${
            resend
              ? "ENABLED"
              : "DISABLED"
          }`
        );
        console.log(
          "Reviews API: /api/reviews"
        );
        console.log(
          "Admin login: /api/admin/login"
        );
        console.log(
          "Admin bookings: /api/admin/bookings"
        );
        console.log(
          "Admin stats: /api/admin/stats"
        );
        console.log(
          "Admin reviews: /api/admin/reviews"
        );
        console.log(
          "Admin users: /api/admin/users"
        );
        console.log(
          "Password reset: ENABLED"
        );
        console.log(
          "=========================================="
        );
        console.log("");
      }
    );
  } catch (error) {
    console.error(
      "FAILED TO START SERVER:",
      error
    );

    process.exit(1);
  }
}

startServer();