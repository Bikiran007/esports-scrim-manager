// client/src/App.tsx
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import './App.css';

const BACKEND_URL = 'http://localhost:5000';
const socket: Socket = io(BACKEND_URL);

interface ISlot {
  slotNumber: number;
  isBooked: boolean;
  teamName: string | null;
  captainIgn: string | null;
}

interface ILeaderboardEntry {
  slotNumber: number;
  teamName: string;
  kills: number;
  placementPoints: number;
  totalPoints: number;
}

interface IScrim {
  _id: string;
  title: string;
  map: 'Erangel' | 'Miramar' | 'Sanhok' | 'Vikendi';
  status: string;
  slots: ISlot[];
  leaderboard: ILeaderboardEntry[];
}

export default function App() {
  const [scrim, setScrim] = useState<IScrim | null>(null);
  const [teamName, setTeamName] = useState('');
  const [captainIgn, setCaptainIgn] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedOverlay, setCopiedOverlay] = useState(false);

  // New Scrim Modal/Bar states for Admin
  const [newLobbyTitle, setNewLobbyTitle] = useState('');
  const [newLobbyMap, setNewLobbyMap] = useState<'Erangel' | 'Miramar' | 'Sanhok' | 'Vikendi'>('Erangel');

  // Check if URL has ?mode=overlay for OBS Studio Browser Source
  const [isOverlayMode, setIsOverlayMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'overlay';
  });

  useEffect(() => {
    if (isOverlayMode) {
      document.body.classList.add('obs-overlay-mode');
    } else {
      document.body.classList.remove('obs-overlay-mode');
    }
  }, [isOverlayMode]);

  // Fetch active scrim on mount
  useEffect(() => {
    const loadScrim = async () => {
      try {
        const res = await axios.get<IScrim[]>(`${BACKEND_URL}/api/scrims`);
        let activeScrim = res.data[0];

        if (!activeScrim) {
          const created = await axios.post<IScrim>(`${BACKEND_URL}/api/scrims`, {
            title: 'BGMI Pro Scrims • Tier-2 Official Lobby',
            map: 'Erangel',
          });
          activeScrim = created.data;
        }

        setScrim(activeScrim);
        socket.emit('join_scrim_room', activeScrim._id);
      } catch (err) {
        setErrorMsg('Cannot reach backend server on port 5000.');
      }
    };

    loadScrim();
  }, []);

  // Listen for real-time WebSocket broadcasts
  // Listen for real-time WebSocket broadcasts
  useEffect(() => {
    socket.on('scrim_state_updated', (updatedScrim: IScrim) => {
      setScrim(updatedScrim);
      setErrorMsg(null);
    });

    // Automatically switch all tabs & OBS Overlay when Admin launches a new lobby
    socket.on('scrim_created', (newScrim: IScrim) => {
      setScrim(newScrim);
      socket.emit('join_scrim_room', newScrim._id);
      setErrorMsg(null);
    });

    socket.on('booking_error', (data: { message: string }) => {
      setErrorMsg(data.message);
    });

    return () => {
      socket.off('scrim_state_updated');
      socket.off('scrim_created');
      socket.off('booking_error');
    };
  }, []);

  const handleBookSlot = (slotNumber: number) => {
    if (!scrim) return;
    if (!teamName.trim() || !captainIgn.trim()) {
      setErrorMsg('Enter both your Squad Name and Captain IGN in the registration bar first.');
      return;
    }

    socket.emit('attempt_slot_booking', {
      scrimId: scrim._id,
      slotNumber,
      teamName: teamName.trim(),
      captainIgn: captainIgn.trim(),
    });
  };

  const handleScoreUpdate = (
    slotNumber: number,
    kills: number,
    placementPoints: number
  ) => {
    if (!scrim) return;
    const safeKills = Math.max(0, kills);
    const safePlace = Math.max(0, placementPoints);

    socket.emit('admin_update_score', {
      scrimId: scrim._id,
      slotNumber,
      kills: safeKills,
      placementPoints: safePlace,
    });
  };

  const handleCreateNewLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const finalTitle =
      newLobbyTitle.trim() ||
      `BGMI ${newLobbyMap} Scrims • Lobby #${Math.floor(100 + Math.random() * 900)}`;

    try {
      const created = await axios.post<IScrim>(`${BACKEND_URL}/api/scrims`, {
        title: finalTitle,
        map: newLobbyMap,
      });
      setScrim(created.data);
      socket.emit('join_scrim_room', created.data._id);
      setNewLobbyTitle('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err?.response?.data?.message ||
          'Failed to create new lobby. Check if the backend server on port 5000 is running.'
      );
    }
  };

  const copyObsUrl = () => {
    const url = `${window.location.origin}/?mode=overlay`;
    navigator.clipboard.writeText(url);
    setCopiedOverlay(true);
    setTimeout(() => setCopiedOverlay(false), 2500);
  };

  if (!scrim) {
    return (
      <div style={{ padding: 40, color: '#f8fafc', fontFamily: 'Rajdhani, sans-serif', fontSize: 22 }}>
        INITIALIZING TACTICAL BROADCAST SERVER...
      </div>
    );
  }

  // Sort standings highest to lowest by Total Points, then Finishes (tie-breaker)
  const sortedLeaderboard = [...scrim.leaderboard].sort(
    (a, b) => b.totalPoints - a.totalPoints || b.kills - a.kills
  );

  const bookedCount = scrim.slots.filter((s) => s.isBooked).length;
  const totalLobbyFinishes = scrim.leaderboard.reduce((acc, curr) => acc + curr.kills, 0);
  const topLeader = sortedLeaderboard[0]?.teamName || 'TBD';

  // =========================================================================
  // VIEW 1: TRANSPARENT OBS STUDIO STREAM OVERLAY (?mode=overlay)
  // =========================================================================
  if (isOverlayMode) {
    return (
      <div className="obs-hud-wrapper">
        {/* Exit preview button (only visible on hover if testing in browser) */}
        {!window.location.search.includes('mode=overlay') && (
          <button
            onClick={() => setIsOverlayMode(false)}
            className="tactical-btn"
            style={{ marginBottom: 10, fontSize: 12, padding: '4px 10px' }}
          >
            ← Exit Overlay Preview
          </button>
        )}

        <div className="obs-hud-header">
          <div>
            <div style={{ fontSize: 11, color: '#f59e0b', letterSpacing: 1.5, fontWeight: 700 }}>
              LIVE STANDINGS • {scrim.map.toUpperCase()}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.8 }}>
              {scrim.title}
            </div>
          </div>
          <div className="live-badge">
            <span className="live-dot" />
            LIVE
          </div>
        </div>

        <div className="obs-hud-columns">
          <span>#</span>
          <span>SQUAD</span>
          <span style={{ textAlign: 'center' }}>FIN</span>
          <span style={{ textAlign: 'center' }}>PLC</span>
          <span style={{ textAlign: 'right' }}>PTS</span>
        </div>

        {sortedLeaderboard.length === 0 ? (
          <div className="obs-hud-row" style={{ gridTemplateColumns: '1fr', color: '#94a3b8' }}>
            WAITING FOR SQUADS TO LOCK SLOTS...
          </div>
        ) : (
          sortedLeaderboard.slice(0, 16).map((entry, idx) => (
            <div
              key={entry.slotNumber}
              className={`obs-hud-row ${idx === 0 ? 'top-1' : ''}`}
            >
              <span style={{ color: idx === 0 ? '#f59e0b' : '#94a3b8' }}>
                #{idx + 1}
              </span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.teamName}
              </span>
              <span style={{ textAlign: 'center', color: '#cbd5e1' }}>
                {entry.kills}
              </span>
              <span style={{ textAlign: 'center', color: '#cbd5e1' }}>
                {entry.placementPoints}
              </span>
              <span style={{ textAlign: 'right', color: '#38bdf8', fontWeight: 800 }}>
                {entry.totalPoints}
              </span>
            </div>
          ))
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FULL COMMAND CENTER & CAPTAIN PORTAL
  // =========================================================================
  return (
    <div className="esports-app">
      <div className="esports-container">
        {/* Broadcast Header */}
        <header className="broadcast-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <span className="live-badge">
                <span className="live-dot" />
                REALTIME SOCKET.IO ENGINE
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#f59e0b',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                MAP: {scrim.map}
              </span>
            </div>
            <h1 className="tactical-title" style={{ margin: 0, fontSize: 28 }}>
              {scrim.title}
            </h1>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button onClick={copyObsUrl} className="tactical-btn cyan">
              {copiedOverlay ? '✓ Copied OBS Link!' : 'Copy OBS Overlay URL'}
            </button>
            <button
              onClick={() => setIsOverlayMode(true)}
              className="tactical-btn"
            >
              Preview Stream HUD
            </button>
            <button
              onClick={() => setIsAdmin(!isAdmin)}
              className={`tactical-btn ${isAdmin ? 'gold' : ''}`}
            >
              {isAdmin ? '★ Admin Console: ACTIVE' : 'Organizer Login / Mode'}
            </button>
          </div>
        </header>

        {/* Live Telemetry Strip */}
        <section className="stats-strip">
          <div className="stat-card">
            <span className="stat-label">Lobby Capacity</span>
            <span className="stat-value">
              {bookedCount} / {scrim.slots.length}{' '}
              <span style={{ fontSize: 14, color: '#10b981' }}>SQUADS LOCKED</span>
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Current Table Leader</span>
            <span className="stat-value" style={{ color: '#f59e0b' }}>
              {topLeader}
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Total Lobby Finishes</span>
            <span className="stat-value" style={{ color: '#38bdf8' }}>
              {totalLobbyFinishes} ELIMS
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">OBS Broadcast Sync</span>
            <span className="stat-value" style={{ color: '#10b981', fontSize: 20 }}>
              CONNECTED (&lt;50ms)
            </span>
          </div>
        </section>

        {/* Optional Admin New Lobby Creator */}
        {isAdmin && (
          <form
            onSubmit={handleCreateNewLobby}
            className="panel-box"
            style={{
              marginBottom: 24,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              borderColor: 'rgba(245, 158, 11, 0.4)',
            }}
          >
            <span className="tactical-title" style={{ color: '#f59e0b', fontSize: 16 }}>
              CREATE NEW MATCH LOBBY:
            </span>
            <input
              type="text"
              placeholder="e.g., Grand Finals - Match 2"
              value={newLobbyTitle}
              onChange={(e) => setNewLobbyTitle(e.target.value)}
              className="tactical-input"
              style={{ flex: 1, minWidth: 220 }}
            />
            <select
              value={newLobbyMap}
              onChange={(e) =>
                setNewLobbyMap(e.target.value as 'Erangel' | 'Miramar' | 'Sanhok' | 'Vikendi')
              }
              className="tactical-input"
            >
              <option value="Erangel">Erangel</option>
              <option value="Miramar">Miramar</option>
              <option value="Sanhok">Sanhok</option>
              <option value="Vikendi">Vikendi</option>
            </select>
            <button type="submit" className="tactical-btn gold">
              Launch Fresh 20-Slot Lobby
            </button>
          </form>
        )}

        {/* Squad Registration Credentials Bar */}
        <section
          className="panel-box"
          style={{
            marginBottom: 24,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            alignItems: 'center',
          }}
        >
          <div className="tactical-title" style={{ fontSize: 16, minWidth: 170 }}>
            SQUAD REGISTRATION:
          </div>
          <input
            type="text"
            placeholder="Enter Squad Tag / Name (e.g., Paper REX)"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            className="tactical-input"
            style={{ flex: 1, minWidth: 220 }}
          />
          <input
            type="text"
            placeholder="Captain In-Game Name (IGN)"
            value={captainIgn}
            onChange={(e) => setCaptainIgn(e.target.value)}
            className="tactical-input"
            style={{ flex: 1, minWidth: 220 }}
          />
        </section>

        {errorMsg && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.16)',
              border: '1px solid #f43f5e',
              color: '#fecdd3',
              padding: '12px 16px',
              borderRadius: 8,
              marginBottom: 20,
              fontWeight: 500,
            }}
          >
            ⚠ {errorMsg}
          </div>
        )}

        {/* Main 2-Column Tactical Grid */}
        <div className="dashboard-grid">
          {/* Left Column: 20-Slot Atomic Grid */}
          <div className="panel-box">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h2 className="tactical-title" style={{ margin: 0, fontSize: 20 }}>
                Lobby Slot Matrix (Atomic Lock)
              </h2>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                Click any green slot to lock instantly
              </span>
            </div>

            <div className="slots-grid">
              {scrim.slots.map((slot) => (
                <button
                  key={slot.slotNumber}
                  disabled={slot.isBooked}
                  onClick={() => handleBookSlot(slot.slotNumber)}
                  className={`slot-card ${slot.isBooked ? 'locked' : 'open'}`}
                >
                  <div className="slot-num">
                    <span style={{ color: slot.isBooked ? '#fda4af' : '#6ee7b7' }}>
                      SLOT #{String(slot.slotNumber).padStart(2, '0')}
                    </span>
                    <span>{slot.isBooked ? 'LOCKED' : 'OPEN'}</span>
                  </div>

                  <div>
                    <div
                      className="slot-team"
                      style={{ color: slot.isBooked ? '#fff' : '#10b981' }}
                    >
                      {slot.isBooked ? slot.teamName : 'CLAIM SLOT'}
                    </div>
                    <div className="slot-captain">
                      {slot.isBooked ? `IGL: ${slot.captainIgn}` : 'Available for booking'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Live Broadcast Leaderboard */}
          <div className="panel-box">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <h2 className="tactical-title" style={{ margin: 0, fontSize: 20 }}>
                Live Broadcast Standings
              </h2>
              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>
                {isAdmin ? 'Admin Live Scoring Enabled' : 'Auto-Sorted by Total Points'}
              </span>
            </div>

            {sortedLeaderboard.length === 0 ? (
              <div
                style={{
                  padding: '48px 20px',
                  textAlign: 'center',
                  color: '#64748b',
                  border: '1px dashed rgba(148, 163, 184, 0.2)',
                  borderRadius: 8,
                }}
              >
                No squads have locked a slot yet. Book a slot on the left to populate the live broadcast table.
              </div>
            ) : (
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Squad</th>
                    <th>Finishes</th>
                    <th>Place Pts</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedLeaderboard.map((entry, idx) => {
                    const rankClass =
                      idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
                    return (
                      <tr key={entry.slotNumber} className={`standings-row ${rankClass}`}>
                        <td>
                          <span className="rank-pill">{idx + 1}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{entry.teamName}</div>
                          <div style={{ fontSize: 11, color: '#64748b' }}>
                            Slot #{entry.slotNumber}
                          </div>
                        </td>

                        {/* Finishes Column */}
                        <td>
                          {isAdmin ? (
                            <div className="stepper-group">
                              <button
                                className="stepper-btn"
                                onClick={() =>
                                  handleScoreUpdate(
                                    entry.slotNumber,
                                    entry.kills - 1,
                                    entry.placementPoints
                                  )
                                }
                              >
                                -
                              </button>
                              <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700 }}>
                                {entry.kills}
                              </span>
                              <button
                                className="stepper-btn"
                                onClick={() =>
                                  handleScoreUpdate(
                                    entry.slotNumber,
                                    entry.kills + 1,
                                    entry.placementPoints
                                  )
                                }
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{entry.kills}</span>
                          )}
                        </td>

                        {/* Placement Points Column */}
                        <td>
                          {isAdmin ? (
                            <div className="stepper-group">
                              <button
                                className="stepper-btn"
                                onClick={() =>
                                  handleScoreUpdate(
                                    entry.slotNumber,
                                    entry.kills,
                                    entry.placementPoints - 1
                                  )
                                }
                              >
                                -
                              </button>
                              <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700 }}>
                                {entry.placementPoints}
                              </span>
                              <button
                                className="stepper-btn"
                                onClick={() =>
                                  handleScoreUpdate(
                                    entry.slotNumber,
                                    entry.kills,
                                    entry.placementPoints + 1
                                  )
                                }
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{entry.placementPoints}</span>
                          )}
                        </td>

                        {/* Total Points Column */}
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'Rajdhani, sans-serif',
                            fontSize: 20,
                            fontWeight: 800,
                            color: idx === 0 ? '#f59e0b' : '#38bdf8',
                          }}
                        >
                          {entry.totalPoints}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}