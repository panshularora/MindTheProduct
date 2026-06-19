import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product Council AI · AI Executive Boardroom",
  description: "4-Stage AI Alignment Engine: Resolve PRD contradictions, debate tradeoffs, and synthesize a verified product roadmap.",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    background: #050810;
    color: #f0f6fc;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    line-height: 1.6;
    min-height: 100vh;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: linear-gradient(rgba(45,212,191,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(45,212,191,0.015) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
  ::selection { background: rgba(45,212,191,0.2); color: #e2e8f0; }

  /* Layout */
  .pc-root { min-height: 100vh; display: flex; flex-direction: column; position: relative; }
  .pc-main { position: relative; z-index: 1; }

  /* Header */
  .pc-header {
    position: sticky; top: 0; z-index: 50;
    background: rgba(5,8,16,0.92);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    backdrop-filter: blur(20px);
  }
  .pc-header-inner {
    max-width: 1280px; margin: 0 auto; padding: 0 24px;
    height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }
  .pc-logo {
    display: flex; align-items: center; gap: 12px;
  }
  .pc-logo-icon {
    width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, #0d9488, #059669);
    box-shadow: 0 0 20px rgba(45,212,191,0.2);
    display: flex; align-items: center; justify-content: center; color: white;
  }
  .pc-logo-title { font-size: 0.95rem; font-weight: 700; letter-spacing: -0.02em; color: #f0f6fc; line-height: 1.2; }
  .pc-logo-sub { font-size: 0.65rem; color: #484f58; font-weight: 500; }

  /* Buttons */
  .pc-btn-judge {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 14px; border-radius: 8px;
    background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.3); color: #c4b5fd;
    font-size: 0.78rem; font-weight: 700; cursor: pointer; font-family: inherit;
    transition: all 0.2s;
  }
  .pc-btn-judge:hover { background: rgba(167,139,250,0.18); }
  .pc-btn-judge:disabled { opacity: 0.5; cursor: not-allowed; }

  .pc-btn-run {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 12px 32px; border-radius: 12px;
    background: linear-gradient(135deg, #0d9488, #059669);
    border: 1px solid rgba(45,212,191,0.3); color: #fff;
    font-size: 0.9rem; font-weight: 700; cursor: pointer; font-family: inherit;
    box-shadow: 0 4px 24px rgba(45,212,191,0.15); transition: all 0.2s;
  }
  .pc-btn-run:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 32px rgba(45,212,191,0.25); }
  .pc-btn-run:disabled { background: rgba(30,41,59,0.8); color: #484f58; border-color: transparent; box-shadow: none; cursor: not-allowed; }

  /* Cards */
  .pc-card {
    background: rgba(13,17,23,0.92);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    padding: 24px;
  }

  /* Input grid - 3 columns on desktop, 1 on mobile */
  .pc-input-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  @media (max-width: 900px) { .pc-input-grid { grid-template-columns: 1fr; } }

  .pc-input-field { display: flex; flex-direction: column; gap: 8px; }

  .pc-input-label {
    display: flex; align-items: center; gap: 7px;
    font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  }

  .pc-textarea {
    width: 100%; border-radius: 12px; padding: 12px;
    background: rgba(5,8,16,0.7); border: 1px solid rgba(255,255,255,0.08);
    color: #c9d1d9; font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.78rem; line-height: 1.65; resize: vertical; outline: none;
    transition: border-color 0.2s;
  }
  .pc-textarea::placeholder { color: #484f58; }

  /* Two column results grid */
  .pc-two-col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  @media (max-width: 1100px) { .pc-two-col { grid-template-columns: 1fr; } }

  /* Exec summary grid */
  .pc-exec-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  @media (max-width: 700px) { .pc-exec-grid { grid-template-columns: 1fr; } }

  /* Stats bar */
  .pc-stats-bar {
    display: flex; align-items: center;
    background: rgba(13,17,23,0.92);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px; padding: 16px 24px;
    overflow-x: auto; flex-wrap: nowrap;
  }

  /* Pipeline progress */
  .pc-pipeline {
    display: flex; align-items: center;
    background: rgba(13,17,23,0.92);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px; padding: 14px 20px;
    overflow-x: auto;
  }

  /* Node cards scroll */
  .pc-node-scroll {
    overflow-y: auto; flex: 1;
    display: flex; flex-direction: column; gap: 8px;
    padding-right: 4px; max-height: 520px;
  }
  .pc-node-btn {
    width: 100%; text-align: left; padding: 12px 14px;
    border-radius: 12px; cursor: pointer; font-family: inherit;
    display: flex; flex-direction: column; gap: 8px; transition: all 0.18s;
  }

  /* Tab group */
  .pc-tabs { display: flex; gap: 4px; }
  .pc-tab {
    padding: 4px 12px; border-radius: 7px; font-size: 0.72rem;
    font-weight: 600; cursor: pointer; font-family: inherit;
    border: 1px solid transparent; background: transparent; transition: all 0.15s;
  }
  .pc-tab-active { background: rgba(45,212,191,0.1); color: #2dd4bf; border-color: rgba(45,212,191,0.25); }
  .pc-tab-inactive { color: #484f58; }
  .pc-tab-inactive:hover { color: #8b949e; }

  /* Debate sessions */
  .pc-debate-session {
    border-radius: 12px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(5,8,16,0.4);
  }
  .pc-debate-session-btn {
    width: 100%; display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; cursor: pointer; background: transparent;
    border: none; font-family: inherit; text-align: left;
    transition: background 0.15s;
  }
  .pc-debate-session-btn:hover { background: rgba(255,255,255,0.02); }

  /* Typing dots */
  .pc-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  .pc-dot-1 { animation: pcBounce 1.2s ease-in-out infinite; }
  .pc-dot-2 { animation: pcBounce 1.2s ease-in-out 0.2s infinite; }
  .pc-dot-3 { animation: pcBounce 1.2s ease-in-out 0.4s infinite; }

  /* Roadmap items */
  .pc-roadmap-item { border-radius: 12px; padding: 16px; display: flex; gap: 12px; transition: all 0.2s; }

  /* Error banner */
  .pc-error { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-radius: 14px; font-size: 0.85rem; }

  /* Footer */
  .pc-footer { text-align: center; padding: 20px 24px; font-size: 0.68rem; color: #484f58; border-top: 1px solid rgba(255,255,255,0.05); position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; }

  /* Stage labels */
  .pc-stage-label { display: flex; align-items: center; gap: 10px; padding: 0 4px; margin-bottom: 10px; }
  .pc-stage-num { font-size: 0.62rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #484f58; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px; letter-spacing: 0.06em; }
  .pc-stage-name { font-size: 0.75rem; font-weight: 600; color: #8b949e; }

  /* Separator */
  .pc-separator { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 4px 0; }
  .pc-sep-label { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #484f58; white-space: nowrap; }

  /* Spinner */
  .pc-spinner { display: inline-block; border-radius: 50%; border-style: solid; animation: pcSpin 0.8s linear infinite; }

  /* Animations */
  @keyframes pcSpin { to { transform: rotate(360deg); } }
  @keyframes pcBounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-5px); opacity: 1; }
  }
  @keyframes pcPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes pcBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  @keyframes pcFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  .pc-fade-in { animation: pcFadeIn 0.4s ease both; }
  .pc-pulse { animation: pcPulse 2s infinite; }
  .pc-blink { animation: pcBlink 1s infinite; }

  /* Heatmap */
  .pc-heatmap-grid { display: grid; gap: 4px; overflow-x: auto; }
  .pc-heatmap-cell { border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 6px; min-height: 52px; position: relative; }

  /* Content max-width wrapper */
  .pc-content { max-width: 1280px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 24px; }

  /* Scrollable node list container */
  .pc-scroll-card { display: flex; flex-direction: column; max-height: 640px; overflow: hidden; }
  .pc-scroll-inner { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 16px; }

  /* Card header */
  .pc-card-header { display: flex; align-items: center; gap: 8px; padding: 16px 20px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem; font-weight: 700; color: #f0f6fc; }

  /* Upgraded UI Styles */
  .pc-highlight-flash {
    animation: flashHighlight 2s ease;
  }
  @keyframes flashHighlight {
    0%, 100% { border-color: rgba(45,212,191,0.3); background-color: rgba(45,212,191,0.06); }
    30% { border-color: #2dd4bf; background-color: rgba(45,212,191,0.25); box-shadow: 0 0 15px rgba(45,212,191,0.4); }
  }

  .pc-score-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
  }
  @media (max-width: 768px) { .pc-score-grid { grid-template-columns: 1fr 1fr; } }

  .pc-score-card {
    background: rgba(13,17,23,0.6);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px;
    padding: 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .pc-score-value {
    font-size: 1.6rem;
    font-weight: 900;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1;
  }

  /* Chat avatars and titles */
  .pc-chat-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
  }

  .pc-chat-title-group {
    display: flex;
    flex-direction: column;
  }

  .pc-chat-role {
    font-size: 0.62rem;
    color: #8b949e;
    font-weight: 500;
  }

  /* Decision impact highlights */
  .pc-node-impacted {
    box-shadow: 0 0 10px rgba(167,139,250,0.15);
    border-color: rgba(167,139,250,0.4) !important;
  }

  .pc-debate-impacted {
    border-color: rgba(167,139,250,0.4) !important;
    background: rgba(167,139,250,0.03) !important;
  }

  .pc-roadmap-impacted {
    border-color: rgba(167,139,250,0.4) !important;
    box-shadow: 0 0 12px rgba(167,139,250,0.1) !important;
  }

  /* Walkthrough guide panel */
  .pc-walkthrough-card {
    background: linear-gradient(135deg, rgba(167,139,250,0.06), rgba(96,165,250,0.06));
    border: 1px solid rgba(167,139,250,0.25);
    border-radius: 16px;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pc-walkthrough-steps {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .pc-walkthrough-step-btn {
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    color: #8b949e;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .pc-walkthrough-step-btn-active {
    background: rgba(167,139,250,0.18);
    border-color: rgba(167,139,250,0.4);
    color: #c4b5fd;
    box-shadow: 0 0 8px rgba(167,139,250,0.25);
  }

  /* Challenge comparison */
  .pc-challenge-comparison {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 12px;
    align-items: center;
    background: rgba(5,8,16,0.5);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 12px;
    padding: 10px 14px;
    margin-top: 10px;
  }

  /* Table styling for assumption collapse */
  .pc-table-container {
    width: 100%;
    overflow-x: auto;
  }

  .pc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.75rem;
    text-align: left;
  }

  .pc-table th, .pc-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .pc-table th {
    font-weight: 700;
    color: #8b949e;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.65rem;
  }
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
