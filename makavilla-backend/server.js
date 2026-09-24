const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

/* ========================================
   CORS
======================================== */

app.use(cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "x-admin-username",
        "x-admin-password"
    ]
}));

app.use(express.json());


/* ========================================
   BOOKINGS FILE
======================================== */

const bookingsFile = path.join(__dirname, "bookings.json");

if (!fs.existsSync(bookingsFile)) {
    fs.writeFileSync(bookingsFile, "[]");
}


/* ========================================
   HELPER FUNCTIONS
======================================== */

function readBookings() {
    try {
        return JSON.parse(
            fs.readFileSync(bookingsFile, "utf8")
        );
    } catch (error) {
        console.error("Could not read bookings:", error);
        return [];
    }
}


function saveBookings(bookings) {
    fs.writeFileSync(
        bookingsFile,
        JSON.stringify(bookings, null, 2)
    );
}


function createBookingReference(id) {
    return `MAKA-${id}`;
}


/* ========================================
   HOME / HEALTH CHECK
======================================== */

app.get("/", (req, res) => {

    res.json({
        success: true,
        message: "Maka-Villa backend is running successfully.",
        service: "Maka-Villa Bar, Restaurant & Accommodation",
        status: "online"
    });

});


/* ========================================
   CUSTOMER BOOKING
======================================== */

app.post("/api/bookings", async (req, res) => {

    console.log("");
    console.log("=================================");
    console.log("NEW BOOKING REQUEST");
    console.log("=================================");

    try {

        console.log("Received data:");
        console.log(req.body);

        const {
            name,
            phone,
            email,
            type,
            guests,
            date,
            time,
            message,
            details,

            roomType,
            rooms,
            checkin,
            checkout

        } = req.body;


        /* ========================================
           BASIC VALIDATION
        ======================================== */

        if (!name) {

            return res.status(400).json({
                success: false,
                message: "Please provide your name."
            });

        }


        if (!phone) {

            return res.status(400).json({
                success: false,
                message: "Please provide your phone number."
            });

        }


        if (!type) {

            return res.status(400).json({
                success: false,
                message: "Please select a booking type."
            });

        }


        const allowedTypes = [
            "Restaurant",
            "Accommodation"
        ];


        if (!allowedTypes.includes(type)) {

            return res.status(400).json({
                success: false,
                message: "Invalid booking type."
            });

        }


        /* ========================================
           RESTAURANT BOOKING
        ======================================== */

        if (type === "Restaurant") {

            if (!date) {

                return res.status(400).json({
                    success: false,
                    message: "Please provide the reservation date."
                });

            }


            if (!guests) {

                return res.status(400).json({
                    success: false,
                    message: "Please provide the number of guests."
                });

            }


            /* Time is optional for now */

            const restaurantGuests =
                Number(guests);


            if (
                !Number.isInteger(restaurantGuests) ||
                restaurantGuests < 1
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Number of guests must be at least 1."
                });

            }


            /* ========================================
               CREATE RESTAURANT BOOKING
            ======================================== */

            const bookings =
                readBookings();


            const bookingId =
                Date.now();


            const newBooking = {

                id: bookingId,

                reference:
                    createBookingReference(bookingId),

                name:
                    String(name).trim(),

                phone:
                    String(phone).trim(),

                email:
                    email
                        ? String(email).trim()
                        : "Not provided",

                type:
                    "Restaurant",

                guests:
                    restaurantGuests,

                date:
                    String(date).trim(),

                time:
                    time
                        ? String(time).trim()
                        : "Not specified",

                message:
                    message
                        ? String(message).trim()
                        : "None",

                roomType: null,

                rooms: null,

                checkin: null,

                checkout: null,

                status:
                    "Pending",

                createdAt:
                    new Date().toISOString()

            };


            bookings.push(newBooking);

            saveBookings(bookings);


            console.log("");
            console.log("RESTAURANT BOOKING SAVED");
            console.log("---------------------------------");
            console.log("Reference:", newBooking.reference);
            console.log("Name:", newBooking.name);
            console.log("Phone:", newBooking.phone);
            console.log("Email:", newBooking.email);
            console.log("Date:", newBooking.date);
            console.log("Guests:", newBooking.guests);
            console.log("Status:", newBooking.status);
            console.log("---------------------------------");


            /*
             * Send admin email if configured.
             * Email failure will NOT cancel the booking.
             */

            await sendAdminBookingEmail(newBooking);


            return res.status(201).json({

                success: true,

                message:
                    "Restaurant booking received successfully.",

                reference:
                    newBooking.reference,

                booking:
                    newBooking

            });

        }


        /* ========================================
           ACCOMMODATION BOOKING
        ======================================== */

        if (type === "Accommodation") {


            /*
             * Accept accommodation information
             * from the new website format:
             *
             * details: {
             *   checkin,
             *   checkout
             * }
             */


            const accommodationCheckin =
                checkin ||
                (details && details.checkin);


            const accommodationCheckout =
                checkout ||
                (details && details.checkout);


            if (!accommodationCheckin) {

                return res.status(400).json({
                    success: false,
                    message: "Please provide the check-in date."
                });

            }


            if (!accommodationCheckout) {

                return res.status(400).json({
                    success: false,
                    message: "Please provide the check-out date."
                });

            }


            if (
                accommodationCheckout <=
                accommodationCheckin
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Check-out must be after check-in."
                });

            }


            /*
             * The new website currently does not
             * ask for room type or number of rooms.
             *
             * Therefore we use sensible defaults.
             */

            const accommodationRoomType =
                roomType ||
                "Standard Room";


            const accommodationRooms =
                rooms ||
                "1";


            const accommodationGuests =
                guests ||
                "1";


            const bookings =
                readBookings();


            const bookingId =
                Date.now();


            const newBooking = {

                id: bookingId,

                reference:
                    createBookingReference(bookingId),

                name:
                    String(name).trim(),

                phone:
                    String(phone).trim(),

                email:
                    email
                        ? String(email).trim()
                        : "Not provided",

                type:
                    "Accommodation",

                guests:
                    String(accommodationGuests),

                date:
                    String(accommodationCheckin).trim(),

                time:
                    time
                        ? String(time).trim()
                        : "Not specified",

                message:
                    message
                        ? String(message).trim()
                        : "None",

                roomType:
                    String(accommodationRoomType).trim(),

                rooms:
                    String(accommodationRooms).trim(),

                checkin:
                    String(accommodationCheckin).trim(),

                checkout:
                    String(accommodationCheckout).trim(),

                status:
                    "Pending",

                createdAt:
                    new Date().toISOString()

            };


            bookings.push(newBooking);

            saveBookings(bookings);


            console.log("");
            console.log("ACCOMMODATION BOOKING SAVED");
            console.log("---------------------------------");
            console.log("Reference:", newBooking.reference);
            console.log("Name:", newBooking.name);
            console.log("Phone:", newBooking.phone);
            console.log("Email:", newBooking.email);
            console.log("Check-in:", newBooking.checkin);
            console.log("Check-out:", newBooking.checkout);
            console.log("Room:", newBooking.roomType);
            console.log("Rooms:", newBooking.rooms);
            console.log("Status:", newBooking.status);
            console.log("---------------------------------");


            await sendAdminBookingEmail(newBooking);


            return res.status(201).json({

                success: true,

                message:
                    "Accommodation booking received successfully.",

                reference:
                    newBooking.reference,

                booking:
                    newBooking

            });

        }

    } catch (error) {

        console.error("");
        console.error("BOOKING ERROR:");
        console.error(error);
        console.error("");

        return res.status(500).json({

            success: false,

            message:
                "Something went wrong while processing the booking."

        });

    }

});


/* ========================================
   ADMIN BOOKING EMAIL
======================================== */

async function sendAdminBookingEmail(booking) {

    try {

        if (!process.env.RESEND_API_KEY) {

            console.log(
                "RESEND_API_KEY not configured. Email skipped."
            );

            return;

        }


        if (!process.env.NOTIFICATION_EMAIL) {

            console.log(
                "NOTIFICATION_EMAIL not configured. Email skipped."
            );

            return;

        }


        let accommodationSection = "";


        if (booking.type === "Accommodation") {

            accommodationSection = `

                <div style="
                    margin-top:20px;
                    padding:20px;
                    background:#f8f4e8;
                    border-radius:10px;
                ">

                    <h3 style="color:#b18b1d;">
                        Accommodation Details
                    </h3>

                    <p>
                        <strong>Room Type:</strong>
                        ${booking.roomType}
                    </p>

                    <p>
                        <strong>Number of Rooms:</strong>
                        ${booking.rooms}
                    </p>

                    <p>
                        <strong>Check-in:</strong>
                        ${booking.checkin}
                    </p>

                    <p>
                        <strong>Check-out:</strong>
                        ${booking.checkout}
                    </p>

                </div>

            `;

        }


        const emailResponse =
            await fetch(
                "https://api.resend.com/emails",
                {

                    method: "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${process.env.RESEND_API_KEY}`,

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        from:
                            "Maka-Villa Website <onboarding@resend.dev>",

                        to: [
                            process.env.NOTIFICATION_EMAIL
                        ],

                        subject:
                            `NEW ${booking.type.toUpperCase()} BOOKING - ${booking.reference}`,

                        html: `

                            <div style="
                                font-family:Arial,sans-serif;
                                max-width:700px;
                                margin:auto;
                                padding:30px;
                            ">

                                <h2 style="color:#b18b1d;">
                                    New Maka-Villa Booking
                                </h2>

                                <div style="
                                    background:#111;
                                    color:white;
                                    padding:18px;
                                    border-radius:10px;
                                ">

                                    <h3>
                                        ${booking.reference}
                                    </h3>

                                    <p>
                                        Status:
                                        <strong>
                                            Pending
                                        </strong>
                                    </p>

                                </div>

                                <h3>
                                    Customer Details
                                </h3>

                                <p>
                                    <strong>Name:</strong>
                                    ${booking.name}
                                </p>

                                <p>
                                    <strong>Phone:</strong>
                                    ${booking.phone}
                                </p>

                                <p>
                                    <strong>Email:</strong>
                                    ${booking.email}
                                </p>

                                <h3>
                                    Reservation Details
                                </h3>

                                <p>
                                    <strong>Type:</strong>
                                    ${booking.type}
                                </p>

                                <p>
                                    <strong>Date:</strong>
                                    ${booking.date}
                                </p>

                                <p>
                                    <strong>Time:</strong>
                                    ${booking.time}
                                </p>

                                <p>
                                    <strong>Guests:</strong>
                                    ${booking.guests}
                                </p>

                                ${accommodationSection}

                                <p>
                                    <strong>Message:</strong>
                                    ${booking.message}
                                </p>

                            </div>

                        `

                    })

                }
            );


        const emailResult =
            await emailResponse.json();


        console.log(
            "Admin email status:",
            emailResponse.status
        );


        console.log(
            "Admin email response:",
            emailResult
        );


        if (emailResponse.ok) {

            console.log(
                "ADMIN EMAIL SENT"
            );

        } else {

            console.log(
                "ADMIN EMAIL FAILED - BOOKING WAS STILL SAVED"
            );

        }

    } catch (error) {

        /*
         * IMPORTANT:
         *
         * An email failure must NEVER make
         * a valid booking fail.
         */

        console.log(
            "Admin email error:",
            error.message
        );

    }

}


/* ========================================
   PUBLIC BOOKING STATUS
======================================== */

app.get(
    "/api/bookings/:reference",
    (req, res) => {

        try {

            const reference =
                String(req.params.reference)
                    .trim()
                    .toUpperCase();


            const bookings =
                readBookings();


            const booking =
                bookings.find(item => {

                    const itemReference =
                        item.reference
                            ? String(item.reference)
                                .toUpperCase()
                            : createBookingReference(item.id);

                    return itemReference === reference;

                });


            if (!booking) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Booking not found."

                });

            }


            const publicBooking = {

                reference:
                    booking.reference,

                type:
                    booking.type,

                guests:
                    booking.guests,

                date:
                    booking.date,

                time:
                    booking.time,

                status:
                    booking.status,

                createdAt:
                    booking.createdAt

            };


            if (
                booking.type ===
                "Accommodation"
            ) {

                publicBooking.roomType =
                    booking.roomType;

                publicBooking.rooms =
                    booking.rooms;

                publicBooking.checkin =
                    booking.checkin;

                publicBooking.checkout =
                    booking.checkout;

            }


            return res.json({

                success: true,

                booking:
                    publicBooking

            });

        } catch (error) {

            console.error(
                "PUBLIC STATUS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Could not check booking status."

            });

        }

    }
);


/* ========================================
   ADMIN AUTHENTICATION
======================================== */

function checkAdmin(req, res, next) {

    const username =
        req.headers["x-admin-username"];

    const password =
        req.headers["x-admin-password"];


    if (
        username ===
        process.env.ADMIN_USERNAME &&
        password ===
        process.env.ADMIN_PASSWORD
    ) {

        next();

    } else {

        res.status(401).json({

            success: false,

            message:
                "Unauthorized."

        });

    }

}


/* ========================================
   ADMIN LOGIN
======================================== */

app.post(
    "/api/admin/login",
    (req, res) => {

        const {
            username,
            password
        } = req.body;


        if (
            username ===
            process.env.ADMIN_USERNAME &&
            password ===
            process.env.ADMIN_PASSWORD
        ) {

            return res.json({

                success: true,

                message:
                    "Admin login successful."

            });

        }


        return res.status(401).json({

            success: false,

            message:
                "Invalid username or password."

        });

    }
);


/* ========================================
   GET ALL BOOKINGS
======================================== */

app.get(
    "/api/admin/bookings",
    checkAdmin,
    (req, res) => {

        try {

            const bookings =
                readBookings();


            return res.json({

                success: true,

                bookings:
                    bookings

            });

        } catch (error) {

            console.error(
                "ADMIN BOOKINGS ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                message:
                    "Could not load bookings."

            });

        }

    }
);


/* ========================================
   CUSTOMER STATUS EMAIL
======================================== */

async function sendCustomerStatusEmail(booking) {

    if (
        !booking.email ||
        booking.email === "Not provided"
    ) {

        console.log(
            "No customer email. Status email skipped."
        );

        return;

    }


    let subject = "";
    let heading = "";
    let messageText = "";


    if (
        booking.status ===
        "Confirmed"
    ) {

        subject =
            "Maka-Villa Reservation Confirmed";

        heading =
            "Your Reservation Has Been Confirmed";

        messageText =
            "We are pleased to confirm your reservation at Maka-Villa Bar & Restaurant.";

    }


    else if (
        booking.status ===
        "Cancelled"
    ) {

        subject =
            "Maka-Villa Reservation Cancelled";

        heading =
            "Your Reservation Has Been Cancelled";

        messageText =
            "Your reservation at Maka-Villa Bar & Restaurant has been cancelled.";

    }

    else {

        return;

    }


    try {

        const emailResponse =
            await fetch(
                "https://api.resend.com/emails",
                {

                    method: "POST",

                    headers: {

                        "Authorization":
                            `Bearer ${process.env.RESEND_API_KEY}`,

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        from:
                            "Maka-Villa Website <onboarding@resend.dev>",

                        to: [
                            booking.email
                        ],

                        subject:
                            subject,

                        html: `

                            <div style="
                                font-family:Arial,sans-serif;
                                max-width:650px;
                                margin:auto;
                                padding:30px;
                            ">

                                <h2 style="color:#b18b1d;">
                                    Maka-Villa Bar & Restaurant
                                </h2>

                                <h3>
                                    ${heading}
                                </h3>

                                <p>
                                    Dear ${booking.name},
                                </p>

                                <p>
                                    ${messageText}
                                </p>

                                <div style="
                                    background:#f5f5f5;
                                    padding:20px;
                                    border-radius:10px;
                                ">

                                    <p>
                                        <strong>
                                            Booking Reference:
                                        </strong>

                                        ${booking.reference}
                                    </p>

                                    <p>
                                        <strong>
                                            Type:
                                        </strong>

                                        ${booking.type}
                                    </p>

                                    <p>
                                        <strong>
                                            Date:
                                        </strong>

                                        ${booking.date}
                                    </p>

                                    <p>
                                        <strong>
                                            Time:
                                        </strong>

                                        ${booking.time}
                                    </p>

                                    <p>
                                        <strong>
                                            Guests:
                                        </strong>

                                        ${booking.guests}
                                    </p>

                                    <p>
                                        <strong>
                                            Status:
                                        </strong>

                                        ${booking.status}
                                    </p>

                                </div>

                                <p>
                                    Phone / WhatsApp:
                                    0742020633
                                </p>

                            </div>

                        `

                    })

                }
            );


        const result =
            await emailResponse.json();


        console.log(
            "Customer email response:",
            result
        );


    } catch (error) {

        console.log(
            "Customer email error:",
            error.message
        );

    }

}


/* ========================================
   UPDATE BOOKING STATUS
======================================== */

app.patch(
    "/api/admin/bookings/:id",
    checkAdmin,
    async (req, res) => {

        try {

            const bookingId =
                Number(req.params.id);


            const {
                status
            } = req.body;


            const allowedStatuses = [
                "Pending",
                "Confirmed",
                "Cancelled"
            ];


            if (
                !allowedStatuses.includes(status)
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Invalid booking status."

                });

            }


            const bookings =
                readBookings();


            const booking =
                bookings.find(
                    item =>
                        Number(item.id) ===
                        bookingId
                );


            if (!booking) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Booking not found."

                });

            }


            const oldStatus =
                booking.status;


            booking.status =
                status;


            booking.updatedAt =
                new Date().toISOString();


            if (!booking.reference) {

                booking.reference =
                    createBookingReference(
                        booking.id
                    );

            }


            saveBookings(bookings);


            console.log(
                `Booking ${booking.reference} changed from ${oldStatus} to ${status}`
            );


            if (
                oldStatus !== status &&
                (
                    status === "Confirmed" ||
                    status === "Cancelled"
                )
            ) {

                await sendCustomerStatusEmail(
                    booking
                );

            }


            return res.json({

                success: true,

                message:
                    "Booking status updated.",

                booking:
                    booking

            });

        } catch (error) {

            console.error(
                "STATUS UPDATE ERROR:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Could not update booking."

            });

        }

    }
);


/* ========================================
   START SERVER
======================================== */

app.listen(
    PORT,
    () => {

        console.log("");
        console.log("=================================");
        console.log("MAKA-VILLA BACKEND");
        console.log("=================================");

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            "Bookings API: /api/bookings"
        );

        console.log(
            "Admin API: /api/admin/login"
        );

        console.log(
            "Admin bookings: /api/admin/bookings"
        );

        console.log(
            "Public status: /api/bookings/:reference"
        );

        console.log(
            "Waiting for bookings..."
        );

        console.log(
            "=================================");

    }
);