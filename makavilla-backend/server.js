```javascript
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Resend } = require("resend");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// MAKA-VILLA BACKEND
// ============================================================
// Booking system + Resend email notifications
// ============================================================

console.log("=================================");
console.log("MAKA-VILLA BACKEND");
console.log("=================================");

// ------------------------------------------------------------
// RESEND EMAIL SERVICE
// ------------------------------------------------------------

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const NOTIFICATION_EMAIL =
  process.env.NOTIFICATION_EMAIL || "robii254.ke@gmail.com";

const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "Maka-Villa Website <onboarding@resend.dev>";

if (resend) {
  console.log("Email service: Resend ENABLED");
  console.log("Email sender:", RESEND_FROM_EMAIL);
  console.log("Notification email:", NOTIFICATION_EMAIL);
} else {
  console.log("Email service: Resend DISABLED");
  console.log("Missing RESEND_API_KEY");
}

// ------------------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------------------

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------------------------------------
// DATA FILE
// ------------------------------------------------------------

const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

function loadBookings() {
  try {
    if (!fs.existsSync(BOOKINGS_FILE)) {
      fs.writeFileSync(BOOKINGS_FILE, "[]", "utf8");
      return [];
    }

    const data = fs.readFileSync(BOOKINGS_FILE, "utf8");

    if (!data.trim()) {
      return [];
    }

    const bookings = JSON.parse(data);

    return Array.isArray(bookings) ? bookings : [];
  } catch (error) {
    console.error("Could not load bookings:", error.message);
    return [];
  }
}

function saveBookings(bookings) {
  try {
    fs.writeFileSync(
      BOOKINGS_FILE,
      JSON.stringify(bookings, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error("Could not save bookings:", error.message);
    return false;
  }
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function generateReference() {
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `MAKA-${random}`;
}

// Escape HTML so customer-provided information is safe in emails
function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ------------------------------------------------------------
// NORMALIZE BOOKING
// ------------------------------------------------------------

function normalizeBooking(body) {
  const details =
    body &&
    typeof body.details === "object" &&
    body.details !== null
      ? body.details
      : {};

  const booking = {
    name: clean(body?.name),

    phone: clean(body?.phone),

    email: clean(body?.email),

    type: clean(body?.type) || "Restaurant",

    // Restaurant / event date
    date: clean(body?.date),

    // Optional time
    time: clean(body?.time),

    // Restaurant / event
    guests:
      body?.guests !== undefined
        ? body.guests
        : details.guests !== undefined
        ? details.guests
        : "",

    // Accommodation
    checkin:
      clean(body?.checkin) ||
      clean(details.checkin) ||
      (clean(body?.type).toLowerCase() === "accommodation"
        ? clean(body?.date)
        : ""),

    checkout:
      clean(body?.checkout) ||
      clean(details.checkout),

    room:
      clean(body?.room) ||
      clean(details.room),

    message:
      clean(body?.message) ||
      clean(details.message),

    details
  };

  return booking;
}

// ------------------------------------------------------------
// BOOKING DETAILS FOR EMAIL
// ------------------------------------------------------------

function getBookingDetailsText(booking) {
  const type = clean(booking.type).toLowerCase();

  let text = "";

  text += `Booking Reference: ${booking.reference}\n`;
  text += `Customer Name: ${booking.name}\n`;
  text += `Phone: ${booking.phone}\n`;
  text += `Email: ${booking.email || "Not provided"}\n`;
  text += `Booking Type: ${booking.type}\n`;

  if (
    type === "restaurant" ||
    type === "restaurant booking" ||
    type === "meal" ||
    type === "table" ||
    type === "bar & lounge" ||
    type === "bar and lounge" ||
    type === "event / function" ||
    type === "event/function" ||
    type === "event"
  ) {
    text += `Number of Guests: ${booking.guests || "Not provided"}\n`;
    text += `Date: ${booking.date || "Not provided"}\n`;
    text += `Preferred Time: ${booking.time || "Not provided"}\n`;
  }

  if (
    type === "accommodation" ||
    type === "room" ||
    type === "hotel"
  ) {
    text += `Room Type: ${booking.room || "Not provided"}\n`;
    text += `Number of Guests: ${booking.guests || "Not provided"}\n`;
    text += `Check-in: ${booking.checkin || "Not provided"}\n`;
    text += `Check-out: ${booking.checkout || "Not provided"}\n`;
  }

  if (booking.message) {
    text += `Additional Message: ${booking.message}\n`;
  }

  text += `Status: ${booking.status}\n`;
  text += `Created: ${booking.createdAt}\n`;

  return text;
}

// ------------------------------------------------------------
// SEND BOOKING EMAILS
// ------------------------------------------------------------

async function sendBookingEmails(booking) {
  const result = {
    emailSent: false,
    notificationSent: false
  };

  if (!resend) {
    console.log("Email not sent because Resend is not configured.");

    return result;
  }

  const type = clean(booking.type) || "Booking";

  const detailsText = getBookingDetailsText(booking);

  // ----------------------------------------------------------
  // CUSTOMER EMAIL
  // ----------------------------------------------------------

  if (booking.email) {
    try {
      console.log(
        "Sending customer confirmation email to:",
        booking.email
      );

      const customerEmail = await resend.emails.send({
        from: RESEND_FROM_EMAIL,

        to: [booking.email],

        subject: `Maka-Villa Booking Confirmation - ${booking.reference}`,

        text:
`Hello ${booking.name},

Thank you for choosing Maka-Villa.

Your ${type.toLowerCase()} booking has been successfully received.

Booking Reference:
${booking.reference}

Please keep this reference number for checking your booking status.

BOOKING DETAILS
----------------
${detailsText}

Your booking is currently:
${booking.status}

A member of the Maka-Villa team will review your booking.

Thank you,
Maka-Villa Bar & Restaurant
Murang'a, Kenya
`
      });

      if (customerEmail?.error) {
        console.error(
          "Customer email error:",
          customerEmail.error
        );
      } else {
        result.emailSent = true;

        console.log(
          "CUSTOMER CONFIRMATION EMAIL SENT"
        );

        if (customerEmail?.data?.id) {
          console.log(
            "Customer email ID:",
            customerEmail.data.id
          );
        }
      }
    } catch (error) {
      console.error(
        "Customer email sending failed:",
        error.message
      );
    }
  } else {
    console.log(
      "Customer email not sent: customer did not provide an email address."
    );
  }

  // ----------------------------------------------------------
  // BUSINESS NOTIFICATION EMAIL
  // ----------------------------------------------------------

  if (NOTIFICATION_EMAIL) {
    try {
      console.log(
        "Sending booking notification to:",
        NOTIFICATION_EMAIL
      );

      const notificationEmail = await resend.emails.send({
        from: RESEND_FROM_EMAIL,

        to: [NOTIFICATION_EMAIL],

        subject: `NEW ${type.toUpperCase()} BOOKING - ${booking.reference}`,

        text:
`A new Maka-Villa booking has been received.

${detailsText}

Please log in to the Maka-Villa administration system to review and manage this booking.

Maka-Villa Bar & Restaurant
Murang'a, Kenya
`
      });

      if (notificationEmail?.error) {
        console.error(
          "Notification email error:",
          notificationEmail.error
        );
      } else {
        result.notificationSent = true;

        console.log(
          "BUSINESS NOTIFICATION EMAIL SENT"
        );

        if (notificationEmail?.data?.id) {
          console.log(
            "Notification email ID:",
            notificationEmail.data.id
          );
        }
      }
    } catch (error) {
      console.error(
        "Business notification email failed:",
        error.message
      );
    }
  }

  console.log(
    "Email results:",
    JSON.stringify(result)
  );

  return result;
}

// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({
    success: true,

    message: "Maka-Villa backend is running!",

    service:
      "Maka-Villa Bar, Restaurant & Accommodation",

    emailService: resend
      ? "Resend enabled"
      : "Resend disabled",

    endpoints: {
      bookings: "/api/bookings",
      publicStatus: "/api/bookings/:reference"
    }
  });
});

// ------------------------------------------------------------
// CREATE BOOKING
// ------------------------------------------------------------

app.post("/api/bookings", async (req, res) => {
  console.log("");
  console.log("=================================");
  console.log("NEW BOOKING REQUEST");
  console.log("=================================");

  console.log("Request body:");
  console.log(
    JSON.stringify(req.body, null, 2)
  );

  try {
    const body = req.body || {};

    const booking = normalizeBooking(body);

    console.log("Normalized booking:");

    console.log(
      JSON.stringify(booking, null, 2)
    );

    const bookingType =
      booking.type.toLowerCase();

    // --------------------------------------------------------
    // BASIC VALIDATION
    // --------------------------------------------------------

    if (!booking.name || !booking.phone) {
      console.log(
        "VALIDATION FAILED: name or phone missing"
      );

      return res.status(400).json({
        success: false,

        error:
          "Please provide your name and phone number."
      });
    }

    // --------------------------------------------------------
    // RESTAURANT / EVENT VALIDATION
    // --------------------------------------------------------

    if (
      bookingType === "restaurant" ||
      bookingType === "restaurant booking" ||
      bookingType === "meal" ||
      bookingType === "table" ||
      bookingType === "bar & lounge" ||
      bookingType === "bar and lounge" ||
      bookingType === "event / function" ||
      bookingType === "event/function" ||
      bookingType === "event"
    ) {
      if (!booking.date) {
        console.log(
          "VALIDATION FAILED: restaurant/event date missing"
        );

        return res.status(400).json({
          success: false,

          error:
            "Please provide the booking date."
        });
      }

      const guestsNumber =
        Number(booking.guests);

      if (
        booking.guests === "" ||
        booking.guests === null ||
        booking.guests === undefined ||
        !Number.isFinite(guestsNumber) ||
        guestsNumber < 1
      ) {
        console.log(
          "VALIDATION FAILED: guests missing or invalid"
        );

        return res.status(400).json({
          success: false,

          error:
            "Please provide the number of guests."
        });
      }

      booking.guests = guestsNumber;
    }

    // --------------------------------------------------------
    // ACCOMMODATION VALIDATION
    // --------------------------------------------------------

    if (
      bookingType === "accommodation" ||
      bookingType === "room" ||
      bookingType === "hotel"
    ) {
      if (!booking.checkin) {
        console.log(
          "VALIDATION FAILED: check-in missing"
        );

        return res.status(400).json({
          success: false,

          error:
            "Please provide the check-in date."
        });
      }

      if (!booking.checkout) {
        console.log(
          "VALIDATION FAILED: check-out missing"
        );

        return res.status(400).json({
          success: false,

          error:
            "Please provide the check-out date."
        });
      }

      const guestsNumber =
        Number(booking.guests);

      if (
        booking.guests !== "" &&
        booking.guests !== null &&
        booking.guests !== undefined
      ) {
        if (
          !Number.isFinite(guestsNumber) ||
          guestsNumber < 1
        ) {
          return res.status(400).json({
            success: false,

            error:
              "Please provide a valid number of guests."
          });
        }

        booking.guests = guestsNumber;
      }
    }

    // --------------------------------------------------------
    // CREATE BOOKING RECORD
    // --------------------------------------------------------

    const bookings = loadBookings();

    const id =
      bookings.length > 0
        ? Math.max(
            ...bookings.map(
              (item) =>
                Number(item.id) || 0
            )
          ) + 1
        : 1;

    const reference =
      generateReference();

    const newBooking = {
      id,

      reference,

      name: booking.name,

      phone: booking.phone,

      email: booking.email,

      type: booking.type,

      date: booking.date,

      time: booking.time,

      guests: booking.guests,

      checkin: booking.checkin,

      checkout: booking.checkout,

      room: booking.room,

      message: booking.message,

      details: booking.details,

      status: "Pending",

      createdAt:
        new Date().toISOString()
    };

    bookings.push(newBooking);

    const saved =
      saveBookings(bookings);

    if (!saved) {
      return res.status(500).json({
        success: false,

        error:
          "The booking could not be saved."
      });
    }

    console.log("");
    console.log(
      "BOOKING SAVED SUCCESSFULLY"
    );

    console.log(
      "Reference:",
      reference
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
      "Status: Pending"
    );

    console.log(
      "================================="
    );

    // --------------------------------------------------------
    // SEND EMAILS AFTER BOOKING IS SAVED
    // --------------------------------------------------------
    // Important:
    // If email sending fails, the booking still succeeds.
    // --------------------------------------------------------

    const emailResults =
      await sendBookingEmails(
        newBooking
      );

    // --------------------------------------------------------
    // SUCCESS RESPONSE
    // --------------------------------------------------------

    return res.status(201).json({
      success: true,

      message:
        "Booking received successfully.",

      reference,

      emailSent:
        emailResults.emailSent,

      notificationSent:
        emailResults.notificationSent,

      booking: {
        id: newBooking.id,

        reference:
          newBooking.reference,

        name:
          newBooking.name,

        phone:
          newBooking.phone,

        email:
          newBooking.email,

        type:
          newBooking.type,

        date:
          newBooking.date,

        time:
          newBooking.time,

        guests:
          newBooking.guests,

        checkin:
          newBooking.checkin,

        checkout:
          newBooking.checkout,

        room:
          newBooking.room,

        status:
          newBooking.status
      }
    });
  } catch (error) {
    console.error("");
    console.error(
      "BOOKING ERROR"
    );

    console.error(error);

    console.error("");

    return res.status(500).json({
      success: false,

      error:
        "An unexpected server error occurred.",

      details:
        process.env.NODE_ENV ===
        "development"
          ? error.message
          : undefined
    });
  }
});

// ------------------------------------------------------------
// GET ALL BOOKINGS
// ------------------------------------------------------------

app.get(
  "/api/bookings",
  (req, res) => {
    try {
      const bookings =
        loadBookings();

      res.json({
        success: true,

        count:
          bookings.length,

        bookings
      });
    } catch (error) {
      console.error(
        "Could not retrieve bookings:",
        error.message
      );

      res.status(500).json({
        success: false,

        error:
          "Could not retrieve bookings."
      });
    }
  }
);

// ------------------------------------------------------------
// PUBLIC BOOKING STATUS
// ------------------------------------------------------------

app.get(
  "/api/bookings/:reference",
  (req, res) => {
    try {
      const reference =
        clean(
          req.params.reference
        ).toUpperCase();

      const bookings =
        loadBookings();

      const booking =
        bookings.find(
          (item) =>
            clean(item.reference)
              .toUpperCase() ===
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

          status:
            booking.status,

          createdAt:
            booking.createdAt
        }
      });
    } catch (error) {
      console.error(
        "Status lookup error:",
        error.message
      );

      res.status(500).json({
        success: false,

        error:
          "Could not check booking status."
      });
    }
  }
);

// ------------------------------------------------------------
// ADMIN LOGIN
// ------------------------------------------------------------

app.post(
  "/api/admin/login",
  (req, res) => {
    const username =
      clean(
        req.body?.username
      );

    const password =
      clean(
        req.body?.password
      );

    const adminUsername =
      process.env.ADMIN_USERNAME ||
      "admin";

    const adminPassword =
      process.env.ADMIN_PASSWORD ||
      "makavilla123";

    if (
      username === adminUsername &&
      password === adminPassword
    ) {
      return res.json({
        success: true,

        message:
          "Login successful."
      });
    }

    return res.status(401).json({
      success: false,

      error:
        "Invalid username or password."
    });
  }
);

// ------------------------------------------------------------
// UPDATE BOOKING STATUS
// ------------------------------------------------------------

app.patch(
  "/api/bookings/:reference/status",
  (req, res) => {
    try {
      const reference =
        clean(
          req.params.reference
        ).toUpperCase();

      const status =
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
          status
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
          (item) =>
            clean(item.reference)
              .toUpperCase() ===
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
        status;

      bookings[index].updatedAt =
        new Date().toISOString();

      saveBookings(bookings);

      res.json({
        success: true,

        message:
          "Booking status updated.",

        booking:
          bookings[index]
      });
    } catch (error) {
      console.error(
        "Status update error:",
        error.message
      );

      res.status(500).json({
        success: false,

        error:
          "Could not update booking status."
      });
    }
  }
);

// ------------------------------------------------------------
// 404
// ------------------------------------------------------------

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,

      error:
        "Endpoint not found."
    });
  }
);

// ------------------------------------------------------------
// ERROR HANDLER
// ------------------------------------------------------------

app.use(
  (error, req, res, next) => {
    console.error(
      "Unhandled server error:",
      error
    );

    res.status(500).json({
      success: false,

      error:
        "Internal server error."
    });
  }
);

// ------------------------------------------------------------
// START SERVER
// ------------------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "Server running on http://localhost:" +
        PORT
    );

    console.log(
      "Admin API: /api/admin/login"
    );

    console.log(
      "Bookings API: /api/bookings"
    );

    console.log(
      "Public status API: /api/bookings/:reference"
    );

    console.log(
      "Accommodation management: ENABLED"
    );

    console.log(
      "Email service:",
      resend
        ? "RESEND ENABLED"
        : "RESEND DISABLED"
    );

    console.log(
      "Waiting for bookings..."
    );

    console.log(
      "================================="
    );
  }
);
```
