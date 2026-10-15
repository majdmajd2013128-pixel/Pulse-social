# Pulse — Social Network Starter

A responsive Instagram-inspired social app starter built with React, Vite, Tailwind CSS, Express, SQLite, Socket.IO, and JWT cookies. The visual UI supports English/Arabic, RTL, and dark/light themes.

> **Scope note:** This is a runnable starter, not a complete production Instagram clone. It implements working registration/login, seeded demo accounts/posts, feed, creating caption/image-URL posts, likes, comments, follow/unfollow, basic messaging, profile views, and an admin user moderation dashboard. Stories, true video uploads, password-reset email, advanced privacy controls, and several other requested items are UI placeholders or not yet implemented. Do not deploy publicly without further security review.

## Requirements
- Node.js 20+ recommended
- npm

## Run locally
```bash
npm install
cp .env.example .env
# Edit .env and set a unique JWT_SECRET. Change ADMIN_PASSWORD before deployment.
npm run dev
```
Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The API runs on port 3001.

## Production build
```bash
npm run build
npm start
```
The Express server serves `dist` after the build. Configure `PORT`, `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` in your hosting environment.

## GitHub
1. Create a repository named `Pulse-Social` on GitHub.
2. Upload the project files from this ZIP (not the ZIP itself, if you want GitHub to display the source files).
3. Keep `.env` and `server/pulse.db` out of GitHub; `.gitignore` already excludes them.
4. GitHub stores the source code but does not run the web app by itself. To make the app publicly accessible, deploy the backend to a Node.js host and configure its environment variables.

## Demo account
- Admin username: `P_tini8` (default)
- Admin password: the password provided for this project; it is stored as a bcrypt hash, not plaintext. Change it using `ADMIN_PASSWORD` in your private `.env` before deploying publicly.
- Demo user accounts use password `demo12345`.

Users and demo posts are seeded only on the first run. Changing environment variables will not reset an account in an existing database; delete `server/pulse.db` only if you intend to reset all local app data.

## Important security notes
- Set a unique, strong `JWT_SECRET` and replace the default admin password before deployment. The development fallback is not secure.
- The app uses HttpOnly, SameSite=Lax JWT cookies and rate limiting on login/register.
- Add CSRF protection, strict origin allowlists, upload scanning/storage, stronger schema validation, audit logging, and a formal moderation/report workflow before production.
- Do not commit `.env`, database files, user data, or secrets.
- The starter accepts HTTPS image URLs rather than handling direct uploads. Use a proper object-storage service for uploads.
