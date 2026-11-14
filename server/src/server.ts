// server/src/server.ts
import express, { Request, Response } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import Scrim from "./models/Scrim";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

// 1. Create a new Scrim with 20 empty slots
app.post("/api/scrims", async (req: Request, res: Response) => {
  try {
    const { title, map, matchTime } = req.body;

    const initialSlots = Array.from({ length: 20 }, (_, index) => ({
      slotNumber: index + 1,
      isBooked: false,
      teamName: null,
      captainIgn: null,
      bookedAt: null,
    }));

    const scrim = await Scrim.create({
      title: title || `${map || "Erangel"} Official Scrim Lobby`,
      map: map || "Erangel",
      matchTime: matchTime || new Date(),
      slots: initialSlots,
      leaderboard: [],
    });

    io.emit("scrim_created", scrim);
    res.status(201).json(scrim);
  } catch (error) {
    console.error("Create Scrim Error:", error);
    res.status(500).json({ message: "Failed to create scrim", error });
  }
});

// 2. Get all Scrims
app.get("/api/scrims", async (_req: Request, res: Response) => {
  try {
    const scrims = await Scrim.find().sort({ createdAt: -1 });
    res.json(scrims);
  } catch (error) {
    res.status(500).json({ message: "Error fetching scrims", error });
  }
});

// 3. Get a single Scrim by ID
app.get("/api/scrims/:id", async (req: Request, res: Response) => {
  try {
    const scrim = await Scrim.findById(req.params.id);
    if (!scrim) return res.status(404).json({ message: "Scrim not found" });
    res.json(scrim);
  } catch (error) {
    res.status(500).json({ message: "Error fetching scrim", error });
  }
});

// 4. Real-Time Socket.io Engine
io.on("connection", (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("join_scrim_room", (scrimId: string) => {
    socket.join(scrimId);
  });

  // MANUAL SINGLE-SLOT ATOMIC BOOKING
  socket.on(
    "attempt_slot_booking",
    async (payload: {
      scrimId: string;
      slotNumber: number;
      teamName: string;
      captainIgn: string;
    }) => {
      const { scrimId, slotNumber, teamName, captainIgn } = payload;

      try {
        const updatedScrim = await Scrim.findOneAndUpdate(
          {
            _id: scrimId,
            "slots.teamName": { $ne: teamName },
            slots: {
              $elemMatch: { slotNumber: slotNumber, isBooked: false },
            },
          },
          {
            $set: {
              "slots.$.isBooked": true,
              "slots.$.teamName": teamName,
              "slots.$.captainIgn": captainIgn,
              "slots.$.bookedAt": new Date(),
            },
            $push: {
              leaderboard: {
                slotNumber,
                teamName,
                kills: 0,
                placementPoints: 0,
                totalPoints: 0,
                playersAlive: 4,
              },
            },
          },
          { new: true },
        );

        if (!updatedScrim) {
          socket.emit("booking_error", {
            message:
              "Slot already locked by another squad, or your team already holds a slot in this lobby.",
          });
          return;
        }

        io.to(scrimId).emit("scrim_state_updated", updatedScrim);
      } catch (error) {
        socket.emit("booking_error", {
          message: "Server error while processing slot booking.",
        });
      }
    },
  );

  // BULK TEAM IMPORT (Auto-populates remaining open slots)
  socket.on(
    "admin_bulk_import_teams",
    async (payload: {
      scrimId: string;
      teams: { teamName: string; captainIgn: string }[];
    }) => {
      const { scrimId, teams } = payload;

      try {
        const scrim = await Scrim.findById(scrimId);
        if (!scrim) return;

        // Track existing team names (case-insensitive) to avoid duplicates
        const existingTeams = new Set(
          scrim.slots
            .filter((s) => s.isBooked && s.teamName)
            .map((s) => s.teamName!.toLowerCase()),
        );

        let teamIdx = 0;

        for (const slot of scrim.slots) {
          if (teamIdx >= teams.length) break;

          if (!slot.isBooked) {
            // Skip any team in the paste list that is already in the lobby
            while (
              teamIdx < teams.length &&
              existingTeams.has(teams[teamIdx].teamName.toLowerCase())
            ) {
              teamIdx++;
            }

            if (teamIdx >= teams.length) break;

            const currentTeam = teams[teamIdx];
            slot.isBooked = true;
            slot.teamName = currentTeam.teamName;
            slot.captainIgn = currentTeam.captainIgn || "Verified Roster";
            slot.bookedAt = new Date();

            scrim.leaderboard.push({
              slotNumber: slot.slotNumber,
              teamName: currentTeam.teamName,
              kills: 0,
              placementPoints: 0,
              totalPoints: 0,
              playersAlive: 4,
            });

            existingTeams.add(currentTeam.teamName.toLowerCase());
            teamIdx++;
          }
        }

        await scrim.save();
        io.to(scrimId).emit("scrim_state_updated", scrim);
      } catch (error) {
        console.error("Bulk import error:", error);
        socket.emit("booking_error", {
          message: "Failed to bulk import teams into slots.",
        });
      }
    },
  );

  // LIVE LEADERBOARD & ALIVE STATUS UPDATE (Admin Action)
  socket.on(
    "admin_update_score",
    async (payload: {
      scrimId: string;
      slotNumber: number;
      kills: number;
      placementPoints: number;
      playersAlive: number;
    }) => {
      const { scrimId, slotNumber, kills, placementPoints, playersAlive } =
        payload;
      const totalPoints = Number(kills) + Number(placementPoints);
      const clampedAlive = Math.max(0, Math.min(4, Number(playersAlive)));

      try {
        const updatedScrim = await Scrim.findOneAndUpdate(
          {
            _id: scrimId,
            "leaderboard.slotNumber": slotNumber,
          },
          {
            $set: {
              "leaderboard.$.kills": kills,
              "leaderboard.$.placementPoints": placementPoints,
              "leaderboard.$.totalPoints": totalPoints,
              "leaderboard.$.playersAlive": clampedAlive,
            },
          },
          { new: true },
        );

        if (updatedScrim) {
          io.to(scrimId).emit("scrim_state_updated", updatedScrim);
        }
      } catch (error) {
        console.error("Error updating score:", error);
      }
    },
  );

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI as string)
  .then(() => {
    console.log("Connected to MongoDB Atlas");
    server.listen(PORT, () =>
      console.log(`Server & Socket.io running on http://localhost:${PORT}`),
    );
  })
  .catch((err) => console.error("MongoDB connection error:", err));
