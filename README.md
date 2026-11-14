# Real-Time eSports Scrim & Roster Manager

A full-stack, real-time tournament lobby and broadcast management platform built with **React, TypeScript, Node.js, Express, MongoDB, and Socket.io**. Designed for competitive T2/T3 eSports scrims to eliminate double-bookings during high-traffic lobby registrations and power live stream HUD overlays.

## Key Engineering Highlights

* **Atomic Concurrency Control (Race Condition Prevention):** Uses MongoDB atomic `findOneAndUpdate` filters (`$elemMatch` + positional `$set`) so that if multiple squad captains click the same lobby slot within the same millisecond, only the first request succeeds while all other clients receive an instant lock broadcast.
* **Room-Isolated WebSocket Architecture:** Uses Socket.io rooms (`join_scrim_room`) to isolate real-time slot locks and live leaderboard updates per match ID.
* **OBS Studio Broadcast Overlay (`?mode=overlay`):** Built-in transparent HUD view designed for OBS Browser Sources, syncing admin score updates to the live gameplay stream in `<50ms` without page refreshes.

## Tech Stack
* **Frontend:** React (Vite), TypeScript, Socket.io-Client, Axios, Custom Tactical CSS
* **Backend:** Node.js, Express.js, TypeScript (`tsx`), Socket.io
* **Database:** MongoDB Atlas & Mongoose ODM

## Local Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Bikiran007/esports-scrim-manager.git](https://github.com/Bikiran007/esports-scrim-manager.git)
   cd esports-scrim-manager