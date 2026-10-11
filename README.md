# Support Portal Modernization (Simulated Enterprise Project)

React + Vite client, Node.js + Express + MongoDB Atlas (Mongoose) server.
This is a simulated project for learning. Not a real client engagement.

## Phase 1: Setup

```powershell
# 1. Server
cd server
npm install
copy .env.example .env      # then edit .env and put your Atlas URI
npm run dev                 # http://localhost:5000/api/health

# 2. Client (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

## Git first commit

```powershell
git init -b main
git check-ignore -v server/.env     # must print a match
git add .
git commit -m "chore: initial project setup with server skeleton, client scaffold and requirements"
```

Never commit `server/.env`.
