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
// Booking System + Reviews + Resend Email Notifications
// ============================================================

console.log("=================================");
console.log("MAKA-VILLA BACKEND");
console.log("=================================");

// ============================================================
// RESEND EMAIL CONFIGURATION
// ============================================================

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
  console.log("RESEND_API_KEY is missing");
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors({ origin: true }));

app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({ extended: true }));

// ============================================================
// DATA FILES
// ============================================================

const BOOKINGS_FILE =
  path.join(__dirname, "bookings.json");

const REVIEWS_FILE =
  path.join(__dirname, "reviews.json");

// ============================================================
// GENERIC FILE HELPERS
// ============================================================

function loadJsonFile(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        JSON.stringify(defaultValue, null, 2),
        "utf8"
      );

      return defaultValue;
    }

    const data =
      fs.readFileSync(filePath, "utf8");

    if (!data.trim()) {
      return defaultValue;
    }

    const parsed =
      JSON.parse(data);

    return parsed;
  } catch (error) {
    console.error(
      "Could not load JSON file:",
      filePath,
      error.message
    );

    return defaultValue;
  }
}

function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    return true;
  } catch (error) {
    console.error(
      "Could not save JSON file:",
      filePath,
      error.message
    );

    return false;
  }
}

// ============================================================
// BOOKINGS
// ============================================================

function loadBookings() {
  const bookings =
    loadJsonFile(
      BOOKINGS_FILE,
      []
    );

  return Array.isArray(bookings)
    ? bookings
    : [];
}

function saveBookings(bookings) {
  return saveJsonFile(
    BOOKINGS_FILE,
    bookings
  );
}

// ============================================================
// REVIEWS
// ============================================================

function loadReviews() {
  const reviews =
    loadJsonFile(
      REVIEWS_FILE,
      []
    );

  return Array.isArray(reviews)
    ? reviews
    : [];
}

function saveReviews(reviews) {
  return saveJsonFile(
    REVIEWS_FILE,
    reviews
  );
}

// ============================================================
// HELPERS
// ============================================================

function clean(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value).trim();
}

// ============================================================
// GENERATE BOOKING REFERENCE
// ============================================================

function generateReference() {
  const random =
    crypto
      .randomBytes(3)
      .toString("hex")
      .toUpperCase();

  return `MAKA-${random}`;
}

// ============================================================
// GENERATE REVIEW ID
// ============================================================

function generateReviewId() {
  return (
    "REV-" +
    crypto
      .randomBytes(5)
      .toString("hex")
      .toUpperCase()
  );
}

// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================================
// NORMALIZE BOOKING
// ============================================================

function normalizeBooking(body) {
  const details =
    body &&
    typeof body.details === "object" &&
    body.details !== null
      ? body.details
      : {};

  return {
    name: clean(body?.name),

    phone: clean(body?.phone),

    email: clean(body?.email),

    type:
      clean(body?.type) ||
      "Restaurant",

    date: clean(body?.date),

    time: clean(body?.time),

    guests:
      body?.guests !== undefined
        ? body.guests
        : details.guests !== undefined
        ? details.guests
        : "",

    checkin:
      clean(body?.checkin) ||
      clean(details.checkin) ||
      (
        clean(body?.type).toLowerCase() ===
        "accommodation"
          ? clean(body?.date)
          : ""
      ),

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
}

// ============================================================
// EMAIL DETAILS
// ============================================================

function getBookingDetailsText(booking) {
  const type =
    clean(booking.type).toLowerCase();

  let text = "";

  text += `Booking Reference: ${booking.reference}\n`;
  text += `Customer Name: ${booking.name}\n`;
  text += `Phone: ${booking.phone}\n`;
  text += `Email: ${
    booking.email || "Not provided"
  }\n`;
  text += `Booking Type: ${booking.type}\n`;

  // Restaurant / Bar / Event
  if (
    type === "restaurant" ||
    type === "restaurant booking" ||
    type === "meal" ||
    type === "table" ||
    type === "bar & lounge" ||
    type === "bar and lounge" ||
    type === "event" ||
    type === "event / function" ||
    type === "event/function"
  ) {
    text += `Number of Guests: ${
      booking.guests || "Not provided"
    }\n`;

    text += `Date: ${
      booking.date || "Not provided"
    }\n`;

    text += `Preferred Time: ${
      booking.time || "Not provided"
    }\n`;
  }

  // Accommodation
  if (
    type === "accommodation" ||
    type === "room" ||
    type === "hotel"
  ) {
    text += `Room Type: ${
      booking.room || "Not provided"
    }\n`;

    text += `Number of Guests: ${
      booking.guests || "Not provided"
    }\n`;

    text += `Check-in: ${
      booking.checkin || "Not provided"
    }\n`;

    text += `Check-out: ${
      booking.checkout || "Not provided"
    }\n`;
  }

  if (booking.message) {
    text += `Additional Message: ${booking.message}\n`;
  }

  text += `Status: ${
    booking.status || "Pending"
  }\n`;

  text += `Created: ${
    booking.createdAt || ""
  }\n`;

  return text;
}

// ============================================================
// SEND BOOKING EMAILS
// ============================================================

async function sendBookingEmails(booking) {
  const result = {
    emailSent: false,
    notificationSent: false
  };

  if (!resend) {
    console.log(
      "Email sending skipped: Resend is not configured."
    );

    return result;
  }

  const bookingType =
    booking.type || "Booking";

  const details =
    getBookingDetailsText(booking);

  // ==========================================================
  // CUSTOMER CONFIRMATION EMAIL
  // ==========================================================

  if (booking.email) {
    try {
      console.log(
        "Sending customer email to:",
        booking.email
      );

      const customerResult =
        await resend.emails.send({
          from: RESEND_FROM_EMAIL,

          to: [booking.email],

          subject:
            `Maka-Villa Booking Confirmation - ${booking.reference}`,

          text:
`Hello ${booking.name},

Thank you for choosing Maka-Villa.

Your ${bookingType.toLowerCase()} booking has been successfully received.

BOOKING REFERENCE
${booking.reference}

Please keep this reference number for checking your booking status.

BOOKING DETAILS
================
${details}

Your booking is currently:

Pending

A member of the Maka-Villa team will review your booking.

A confirmation has been sent to this email address.

Thank you,

Maka-Villa Bar & Restaurant
Murang'a, Kenya
`
        });

      if (customerResult?.error) {
        console.error(
          "Customer email error:",
          customerResult.error
        );
      } else {
        result.emailSent = true;

        console.log(
          "CUSTOMER CONFIRMATION EMAIL SENT"
        );

        if (customerResult?.data?.id) {
          console.log(
            "Customer email ID:",
            customerResult.data.id
          );
        }
      }
    } catch (error) {
      console.error(
        "Customer email failed:",
        error.message
      );
    }
  } else {
    console.log(
      "Customer email skipped: no customer email provided."
    );
  }

  // ==========================================================
  // BUSINESS NOTIFICATION EMAIL
  // ==========================================================

  if (NOTIFICATION_EMAIL) {
    try {
      console.log(
        "Sending business notification to:",
        NOTIFICATION_EMAIL
      );

      const notificationResult =
        await resend.emails.send({
          from: RESEND_FROM_EMAIL,

          to: [NOTIFICATION_EMAIL],

          subject:
            `NEW ${bookingType.toUpperCase()} BOOKING - ${booking.reference}`,

          text:
`NEW MAKA-VILLA BOOKING

A new booking has been received through the Maka-Villa website.

BOOKING DETAILS
================
${details}

Please review this booking in the Maka-Villa administration system.

Maka-Villa Bar & Restaurant
Murang'a, Kenya
`
        });

      if (notificationResult?.error) {
        console.error(
          "Business notification error:",
          notificationResult.error
        );
      } else {
        result.notificationSent = true;

        console.log(
          "BUSINESS NOTIFICATION EMAIL SENT"
        );

        if (notificationResult?.data?.id) {
          console.log(
            "Notification email ID:",
            notificationResult.data.id
          );
        }
      }
    } catch (error) {
      console.error(
        "Business notification failed:",
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

// ============================================================
// HEALTH CHECK
// ============================================================

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

    reviewsService:
      "Enabled",

    endpoints: {
      bookings:
        "/api/bookings",

      publicStatus:
        "/api/bookings/:reference",

      reviews:
        "/api/reviews"
    }
  });
});

// ============================================================
// CREATE BOOKING
// ============================================================

app.post(
  "/api/bookings",
  async (req, res) => {
    console.log("");
    console.log(
      "================================="
    );

    console.log(
      "NEW BOOKING REQUEST"
    );

    console.log(
      "================================="
    );

    console.log("Request body:");

    console.log(
      JSON.stringify(
        req.body,
        null,
        2
      )
    );

    try {
      const body =
        req.body || {};

      const booking =
        normalizeBooking(body);

      console.log(
        "Normalized booking:"
      );

      console.log(
        JSON.stringify(
          booking,
          null,
          2
        )
      );

      const bookingType =
        booking.type.toLowerCase();

      // ======================================================
      // BASIC VALIDATION
      // ======================================================

      if (
        !booking.name ||
        !booking.phone
      ) {
        return res.status(400).json({
          success: false,

          error:
            "Please provide your name and phone number."
        });
      }

      // ======================================================
      // RESTAURANT / BAR / EVENT VALIDATION
      // ======================================================

      if (
        bookingType === "restaurant" ||
        bookingType ===
          "restaurant booking" ||
        bookingType === "meal" ||
        bookingType === "table" ||
        bookingType ===
          "bar & lounge" ||
        bookingType ===
          "bar and lounge" ||
        bookingType === "event" ||
        bookingType ===
          "event / function" ||
        bookingType ===
          "event/function"
      ) {
        if (!booking.date) {
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
          !Number.isFinite(
            guestsNumber
          ) ||
          guestsNumber < 1
        ) {
          return res.status(400).json({
            success: false,

            error:
              "Please provide the number of guests."
          });
        }

        booking.guests =
          guestsNumber;
      }

      // ======================================================
      // ACCOMMODATION VALIDATION
      // ======================================================

      if (
        bookingType ===
          "accommodation" ||
        bookingType === "room" ||
        bookingType === "hotel"
      ) {
        if (!booking.checkin) {
          return res.status(400).json({
            success: false,

            error:
              "Please provide the check-in date."
          });
        }

        if (!booking.checkout) {
          return res.status(400).json({
            success: false,

            error:
              "Please provide the check-out date."
          });
        }

        if (
          booking.guests !== "" &&
          booking.guests !== null &&
          booking.guests !== undefined
        ) {
          const guestsNumber =
            Number(booking.guests);

          if (
            !Number.isFinite(
              guestsNumber
            ) ||
            guestsNumber < 1
          ) {
            return res.status(400).json({
              success: false,

              error:
                "Please provide a valid number of guests."
            });
          }

          booking.guests =
            guestsNumber;
        }
      }

      // ======================================================
      // CREATE BOOKING
      // ======================================================

      const bookings =
        loadBookings();

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

        name:
          booking.name,

        phone:
          booking.phone,

        email:
          booking.email,

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

        message:
          booking.message,

        details:
          booking.details,

        status:
          "Pending",

        createdAt:
          new Date().toISOString()
      };

      bookings.push(
        newBooking
      );

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

      // ======================================================
      // SEND EMAILS
      // ======================================================

      const emailResults =
        await sendBookingEmails(
          newBooking
        );

      // ======================================================
      // SUCCESS RESPONSE
      // ======================================================

      return res.status(201).json({
        success: true,

        message:
          "Booking received successfully.",

        reference:

          reference,

        emailSent:
          emailResults.emailSent,

        notificationSent:
          emailResults.notificationSent,

        booking: {
          id:
            newBooking.id,

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
  }
);

// ============================================================
// GET ALL BOOKINGS
// ============================================================

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

// ============================================================
// PUBLIC BOOKING STATUS
// ============================================================

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
            clean(
              item.reference
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

// ============================================================
// REVIEWS
// ============================================================

// ------------------------------------------------------------
// GET ALL REVIEWS
// ------------------------------------------------------------

app.get(
  "/api/reviews",
  (req, res) => {
    try {
      const reviews =
        loadReviews();

      // Newest reviews first
      reviews.sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );

      const total =
        reviews.length;

      const average =
        total > 0
          ? reviews.reduce(
              (sum, review) =>
                sum +
                Number(review.rating),
              0
            ) / total
          : 0;

      res.json({
        success: true,

        count:
          total,

        averageRating:
          Number(
            average.toFixed(1)
          ),

        reviews
      });
    } catch (error) {
      console.error(
        "Could not retrieve reviews:",
        error.message
      );

      res.status(500).json({
        success: false,

        error:
          "Could not retrieve reviews."
      });
    }
  }
);

// ------------------------------------------------------------
// CREATE REVIEW
// ------------------------------------------------------------

app.post(
  "/api/reviews",
  (req, res) => {
    try {
      console.log("");
      console.log(
        "================================="
      );

      console.log(
        "NEW REVIEW REQUEST"
      );

      console.log(
        "================================="
      );

      console.log(
        JSON.stringify(
          req.body,
          null,
          2
        )
      );

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

      // ======================================================
      // VALIDATION
      // ======================================================

      if (!name) {
        return res.status(400).json({
          success: false,

          error:
            "Please enter your name."
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
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          success: false,

          error:
            "Please select a rating from 1 to 5 stars."
        });
      }

      if (!comment) {
        return res.status(400).json({
          success: false,

          error:
            "Please write a review."
        });
      }

      if (comment.length < 5) {
        return res.status(400).json({
          success: false,

          error:
            "Please write a little more about your experience."
        });
      }

      if (comment.length > 1000) {
        return res.status(400).json({
          success: false,

          error:
            "Your review is too long."
        });
      }

      // ======================================================
      // LOAD REVIEWS
      // ======================================================

      const reviews =
        loadReviews();

      // ======================================================
      // CREATE REVIEW
      // ======================================================

      const newReview = {
        id:
          generateReviewId(),

        name,

        rating,

        comment,

        createdAt:
          new Date().toISOString()
      };

      reviews.push(
        newReview
      );

      const saved =
        saveReviews(reviews);

      if (!saved) {
        return res.status(500).json({
          success: false,

          error:
            "Your review could not be saved. Please try again."
        });
      }

      console.log(
        "REVIEW SAVED SUCCESSFULLY"
      );

      console.log(
        "Review ID:",
        newReview.id
      );

      console.log(
        "Reviewer:",
        newReview.name
      );

      console.log(
        "Rating:",
        newReview.rating
      );

      console.log(
        "================================="
      );

      return res.status(201).json({
        success: true,

        message:
          "Thank you for sharing your experience.",

        review:
          newReview
      });
    } catch (error) {
      console.error(
        "Review creation error:",
        error.message
      );

      return res.status(500).json({
        success: false,

        error:
          "An unexpected error occurred while saving your review."
      });
    }
  }
);

// ============================================================
// ADMIN LOGIN
// ============================================================

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
      username ===
        adminUsername &&
      password ===
        adminPassword
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

// ============================================================
// UPDATE BOOKING STATUS
// ============================================================

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
            clean(
              item.reference
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
        status;

      bookings[index].updatedAt =
        new Date().toISOString();

      const saved =
        saveBookings(bookings);

      if (!saved) {
        return res.status(500).json({
          success: false,

          error:
            "Could not save booking status."
        });
      }

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

// ============================================================
// 404 HANDLER
// ============================================================

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,

      error:
        "Endpoint not found."
    });
  }
);

// ============================================================
// ERROR HANDLER
// ============================================================

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

// ============================================================
// START SERVER
// ============================================================

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
      "Reviews API: /api/reviews"
    );

    console.log(
      "Accommodation management: ENABLED"
    );

    console.log(
      "Reviews management: ENABLED"
    );

    console.log(
      "Email service:",
      resend
        ? "RESEND ENABLED"
        : "RESEND DISABLED"
    );

    console.log(
      "Waiting for bookings and reviews..."
    );

    console.log(
      "================================="
    );
  }
);