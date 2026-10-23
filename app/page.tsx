"use client";

import { useState, useSyncExternalStore } from "react";
import { activeSession, clockStore, formatDate, formatDuration, removeSession, sessionDuration, sessionStore, startSession, stopSession, totalDuration } from "@/lib/time-tracker";

export default function Home() {
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const now = useSyncExternalStore(clockStore.subscribe, clockStore.getSnapshot, clockStore.getServerSnapshot);
  const [label, setLabel] = useState("Deep work");
  const active = activeSession(sessions);
  const total = totalDuration(sessions, now);
  const start = () => sessionStore.update((current) => startSession(current, label, crypto.randomUUID(), Date.now()));
  const stop = () => sessionStore.update((current) => stopSession(current, Date.now()));

  return (
    <main className="time-room">
      <header className="station-bar"><div className="station-mark">B/06</div><div className="station-name"><strong>TIME CARD ROOM</strong><span>LOCAL WORK SESSION REGISTER</span></div><div className="station-state"><i /> {active ? "CLOCK RUNNING" : "READY TO CLOCK IN"}</div></header>
      <section className="time-hero"><div><p className="section-kicker">BOOKCHAOWALIT / DAILY REGISTER</p><h1>Clock in.<br /><em>Keep the day.</em></h1><p className="hero-note">A small, honest stopwatch for the work in front of you. The register stays on this device.</p></div><div className="punch-stamp" aria-label="Local browser timer"><span>REGISTER</span><strong>LOCAL</strong><b>NO SYNC</b></div></section>
      <section className="clock-sheet" aria-label="Active timer">
        <div className="clock-face"><div className="clock-rings" aria-hidden="true"><span /><span /><span /></div><p>{active ? "CURRENT SESSION" : "NEXT SESSION"}</p><strong>{active ? formatDuration(sessionDuration(active, now)) : "00:00:00"}</strong><span>{active ? active.label : "No active timer"}</span></div>
        <div className="clock-controls"><label><span>SESSION LABEL</span><input value={label} onChange={(event) => setLabel(event.target.value)} disabled={Boolean(active)} /></label><div className="control-line">{active ? <button type="button" className="stop-button" onClick={stop}>Stop session <b>■</b></button> : <button type="button" className="start-button" onClick={start}>Start session <b>↗</b></button>}<p>Label before you clock in. Stop when the work is done.</p></div></div>
        <aside className="day-total"><span>TOTAL LOGGED</span><strong>{formatDuration(total)}</strong><small>{sessions.length} {sessions.length === 1 ? "entry" : "entries"} in this register</small></aside>
      </section>
      <section className="ledger-section" aria-label="Session history"><div className="ledger-heading"><div><p className="section-kicker">PUNCH CARD LEDGER</p><h2>What the day held.</h2></div><span>{sessions.length ? "LOCAL HISTORY" : "EMPTY REGISTER"}</span></div>{sessions.length === 0 ? <div className="empty-ledger"><span>—</span><p>No sessions yet. Start the first card above.</p></div> : <div className="ledger-list">{sessions.map((session, index) => <article className={`ledger-row ${session.end === null ? "is-live" : ""}`} key={session.id}><span className="row-number">{String(index + 1).padStart(2, "0")}</span><div className="row-copy"><strong>{session.label}</strong><span>{formatDate(session.start)}{session.end ? ` → ${formatDate(session.end)}` : " · still running"}</span></div><b className="row-duration">{formatDuration(sessionDuration(session, now))}</b><button type="button" className="delete-button" onClick={() => sessionStore.update((current) => removeSession(current, session.id))}>Remove</button></article>)}</div>}{sessions.length > 0 && <button type="button" className="clear-button" onClick={() => sessionStore.update(() => [])}>Clear register</button>}</section>
      <footer className="time-footer"><span>BOOKCHAOWALIT / TIME TRACKER</span><span>BROWSER STATE · DEMO-GRADE</span></footer>
    </main>
  );
}
