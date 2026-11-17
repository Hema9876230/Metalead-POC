# Meta Lead Ads – Real-Time Lead Management PoC

A Proof of Concept (PoC) demonstrating how leads submitted through a Meta Facebook Instant Form can be retrieved by a Node.js backend and displayed in real time in a React Native mobile application using Socket.IO.

---

## 1. Project Overview

This project demonstrates a real-time lead management integration between Meta Lead Ads and a React Native mobile application.

When a user submits a Facebook Instant Form, the lead information can be retrieved through the Meta Graph API.

The Node.js backend receives Meta webhook notifications, retrieves lead details, stores them temporarily, and sends new lead information to connected mobile applications using Socket.IO.

The React Native Expo application displays the lead information without requiring a manual refresh.

### Main objectives

- Integrate Meta Facebook Lead Ads with a Node.js backend.
- Receive lead notifications using Meta Webhooks.
- Retrieve lead information through the Meta Graph API.
- Display existing leads in a React Native application.
- Receive new leads in real time using Socket.IO.
- Demonstrate communication between Meta, backend, and mobile frontend.

---

## 2. System Architecture

The project follows this architecture:

```text
          Facebook / Meta
                 |
                 |
          Instant Form
                 |
                 |
          User submits lead
                 |
                 |
          Meta Webhook
                 |
                 |
             ngrok
                 |
                 |
          Node.js Backend
                 |
          Meta Graph API
                 |
          Retrieve lead details
                 |
          Store lead in memory
                 |
                 |
             Socket.IO
                 |
                 |
          React Native App
             (Expo Go)
                 |
                 |
          Display lead details
```

### How the system works

**Step 1: Lead submission**

A user submits their information through a Facebook Instant Form.

The form collects information such as:
- Full name
- Email address
- Phone number

**Step 2: Meta webhook notification**

Meta sends a webhook notification to the backend when a subscribed lead event occurs.

The webhook notification contains a lead ID.

**Step 3: Backend receives the notification**

The Node.js backend receives the webhook request at:

`POST /webhook`

The backend verifies the request signature using the Meta App Secret.

**Step 4: Retrieve lead information**

The backend uses the lead ID and Page Access Token to retrieve lead details through the Meta Graph API.

**Step 5: Store lead information**

The retrieved lead is stored in an in-memory JavaScript Map.

**Step 6: Send lead information to mobile application**

The backend emits a Socket.IO event:

`lead:new`

All connected mobile clients can receive the new lead.

**Step 7: Display lead information**

The React Native application displays:
- Name
- Email
- Phone number
- Lead creation date

---

## 3. Technologies Used

| Technology | Purpose |
|---|---|
| Node.js | Backend runtime |
| Express.js | Backend API and webhook endpoints |
| Meta Graph API | Retrieve Facebook lead information |
| Meta Webhooks | Receive lead notifications |
| Socket.IO | Real-time communication |
| React Native | Mobile application |
| Expo | Run and test the mobile application |
| Axios | HTTP requests to Meta API |
| ngrok | Expose local backend publicly |
| dotenv | Manage environment variables |
| Nodemon | Automatically restart backend during development |

---

## 4. Project Folder Structure

The recommended project structure is:

```text
meta-leads-poc/
│
├── backend/
│   │
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── .env
│   └── .gitignore
│
├── frontend/
│   │
│   ├── App.js
│   ├── app.json
│   ├── package.json
│   ├── package-lock.json
│   └── .gitignore
│
├── .gitignore
└── README.md
```

Note: The frontend folder name can be different depending on your local project setup.

### Backend files

- `server.js`: Contains the Express server, Meta webhook handling, Graph API integration, and Socket.IO implementation.
- `package.json`: Contains backend dependencies and scripts.
- `.env`: Stores private credentials and configuration.
- `.gitignore`: Prevents sensitive and unnecessary files from being committed.

### Frontend files

- `App.js`: Contains the React Native application interface and Socket.IO client.
- `app.json`: Expo application configuration.
- `package.json`: Frontend dependencies.
- `.gitignore`: Excludes dependencies, build files, and local configuration.

---

## 5. Prerequisites

Before running the project, install the following:

1. Node.js and npm.
2. Visual Studio Code.
3. Expo Go on an Android or iOS device.
4. A Facebook account.
5. A Meta Developer account.
6. A Meta Developer application.
7. A Facebook Page.
8. A Facebook Instant Form.
9. ngrok.

You also need access to the Meta Page and its lead data.

---

# PART A – BACKEND SETUP

## 6. Backend Installation

Open a terminal inside the backend directory.

```bash
cd backend
```

Install the required dependencies:

```bash
npm install express cors axios dotenv socket.io
```

Install Nodemon as a development dependency:

```bash
npm install --save-dev nodemon
```

### Backend package.json

Make sure your backend `package.json` contains a development script similar to:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

---

## 7. Environment Configuration

Create a `.env` file inside the backend directory.

```env
PORT=3000

META_GRAPH_VERSION=v27.0

META_PAGE_ID=YOUR_PAGE_ID

META_FORM_ID=YOUR_FORM_ID

META_VERIFY_TOKEN=YOUR_VERIFY_TOKEN

META_APP_SECRET=YOUR_APP_SECRET

META_PAGE_ACCESS_TOKEN=YOUR_PAGE_ACCESS_TOKEN
```

### Explanation of environment variables

| Variable | Description |
|---|---|
| PORT | Local backend port |
| META_GRAPH_VERSION | Meta Graph API version |
| META_PAGE_ID | Facebook Page ID |
| META_FORM_ID | Facebook Instant Form ID |
| META_VERIFY_TOKEN | Custom verification token |
| META_APP_SECRET | Meta application secret |
| META_PAGE_ACCESS_TOKEN | Page Access Token used to retrieve leads |

**Important security rules:**

- Never upload `.env` to GitHub.
- Never share access tokens publicly.
- Never commit the Meta App Secret.
- Use a valid Page Access Token, not a User Access Token, for the lead retrieval requests in this project.
- Ensure the token has the required permissions and Page lead access.
- Rotate credentials if they have been exposed.

---

## 8. Meta Developer Configuration

Open:

https://developers.facebook.com/apps/

Create or select your Meta application.

Configure the following:

### Facebook Page

Create or select the Facebook Page used for the PoC.

### Instant Form

Create an Instant Form with fields such as:

- Full Name
- Email
- Phone Number

### Webhooks

Configure the Page webhook subscription.

Callback URL:

```text
https://YOUR-NGROK-DOMAIN.ngrok-free.dev/webhook
```

Verify Token:

Use the same value as `META_VERIFY_TOKEN` in the backend `.env` file.

Subscribe to the `leadgen` webhook field.

The backend must be publicly reachable through HTTPS for Meta to deliver webhook requests.

### Required permissions

Depending on the operation, the application needs the appropriate Meta permissions, including:

- `leads_retrieval`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata`

Page access and app permissions must also be configured correctly.

---

## 9. Backend API Endpoints

The backend exposes the following endpoints.

### 1. Health Check

```http
GET /health
```

Example:

```text
http://localhost:3000/health
```

Purpose:

Checks whether the backend server is running.

Example response:

```json
{
  "success": true,
  "message": "Backend is running",
  "status": "ok"
}
```

### 2. Meta Webhook Verification

```http
GET /webhook
```

Purpose:

Meta uses this endpoint to verify the webhook callback URL.

The backend compares the supplied verification token with the configured token.

### 3. Receive Meta Lead Events

```http
POST /webhook
```

Purpose:

Receives webhook notifications from Meta.

The backend:

1. Validates the request signature.
2. Parses the webhook payload.
3. Checks for the `leadgen` event.
4. Extracts the lead ID.
5. Retrieves the lead details.
6. Emits the new lead through Socket.IO.

### 4. Retrieve All Stored Leads

```http
GET /leads
```

Purpose:

Returns all leads currently stored in the backend.

Example response:

```json
[
  {
    "id": "123456789",
    "name": "Sample Lead",
    "email": "sample@example.com",
    "phone": "9999999999",
    "createdAt": "2026-11-17T10:30:00+0000",
    "fields": {}
  }
]
```

The actual response depends on the lead information returned by Meta.

---

## 10. Existing Lead Synchronization

The backend includes a function named:

```javascript
syncExistingLeads()
```

This function retrieves existing leads from the configured Instant Form.

It calls:

```http
GET /FORM_ID/leads
```

The function:

1. Uses the configured Form ID.
2. Sends a request to the Meta Graph API.
3. Retrieves lead records.
4. Extracts the form fields.
5. Converts the response into the application's lead format.
6. Stores leads in the backend Map.
7. Emits the `lead:new` Socket.IO event.

The existing lead synchronization runs when the backend starts.

**Important:** The backend uses an in-memory Map for this PoC. Data is not permanently stored in a database. When the server restarts, the existing lead synchronization runs again.

---

# PART B – NGROK CONFIGURATION

## 11. Why ngrok is Required

The Node.js backend runs locally on the development computer.

Meta cannot directly access a local address such as:

```text
http://localhost:3000
```

ngrok creates a publicly accessible HTTPS URL that forwards requests to the local backend.

### Start ngrok

Open a separate terminal.

Run:

```bash
ngrok http 3000
```

ngrok displays a forwarding URL similar to:

```text
https://example.ngrok-free.dev
```

The complete Meta callback URL becomes:

```text
https://example.ngrok-free.dev/webhook
```

Use the actual forwarding URL displayed by your ngrok session.

### Important

Keep ngrok running while testing.

If the ngrok URL changes, update the Meta webhook Callback URL and the Expo application's server URL.

---

# PART C – FRONTEND SETUP

## 12. React Native Expo Installation

Open a terminal inside the frontend directory.

```bash
cd frontend
```

Install the dependencies:

```bash
npm install
```

Install the Socket.IO client:

```bash
npm install socket.io-client
```

---

## 13. Frontend Server Configuration

Open `App.js`.

Configure the backend URL:

```javascript
const SERVER_URL = "https://YOUR-NGROK-DOMAIN.ngrok-free.dev";
```

Replace the example URL with the actual ngrok HTTPS URL.

The frontend communicates with the backend through two methods:

**HTTP API**

```javascript
fetch(`${SERVER_URL}/leads`);
```

Used to retrieve existing leads.

**Socket.IO**

```javascript
const socket = io(SERVER_URL);
```

Used to receive new leads in real time.

---

## 14. Frontend Working

The React Native application uses three main state variables:

```javascript
const [leads, setLeads] = useState([]);

const [connected, setConnected] = useState(false);

const [loading, setLoading] = useState(true);
```

### Leads

Stores the lead records displayed on the screen.

### Connected

Tracks whether the Socket.IO connection is active.

### Loading

Indicates whether the initial lead request is still running.

### Initial Lead Loading

The frontend requests:

```http
GET /leads
```

The returned lead records are displayed using React Native's `FlatList`.

### Real-Time Lead Updates

The frontend listens for:

```javascript
socket.on("lead:new", addLead);
```

When the backend emits a new lead, the application adds it to the list.

Duplicate lead IDs are ignored.

### Connection Status

The application displays:

- Live connected
- Disconnected

This helps identify whether the mobile application has an active Socket.IO connection.

---

# PART D – RUNNING THE COMPLETE PROJECT

## 15. Start the Backend

Open a terminal inside the backend folder.

```bash
npm run dev
```

Expected output:

```text
META LEADS BACKEND STARTED

Server running on port 3000

Graph API version: v27.0

Starting existing lead sync...
```

If the Meta credentials and permissions are correct, the backend should retrieve the existing form leads.

---

## 16. Start ngrok

Open another terminal.

Run:

```bash
ngrok http 3000
```

Keep the tunnel running.

Verify the public URL using the ngrok dashboard:

```text
http://127.0.0.1:4040
```

---

## 17. Start the Expo Application

Open a third terminal inside the frontend directory.

Run:

```bash
npx expo start
```

Scan the QR code using Expo Go.

The mobile application should open and connect to the backend.

Expected application interface:

```text
--------------------------------
             Meta Leads

          ● Live connected

--------------------------------

Lead Name

Email: sample@example.com

Phone: 9999999999

Created: 2026-11-17

--------------------------------
```

The displayed information depends on the actual lead records.

---

# PART E – TESTING

## 18. Test Existing Leads

After starting the backend, open:

```text
http://localhost:3000/leads
```

Check whether the backend returns the existing lead records.

If the response contains leads, the initial synchronization is working.

Open Expo Go and verify that the records are displayed.

## 19. Test Real-Time Lead Delivery

For the real-time test:

1. Start the backend.
2. Start ngrok.
3. Open Expo Go.
4. Open the Meta Lead Ads Testing Tool.
5. Select the Facebook Page.
6. Select the Instant Form.
7. Create a new test lead.
8. Observe the backend terminal.
9. Observe the Expo application.

Expected backend log:

```text
POST /webhook received

Meta webhook event received: page

Lead ID received: ...

New lead received: ...
```

Expected frontend result:

The new lead should appear automatically without restarting the backend or refreshing Expo.

**Note:** A successful Socket.IO connection does not by itself prove that Meta webhook delivery is working. The `POST /webhook` request must reach the backend for a webhook-driven live update.

---

# PART F – TROUBLESHOOTING

## 20. Common Issues

### Issue 1: Access Token Expired

Example error:

```text
OAuthException
code: 190
error_subcode: 463
```

Cause:

The Meta Access Token has expired.

Solution:

1. Open Meta Graph API Explorer.
2. Generate a valid User Access Token with the required permissions.
3. Request the Page list using:

```text
/me/accounts?fields=id,name,access_token
```

4. Copy the `access_token` belonging to the correct Facebook Page.
5. Update `META_PAGE_ACCESS_TOKEN` in `.env`.
6. Restart the backend.

Never share the new token publicly.

### Issue 2: Page Access Token Required

Example:

```text
(#190) This method must be called with a Page Access Token
```

Cause:

A User Access Token was used instead of the Page Access Token required by the lead retrieval request.

Solution:

Use the Page's `access_token` returned by `/me/accounts`.

### Issue 3: Leadgen Forms Field Error

Example:

```text
(#100) Tried accessing nonexisting field (leadgen_forms)
```

Cause:

The backend attempted to access an unsupported field or edge.

Solution:

Use the known Instant Form ID directly:

```http
GET /FORM_ID/leads
```

### Issue 4: No Leads Received Yet

Possible causes:

- No leads were retrieved from Meta.
- The Page Access Token is invalid.
- The Form ID is incorrect.
- The token lacks the necessary permissions.
- The backend has not received any webhook event.

Check:

```text
http://localhost:3000/leads
```

### Issue 5: Socket.IO Disconnected

Possible causes:

- Backend is not running.
- ngrok is stopped.
- The frontend server URL is incorrect.
- Network connectivity issues.

Check the backend terminal for:

```text
React Native client connected
```

Also verify the URL configured in `App.js`.

### Issue 6: Meta Test Lead Remains Pending

Possible causes:

- Meta has not confirmed webhook delivery.
- The Page or app subscription is incorrect.
- The app is in Development mode.
- Lead access or app permissions are incomplete.

Check:

- Meta Page webhook subscription.
- `leadgen` subscription.
- Page lead access.
- Meta Lead Ads Testing Tool diagnostics.
- ngrok traffic inspector.

### Issue 7: Backend Does Not Update Automatically

If existing leads appear only after restarting the backend, the initial synchronization is working but live webhook delivery may not be.

Check:

```text
http://127.0.0.1:4040
```

Look for:

```text
POST /webhook
```

If no request appears after submitting a test lead, investigate Meta webhook delivery rather than changing the Expo application.

---

# PART G – GIT AND GITHUB

## 21. Git Ignore Configuration

The project contains environment variables and dependencies that should not be committed.

### Backend .gitignore

```gitignore
node_modules/
.env
.env.*
!.env.example
*.log
coverage/
```

### Frontend .gitignore

```gitignore
node_modules/
.expo/
.expo-shared/
dist/
web-build/
.env
.env.*
!.env.example
*.log
coverage/
```

### Root .gitignore

```gitignore
node_modules/
**/node_modules/

.env
.env.*
!.env.example

*.log
coverage/

.DS_Store
Thumbs.db

.vscode/
.idea/
```

Do not commit access tokens, App Secrets, or verification credentials.

If a secret has already been committed, remove it from Git tracking and rotate the exposed credential.

## 22. Upload the Project to GitHub

Initialize Git from the project root:

```bash
git init
```

Check the files:

```bash
git status
```

Add project files:

```bash
git add .
```

Commit:

```bash
git commit -m "Initial commit - Meta Lead Ads PoC"
```

Create a GitHub repository and connect it:

```bash
git remote add origin YOUR_GITHUB_REPOSITORY_URL
```

Push:

```bash
git branch -M main
git push -u origin main
```

Before pushing, confirm that `.env` files and private credentials are excluded.

---

# PART H – LIMITATIONS AND FUTURE IMPROVEMENTS

## 23. Current Limitations

This is a Proof of Concept, not a production-ready lead management platform.

Current limitations include:

1. Lead information is stored in an in-memory Map.
2. Lead records are not permanently stored in a database.
3. The backend depends on Meta API availability.
4. Real-time updates depend on successful webhook delivery.
5. ngrok is used to expose the local development server.
6. Access tokens need appropriate lifecycle and security management.
7. Production deployment and monitoring are not included.

## 24. Future Enhancements

The project can be extended with:

- MongoDB or PostgreSQL for permanent lead storage.
- Lead search and filtering.
- Lead status management.
- Lead assignment to sales representatives.
- Push notifications.
- User authentication.
- Admin dashboard.
- Lead export to Excel or CSV.
- Production hosting.
- Persistent event processing and retry handling.
- Better error logging and monitoring.

---

# 25. Final Project Summary

This PoC demonstrates how Meta Facebook Lead Ads can be integrated with a custom backend and a mobile application.

The integration uses:

- Meta Instant Forms to collect leads.
- Meta Webhooks to notify the backend.
- Meta Graph API to retrieve lead information.
- Node.js and Express.js to process lead data.
- ngrok to expose the local backend.
- Socket.IO to send real-time updates.
- React Native and Expo to display lead information.

The intended result is a mobile application that can display existing Meta leads and automatically receive new leads when Meta successfully delivers the corresponding webhook event.

---

## 26. Quick Start Commands

Run the following commands in separate terminals.

**Terminal 1 – Backend**

```bash
cd backend
npm install
npm run dev
```

**Terminal 2 – ngrok**

```bash
ngrok http 3000
```

**Terminal 3 – Frontend**

```bash
cd frontend
npm install
npx expo start
```

Open Expo Go and scan the QR code.

---

**Project:** Meta Lead Ads Real-Time Integration PoC

**Backend:** Node.js + Express.js

**Mobile Frontend:** React Native + Expo

**Communication:** Meta Webhooks + Socket.IO

**API:** Meta Graph API

**Purpose:** Real-time Facebook Lead Ads retrieval and mobile display.
