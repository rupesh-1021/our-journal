# Between Us

A two-account private messenger starter: React + Tailwind, Node/Express, Socket.IO, MySQL, browser-side AES-GCM encryption for stored text/media, and WebRTC voice/video calls.

> Security scope: this is a private-project starter, **not an audited Signal replacement**. The server stores ciphertext but the shared passphrase design does not provide Signal-style identity verification, Double Ratchet, or forward secrecy. WebRTC transport is encrypted, but production calls need TURN for reliability.

## 1. Requirements
Node.js 20+, MySQL 8+, two modern browsers. HTTPS is required for camera/microphone outside localhost.

## 2. Database
```bash
mysql -u root -p < server/schema.sql
```

## 3. Backend
```bash
cd server
cp .env.example .env
npm install
npm run create-user -- rupesh "A-strong-password-here"
npm run create-user -- partner "Another-strong-password"
npm run dev
```
Set a random `JWT_SECRET` of at least 32 characters. Set `CLIENT_ORIGIN` to your frontend URL in production. Registration is intentionally absent; users are created only from the server CLI and `MAX_USERS=2` blocks a third account.

## 4. Frontend
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
Both users log in and enter the same chat encryption passphrase. The passphrase stays in `sessionStorage` and is not sent to the backend.

## 5. What is encrypted
Text is AES-256-GCM encrypted in the browser. Images/videos are encrypted in the browser before upload. MySQL stores ciphertext/IV/salt/metadata; the upload folder stores encrypted bytes. Filename and MIME metadata are currently visible to the server. If you want metadata privacy too, encrypt those fields in a later version.

## 6. GitHub Pages
Push the repository to GitHub. In **Settings → Pages**, select **GitHub Actions**. In **Settings → Secrets and variables → Actions → Variables**, add:
- `VITE_API_URL=https://YOUR-BACKEND`
- `VITE_SOCKET_URL=https://YOUR-BACKEND`

GitHub Pages hosts only `client/`. Deploy `server/` to a Node host with WebSocket support and attach a managed MySQL database. Configure `CLIENT_ORIGIN=https://YOURNAME.github.io/YOUR_REPO`.

## 7. Production checklist
Use HTTPS/WSS; use a managed MySQL account with least privileges; move encrypted media to private object storage; add rate limiting; add refresh-token/session revocation; add a TURN server; back up ciphertext and database together; never commit `.env`; replace shared-passphrase crypto with an audited E2EE protocol before relying on this for high-security communications.

## Structure
```
client/src/components/Login.jsx
client/src/components/SecretGate.jsx
client/src/components/CallModal.jsx
client/src/crypto/e2ee.js
client/src/services/api.js
client/src/App.jsx
server/src/routes/auth.js
server/src/routes/messages.js
server/src/routes/media.js
server/src/sockets/index.js
server/src/create-user.js
server/schema.sql
.github/workflows/pages.yml
```
