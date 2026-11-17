/*
=====================================================================
 META LEADS BACKEND - OVERVIEW (HOW THE WHOLE THING WORKS)
=====================================================================
 Goal: Show Facebook/Instagram "Lead Ads" form submissions inside a
 React Native (Expo) app in REAL TIME.

 Flow:
 1. A person fills your Meta Lead Ad form.
 2. Meta sends a WEBHOOK (POST /webhook) to this server containing
    only the lead's ID (not the full data).
 3. This server verifies the request really came from Meta
    (signature check using APP_SECRET).
 4. The server calls Meta's Graph API with that lead ID and fetches
    the full lead data (name, email, phone...).
 5. The lead is saved in memory (a Map) and pushed instantly to all
    connected apps through Socket.IO ("lead:new" event).
 6. The Expo app can also call GET /leads to get all stored leads.
 7. On startup, the server also pulls OLD leads of your form from
    Meta (syncExistingLeads) so nothing is missed while it was off.

 NOTE: Leads are stored in memory only. If the server restarts,
 the Map is cleared (but syncExistingLeads re-fills it from Meta).
 For production, use a real database (MongoDB, PostgreSQL, etc.).
=====================================================================
*/

// Loads variables from the .env file into process.env
// (so secrets like tokens are not hard-coded in the code).
require("dotenv").config();

// ---------------------- IMPORTS ----------------------
const express = require("express");      // Web framework to create API routes
const http = require("http");            // Node's HTTP server (Socket.IO needs it)
const cors = require("cors");            // Allows other origins (e.g. your app) to call this API
const axios = require("axios");          // HTTP client used to call Meta's Graph API
const crypto = require("crypto");        // Built-in module used for HMAC signature verification
const { Server } = require("socket.io"); // Real-time (WebSocket) communication with the app

// Create the Express app and wrap it in a raw HTTP server.
// We need the raw `server` so both Express and Socket.IO share the same port.
const app = express();
const server = http.createServer(app);

// ---------------------- CONFIGURATION ----------------------

// Port to run on. Uses PORT from .env, otherwise 3000.
const PORT = process.env.PORT || 3000;

// Version of Meta's Graph API to call (e.g. "v27.0").
// Can be overridden from .env with META_GRAPH_VERSION.
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v27.0";

// Token that lets this server read lead data from your Facebook Page.
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

// Your Meta App's secret. Used to check webhook signatures (security).
const APP_SECRET = process.env.META_APP_SECRET;

// A string YOU choose. Meta sends it back during webhook setup so you
// can confirm the request is for your server.
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

// ID of the Lead Ad form whose old leads we want to sync on startup.
const FORM_ID = process.env.META_FORM_ID;

// If any required variable is missing, stop the app immediately.
// Better to fail at startup than to fail silently later.
if (!PAGE_ACCESS_TOKEN || !APP_SECRET || !VERIFY_TOKEN || !FORM_ID) {
  console.error("ERROR: Missing required environment variables in .env");
  process.exit(1); // exit code 1 = error
}

// Enable CORS for all normal routes so the mobile app/web can call them.
// (The webhook route is called by Meta's servers, so CORS doesn't matter there.)
app.use(cors());

// ---------------------- SOCKET.IO SETUP ----------------------
// Socket.IO gives us a live two-way connection with the app,
// so new leads appear instantly without the app refreshing.
const io = new Server(server, {
  cors: {
    origin: "*",               // Allow any client to connect (fine for demo, restrict in production)
    methods: ["GET", "POST"]
  }
});

// ---------------------- IN-MEMORY STORAGE ----------------------

// Map of leadId -> lead object. A Map gives fast lookup by ID and
// automatically avoids duplicates (same ID overwrites).
// Store leads in memory for this demo.
const leads = new Map();

// Set of lead IDs that are CURRENTLY being fetched from Meta.
// Prevents fetching the same lead twice if Meta sends the webhook twice quickly.
const processing = new Set();

// ------------------------------------
// HEALTH CHECK
// ------------------------------------

// Simple route to test that the server is alive.
// Open http://localhost:3000/health in a browser to check.
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is running",
    status: "ok"
  });
});

// ------------------------------------
// META WEBHOOK VERIFICATION
// ------------------------------------

// When you add the webhook URL in Meta Developer dashboard, Meta sends
// a GET request to check your server is valid. It sends:
//   hub.mode         -> "subscribe"
//   hub.verify_token -> the token you typed in the dashboard
//   hub.challenge    -> a random string we must send back
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // If mode and token match, confirm by echoing back the challenge.
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Meta webhook verified");
    return res.status(200).send(challenge);
  }

  // Otherwise reject (403 = Forbidden).
  return res.sendStatus(403);
});

// ------------------------------------
// VERIFY META WEBHOOK SIGNATURE
// ------------------------------------

// Anyone on the internet could POST fake data to /webhook.
// Meta signs every real webhook using HMAC-SHA256 with your APP_SECRET
// and puts the result in the "x-hub-signature-256" header.
// We recompute the signature and compare. If equal -> request is genuine.
function verifySignature(req) {
  // Signature sent by Meta, looks like: "sha256=abc123..."
  const signature = req.get("x-hub-signature-256");

  // Reject if no signature, or if body is not a raw Buffer.
  // (The signature must be calculated on the RAW body bytes, which is why
  // the POST route below uses express.raw() instead of express.json().)
  if (!signature || !Buffer.isBuffer(req.body)) {
    return false;
  }

  // Compute our own signature from the raw body using the app secret.
  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", APP_SECRET)
      .update(req.body)
      .digest("hex");

  // Convert both strings to Buffers for secure comparison.
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  // timingSafeEqual compares in constant time, which prevents "timing attacks"
  // (where attackers guess a signature by measuring response time).
  // It throws an error if lengths differ, so we check length first.
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

// ------------------------------------
// CONVERT META LEAD INTO APP FORMAT
// ------------------------------------

// Meta returns a lead like:
// {
//   id: "123",
//   created_time: "2026-...",
//   field_data: [
//     { name: "full_name", values: ["Hema Rani"] },
//     { name: "email", values: ["a@b.com"] }
//   ]
// }
// This function converts it into a simple, flat object for the app.
function formatLead(data) {
  const fields = {};

  // Turn the field_data array into an object: { full_name: "...", email: "..." }
  // `values` is an array, so we take the first value. `?.` avoids errors if missing.
  for (const item of data.field_data || []) {
    fields[item.name] = item.values?.[0] || "";
  }

  return {
    id: String(data.id),                              // Always keep ID as a string
    name: fields.full_name || fields.name || "Unknown", // Try common field names, else "Unknown"
    email: fields.email || "",
    phone: fields.phone_number || fields.phone || "",   // Meta usually uses "phone_number"
    createdAt: data.created_time || "",
    fields                                            // Keep ALL raw fields (custom questions too)
  };
}

// ------------------------------------
// FETCH ONE LEAD FROM META
// ------------------------------------

// The webhook gives only a lead ID. This function asks the Graph API
// for the full details of that single lead.
async function fetchLead(leadId) {
  const url =
    `https://graph.facebook.com/${GRAPH_VERSION}/${leadId}`;

  const response = await axios.get(url, {
    params: {
      fields: "id,created_time,field_data,form_id", // Which data we want back
      access_token: PAGE_ACCESS_TOKEN                // Authorization
    },
    timeout: 15000 // Give up after 15 seconds
  });

  // Convert Meta's format into our app's format.
  return formatLead(response.data);
}

// ------------------------------------
// PROCESS A NEW WEBHOOK LEAD
// ------------------------------------

// Called for every lead ID received from the webhook.
// Steps: skip duplicates -> fetch from Meta -> store -> push to app.
async function processLead(leadId) {
  // If we already have this lead, or it's being fetched right now, skip it.
  // (Meta can send the same event more than once.)
  if (leads.has(leadId) || processing.has(leadId)) {
    console.log("Lead already processed:", leadId);
    return;
  }

  // Mark as "in progress".
  processing.add(leadId);

  try {
    console.log("Fetching new lead:", leadId);

    // Get full lead details from Meta.
    const lead = await fetchLead(leadId);

    // Save in memory.
    leads.set(lead.id, lead);

    // Broadcast to ALL connected apps in real time.
    // The app listens with: socket.on("lead:new", (lead) => {...})
    io.emit("lead:new", lead);

    console.log("New lead received:", lead.id);
    console.log("Name:", lead.name);
    console.log("Email:", lead.email);
    console.log("Phone:", lead.phone);
  } catch (error) {
    // error.response?.data = detailed error from Meta (if any),
    // otherwise fall back to the normal error message.
    console.error(
      "Could not retrieve lead:",
      leadId,
      error.response?.data || error.message
    );
  } finally {
    // Always remove from "processing", whether it succeeded or failed.
    // If it failed, a future webhook can try again.
    processing.delete(leadId);
  }
}

// ------------------------------------
// SYNC EXISTING LEADS FROM YOUR FORM
// ------------------------------------

// Webhooks only tell us about NEW leads. This function downloads leads
// that already exist on the form (e.g. received while the server was off).
// It runs once at server startup.
async function syncExistingLeads() {
  console.log("Starting existing lead sync...");

  try {
    let after = null; // Pagination cursor: tells Meta where to continue from
    let total = 0;    // Count of leads found across all pages

    // Meta returns leads in pages (max 100 each). We loop until no more pages.
    do {
      const params = {
        fields: "id,created_time,field_data,form_id",
        limit: 100,                    // Leads per page
        access_token: PAGE_ACCESS_TOKEN
      };

      // For pages after the first one, tell Meta where we stopped.
      if (after) {
        params.after = after;
      }

      // GET /{FORM_ID}/leads -> list of all leads of that form.
      const response = await axios.get(
        `https://graph.facebook.com/${GRAPH_VERSION}/${FORM_ID}/leads`,
        {
          params,
          timeout: 15000
        }
      );

      // The leads are inside response.data.data (an array).
      const records = response.data.data || [];

      console.log("Leads found in this batch:", records.length);

      for (const data of records) {
        const lead = formatLead(data);

        // Only add leads we don't already have (avoid duplicates).
        if (!leads.has(lead.id)) {
          leads.set(lead.id, lead);
          io.emit("lead:new", lead); // Notify any connected app
          console.log("Existing lead synced:", lead.id);
        }
      }

      total += records.length;

      // Cursor for the next page. If there is none, `after` becomes null
      // and the loop stops.
      after = response.data.paging?.cursors?.after || null;

      // Continue only if Meta says another page exists.
    } while (after);

    console.log("Existing lead sync completed.");
    console.log("Total leads found:", total);
    console.log("Leads stored:", leads.size);
  } catch (error) {
    // A sync failure should not crash the server, so we just log it.
    console.error(
      "Existing lead sync failed:",
      error.response?.data || error.message
    );
  }
}

// ------------------------------------
// RECEIVE META WEBHOOK EVENTS
// ------------------------------------

// Meta sends a POST here whenever a new lead is submitted.
//
// express.raw() keeps the body as raw bytes (Buffer) instead of parsing it.
// This is REQUIRED because the signature is calculated on the exact raw bytes.
// We parse the JSON manually after verifying the signature.
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    // Step 1: Make sure this request really came from Meta.
    if (!verifySignature(req)) {
      console.log("Invalid webhook signature");
      return res.sendStatus(403);
    }

    let payload;

    // Step 2: Convert the raw Buffer -> text -> JSON object.
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch (error) {
      console.log("Invalid webhook JSON");
      return res.sendStatus(400); // 400 = Bad Request
    }

    // Step 3: Lead ads events come from the "page" object.
    // Anything else is not for us.
    if (payload.object !== "page") {
      return res.sendStatus(400);
    }

    // Step 4: Acknowledge Meta immediately.
    // Meta expects a fast 200 response. If we take too long, Meta thinks
    // delivery failed and retries. Heavy work is done AFTER responding.
    res.sendStatus(200);

    console.log("POST /webhook received");
    console.log("Meta webhook event received:", payload.object);

    // Step 5: Loop through events. Structure of the payload:
    // payload.entry[] -> each has changes[] -> each has field + value
    for (const entry of payload.entry || []) {
      for (const change of entry.changes || []) {
        // We only care about "leadgen" (new lead) events.
        if (change.field !== "leadgen") {
          continue; // skip other event types
        }

        // The webhook only contains the lead's ID.
        const leadId = change.value?.leadgen_id;

        if (leadId) {
          console.log("Lead ID received:", leadId);

          // Fetch full details and push to app (runs in background).
          processLead(String(leadId));
        }
      }
    }
  }
);

// ------------------------------------
// RETURN ALL LEADS TO EXPO APP
// ------------------------------------

// REST endpoint: the app can call GET /leads to load all stored leads.
// Map values -> array, then reverse so the NEWEST lead comes first.
app.get("/leads", (req, res) => {
  const allLeads = Array.from(leads.values()).reverse();

  res.json(allLeads);
});

// ------------------------------------
// SOCKET.IO CONNECTION
// ------------------------------------

// Runs every time an app (client) connects to the server.
io.on("connection", (socket) => {
  console.log("React Native client connected:", socket.id);

  // Immediately send all existing leads to the newly connected client,
  // so its screen is filled without needing another request.
  // Send existing leads to a newly connected client.
  socket.emit(
    "leads:initial",
    Array.from(leads.values()).reverse() // newest first
  );

  // Log when the client disconnects (app closed, network lost, etc.).
  socket.on("disconnect", () => {
    console.log("React Native client disconnected:", socket.id);
  });
});

// ------------------------------------
// START SERVER
// ------------------------------------

// Start listening for requests. We use `server` (not `app`) so that both
// Express routes and Socket.IO work on the same port.
server.listen(PORT, async () => {
  console.log("--------------------------------");
  console.log("META LEADS BACKEND STARTED");
  console.log(`Server running on port ${PORT}`);
  console.log(`Graph API version: ${GRAPH_VERSION}`);
  console.log("--------------------------------");

  // After the server is up, download old leads from Meta once.
  await syncExistingLeads();
});

/*
=====================================================================
 .ENV FILE EXAMPLE (create a file named .env in the same folder)
=====================================================================
 PORT=3000
 META_GRAPH_VERSION=v27.0
 META_PAGE_ACCESS_TOKEN=your_page_access_token
 META_APP_SECRET=your_app_secret
 META_VERIFY_TOKEN=any_secret_text_you_choose
 META_FORM_ID=your_lead_form_id

 ENDPOINTS SUMMARY
 - GET  /health   -> check server is running
 - GET  /webhook  -> Meta verifies your webhook URL
 - POST /webhook  -> Meta sends new lead events
 - GET  /leads    -> app fetches all leads

 SOCKET EVENTS (server -> app)
 - "leads:initial" -> all stored leads, sent when the app connects
 - "lead:new"      -> a single new lead, sent in real time
=====================================================================
*/