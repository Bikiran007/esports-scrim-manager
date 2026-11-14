// server/src/models/Scrim.ts
import mongoose, { Schema, Document } from "mongoose";

export interface ISlot {
  slotNumber: number;
  isBooked: boolean;
  teamName: string | null;
  captainIgn: string | null;
  bookedAt: Date | null;
}

export interface ILeaderboardEntry {
  slotNumber: number;
  teamName: string;
  kills: number;
  placementPoints: number;
  totalPoints: number;
  playersAlive: number;
}

export interface IScrim extends Document {
  title: string;
  map: "Erangel" | "Miramar" | "Sanhok" | "Vikendi";
  matchTime: Date;
  status: "Registration Open" | "Live" | "Completed";
  slots: ISlot[];
  leaderboard: ILeaderboardEntry[];
}

const SlotSchema = new Schema<ISlot>({
  slotNumber: { type: Number, required: true },
  isBooked: { type: Boolean, default: false },
  teamName: { type: String, default: null },
  captainIgn: { type: String, default: null },
  bookedAt: { type: Date, default: null },
});

const LeaderboardSchema = new Schema<ILeaderboardEntry>({
  slotNumber: { type: Number, required: true },
  teamName: { type: String, required: true },
  kills: { type: Number, default: 0 },
  placementPoints: { type: Number, default: 0 },
  totalPoints: { type: Number, default: 0 },
  playersAlive: { type: Number, default: 4, min: 0, max: 4 },
});

const ScrimSchema = new Schema<IScrim>(
  {
    title: { type: String, required: true },
    map: {
      type: String,
      enum: ["Erangel", "Miramar", "Sanhok", "Vikendi"],
      default: "Erangel",
    },
    matchTime: { type: Date, required: true },
    status: {
      type: String,
      enum: ["Registration Open", "Live", "Completed"],
      default: "Registration Open",
    },
    slots: [SlotSchema],
    leaderboard: [LeaderboardSchema],
  },
  { timestamps: true },
);

export default mongoose.model<IScrim>("Scrim", ScrimSchema);
