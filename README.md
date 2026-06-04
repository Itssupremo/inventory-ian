# Inventory System

Simple Office Asset Tracker with image upload and MongoDB Atlas persistence.

## Features

- Login with role-based access (Administrator and User)
- Create, edit, delete inventory assets
- Auto-number Asset ID (for example: HW-001, CH-001)
- Required fields from your specification:
  - Asset ID (text / auto-number)
  - Item Name
  - Category (Laptop, Monitor, Tablet, Furniture)
  - Image (attachment/photo)
  - Serial / Tag Number
  - Status (Available, Assigned, In Repair, Retired)
  - Assigned To
  - Location
- Search and filter by category/status
- Images served from local uploads folder

## Tech

- Node.js
- Express
- Mongoose
- Multer (image uploads)
- Plain HTML/CSS/JS frontend
- MongoDB Atlas

## Project Structure

- `server.js` - Express app, auth, assets API, and session handling
- `models/` - Mongoose schemas for assets, users, and settings
- `public/` - frontend pages, styles, and browser scripts
- `public/assets/` - UI images and shared static assets
- `data/` - local seed/reference data
- `uploads/` - uploaded asset images

## Run

1. Install dependencies

```bash
npm install
```

2. Configure environment variables

Create a `.env` file (or edit the existing one) with:

```env
MONGO_URI=mongodb+srv://kyianmangubat7_db_user:<db_password>@cluster0.lb4ymvj.mongodb.net/inventory_system?retryWrites=true&w=majority&appName=Cluster0
PORT=5000
SESSION_SECRET=change_this_to_a_long_random_string
INIT_ADMIN_USERNAME=your_admin_username
INIT_ADMIN_PASSWORD=use_a_strong_password_here
INIT_ADMIN_DISPLAY_NAME=System Administrator
```

3. Replace `<db_password>` with your actual Atlas database user password.

4. Start development server

```bash
npm run dev
```

5. Open app

- http://localhost:5000

## Initial Setup

- On a fresh database, the app can bootstrap a single administrator account from:
  - `INIT_ADMIN_USERNAME`
  - `INIT_ADMIN_PASSWORD`
  - `INIT_ADMIN_DISPLAY_NAME` (optional)
- After the first administrator account is created, add other users from the admin panel.
- Remove or clear the `INIT_ADMIN_*` variables after first setup if you do not want them retained in your environment.

The root URL (`/`) redirects users based on session state:

- Not logged in -> `/login.html`
- Administrator -> `/admin.html`
- User -> `/user.html`

## Notes

- Asset images are stored in `uploads/`.
- Asset records are stored in MongoDB (`inventory_system` database).
- Auto-number prefix mapping:
  - Laptop, Monitor, Tablet -> `HW-###`
  - Furniture -> `CH-###`

## User Roles

The system supports these built-in roles:

| Role | Access Level |
| --- | --- |
| `Administrator` | Full System Access |
| `User` | Limited Access |

Role metadata endpoints:

- `GET /api/users` - returns the created users and their role settings.
- `GET /api/meta/roles` - returns role profiles (responsibilities and guidelines).

Authentication endpoints:

- `POST /api/auth/login` - creates login session.
- `GET /api/auth/me` - returns current logged-in user.
- `POST /api/auth/logout` - logs out current session.
