"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [loadStatus, setLoadStatus] = useState("Initializing 3D arena & loading assets...");

  useEffect(() => {
    let isCancelled = false;

    const scripts = [
      "/game/three.min.js",
      "/game/sfx-data.js",
      "/game/music-data.js",
      "/game/core.js",
      "/game/gfx.js",
      "/game/world.js",
      "/game/toon.js",
      "/game/forge.js",
      "/game/model.js",
      "/game/hero-data.js",
      "/game/foe-data.js",
      "/game/actors.js",
      "/game/foes.js",
      "/game/skills.js",
      "/game/board.js",
      "/game/game.js",
    ];

    async function loadEngine() {
      for (let i = 0; i < scripts.length; i++) {
        if (isCancelled) return;
        const src = scripts[i];
        const filename = src.split("/").pop();
        setLoadStatus(`Loading ${filename} (${i + 1}/${scripts.length})...`);

        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(`script[data-game="${src}"]`);
          if (existing) {
            resolve();
            return;
          }
          const s = document.createElement("script");
          s.src = src;
          s.async = false;
          s.dataset.game = src;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.body.appendChild(s);
        });
      }

      if (!isCancelled) {
        setLoading(false);
      }
    }

    loadEngine().catch((err) => {
      console.error("Game engine load error:", err);
      setLoadStatus("Error loading 3D assets. Please refresh the page.");
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0a12]">
      {/* Loading Screen Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0b0a12] text-[#f3ecdf] p-6 text-center select-none">
          <div className="relative mb-6">
            <h1 className="font-['Chakra_Petch',sans-serif] italic font-bold text-4xl sm:text-6xl tracking-wider text-[#f3ecdf]">
              TEN <span className="text-[#b46bff] drop-shadow-[0_0_25px_#b46bff]">ARMS</span>
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] text-[#f3ecdf]/60 mt-1">
              One Forest Clearing · Ten Weapons
            </p>
          </div>

          <div className="w-64 max-w-[80vw] h-1.5 bg-[#f3ecdf]/10 border border-[#f3ecdf]/20 overflow-hidden relative mb-4">
            <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#b46bff] to-[#58e6ff] animate-pulse w-full origin-left" />
          </div>

          <p className="font-['Chakra_Petch',sans-serif] text-xs uppercase tracking-[0.2em] text-[#f3ecdf]/70">
            {loadStatus}
          </p>
        </div>
      )}

      {/* Main Game Container */}
      <div id="app">
        <canvas id="gl" tabIndex={0} aria-label="3D arena" />

        {/* In-Game HUD */}
        <div id="hud" className="safe" hidden>
          <div className="corner tl" id="vitals">
            <span className="eyebrow">Vitality</span>
            <div className="gauge hp">
              <i className="ghost" id="hpGhost" />
              <i id="hpBar" />
            </div>
            <div className="gauge en" id="enWrap">
              <i id="enBar" />
            </div>
            <div id="buffs" />
          </div>

          <div className="corner tc">
            <div id="wave">WAVE 1</div>
            <div id="left" />
            <div id="boss" hidden>
              <b id="bossName" />
              <div className="gauge">
                <i id="bossBar" />
              </div>
            </div>
          </div>

          <div className="corner tr">
            <div className="stat gold">
              <small>SCORE</small>
              <span id="score">0</span>
            </div>
            <div className="stat sub">
              <small>BEST</small>
              <span id="best">0</span>
            </div>
            <div id="rival" hidden>
              <small id="rivalL" />
              <span id="rivalT" />
            </div>
            <div className="hudbtns">
              <button id="bMute" type="button" title="Sound on/off (M)" aria-label="Sound on/off">
                ♪
              </button>
              <button id="bPause" type="button" title="Pause (P)" aria-label="Pause">
                II
              </button>
              <button id="bFull" type="button" title="Fullscreen (F)" aria-label="Fullscreen">
                ⛶
              </button>
            </div>
          </div>

          <div id="tags" />
          <div id="nums" />
          <div id="combo">
            <span className="rank" id="rank" />
            <span className="n" id="hits">
              0
            </span>
            <span className="lbl">HIT</span>
            <div className="mult" id="mult" />
          </div>
          <div id="banner">
            <b />
            <span />
          </div>
          <div id="caption" />

          {/* Weapon rail at bottom */}
          <div id="rail">
            <div id="skills">
              <button type="button" className="skill" id="skill0">
                <kbd>Q</kbd>
                <span />
                <i />
              </button>
              <button type="button" className="skill" id="skill1">
                <kbd>E</kbd>
                <span />
                <i />
              </button>
              <button type="button" className="skill" id="skill2">
                <kbd>R</kbd>
                <span />
                <i />
              </button>
              <button type="button" className="skill ult" id="skill3">
                <kbd>RMB</kbd>
                <span />
                <i />
              </button>
            </div>
            <div id="wname" />
            <div id="slots" />
          </div>

          {/* Mobile Touch Controls */}
          <div id="touch">
            <div id="stick" hidden>
              <i />
            </div>
            <button className="tbtn" id="tA" type="button">
              SLASH
            </button>
            <button className="tbtn" id="tD" type="button">
              DODGE
            </button>
            <button className="tbtn" id="tS1" type="button">
              1
            </button>
            <button className="tbtn" id="tS2" type="button">
              2
            </button>
            <button className="tbtn" id="tS3" type="button">
              3
            </button>
            <button className="tbtn" id="tS" type="button">
              ULTI
            </button>
            <button className="tbtn" id="tP" type="button" aria-label="Previous weapon">
              ◀
            </button>
            <button className="tbtn" id="tN" type="button" aria-label="Next weapon">
              ▶
            </button>
          </div>
        </div>

        {/* Title Screen Overlay */}
        <div id="title" className="safe overlay">
          <span className="eyebrow">Ten weapons · one forest clearing</span>
          <h1>
            TEN <span>ARMS</span>
          </h1>
          <p className="lede">
            The dead rise in waves. Switch weapons mid-combo to multiply your score, dodge at the last second to slow time, and charge your energy for an ultimate.
          </p>

          <aside id="topCard" hidden>
            <header>
              <span className="eyebrow">
                <i className="dot on" id="topDot" />
                Leaderboard
              </span>
              <button id="bTop" type="button">
                VIEW ALL
              </button>
            </header>
            <ol className="blist" id="topList" />
            <p className="bnote" id="topNote" />
          </aside>

          <div className="row">
            <div className="ctas">
              <button className="cta" id="bStart" type="button">
                ENTER THE FIGHT
              </button>
              <button className="cta ghost" id="bRanks" type="button">
                LEADERBOARD
              </button>
            </div>
            <dl className="keys" id="keysDesk">
              <dt>Move</dt>
              <dd>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd>
              </dd>
              <dt>Slash</dt>
              <dd>
                <kbd>Left click</kbd>
                <kbd>J</kbd> hold to chain combos
              </dd>
              <dt>Moves</dt>
              <dd>
                <kbd>Q</kbd>
                <kbd>E</kbd>
                <kbd>R</kbd> each weapon has its own three
              </dd>
              <dt>Ultimate</dt>
              <dd>
                <kbd>Right click</kbd>
                <kbd>K</kbd>
              </dd>
              <dt>Dodge</dt>
              <dd>
                <kbd>Space</kbd>
              </dd>
              <dt>Weapon</dt>
              <dd>
                <kbd>1</kbd>–<kbd>0</kbd> scroll wheel
              </dd>
              <dt>Camera</dt>
              <dd>
                <kbd>Mouse</kbd> or <kbd>←</kbd>
                <kbd>→</kbd>
              </dd>
            </dl>
          </div>
        </div>

        {/* Pause Screen Overlay */}
        <div id="pause" className="safe overlay center" hidden>
          <span className="eyebrow">Pause</span>
          <h2>TAKE A BREATH</h2>
          <button className="cta" id="bResume" type="button">
            RESUME
          </button>
          <button className="cta ghost" id="bQuit" type="button">
            RESTART
          </button>
          <button className="cta ghost" id="bRanksPause" type="button">
            LEADERBOARD
          </button>
        </div>

        {/* Game Over Screen Overlay */}
        <div id="over" className="safe overlay center" hidden>
          <span className="eyebrow">Defeated</span>
          <h2 id="overTitle">GAME OVER</h2>
          <div className="results">
            <div>
              <small>WAVE</small>
              <span id="rWave">1</span>
            </div>
            <div>
              <small>SCORE</small>
              <span id="rScore">0</span>
            </div>
            <div>
              <small>LONGEST COMBO</small>
              <span id="rCombo">0</span>
            </div>
            <div>
              <small>BEST</small>
              <span id="rBest">0</span>
            </div>
          </div>
          <div className="board mini" id="overBoard" hidden>
            <div className="place" id="overPlace" />
            <ol className="blist" id="overList" />
          </div>
          <form className="sign" id="overForm" hidden>
            <label htmlFor="overIn">Sign this run</label>
            <input
              id="overIn"
              type="text"
              maxLength={14}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              enterKeyHint="done"
            />
            <button type="submit">SUBMIT</button>
          </form>
          <p className="bnote" id="overNote" />
          <div className="btns">
            <button className="cta" id="bAgain" type="button">
              FIGHT AGAIN
            </button>
            <button className="cta ghost" id="bRanksOver" type="button">
              LEADERBOARD
            </button>
          </div>
        </div>

        {/* Leaderboard Screen Overlay */}
        <div id="ranks" className="safe overlay center" hidden>
          <span className="eyebrow">Leaderboard</span>
          <h2>HALL OF ARMS</h2>
          <div className="board" id="rankBoard">
            <div className="brow bhead">
              <span className="brank">#</span>
              <span />
              <span className="bname">Fighter</span>
              <span className="bwave">Wave</span>
              <span className="bkills">Kills</span>
              <span className="bcombo">Combo</span>
              <span className="bsc">Score</span>
            </div>
            <ol className="blist" id="rankList" />
            <div className="byou" id="rankYou" hidden />
          </div>
          <p className="bnote" id="rankNote" />
          <form className="sign" id="nameForm" hidden>
            <label htmlFor="nameIn">Callsign</label>
            <input
              id="nameIn"
              type="text"
              maxLength={14}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              enterKeyHint="done"
            />
            <button type="submit" id="nameGo">
              SAVE
            </button>
          </form>
          <button className="cta ghost" id="bRanksBack" type="button">
            BACK
          </button>
        </div>

        {/* WebGL Not Supported Screen */}
        <div id="fail" hidden>
          This browser could not start WebGL, so the arena cannot render. Try a recent version of Chrome, Brave or Firefox.
        </div>
      </div>
    </main>
  );
}
