# TEN ARMS · 3D Action RPG (Next.js Edition)

> **Ten weapons · One forest clearing.**
> The dead rise in waves. Switch weapons mid-combo to multiply your score, dodge at the last second to slow time, and charge your energy for an ultimate.

---

## 🎮 Tech Stack & Architecture

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Client Components, Server-Side Rendering)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with Custom Cyberpunk / Dark Fantasy Design Tokens
- **3D Graphics Engine**: [Three.js r128](https://threejs.org/) (WebGL2, PCF Soft Shadows, ACES Filmic Tonemapping, Custom Toon Shaders & HDR Bloom Pipeline)
- **Audio Engine**: Synthesized Web Audio API + Recorded CC0 Synthwave / Combat soundtrack
- **State Management**: Reactive Game State with LocalStorage Leaderboard persistence

---

## 🗡️ 10 Legendary Weapons

| # | Weapon | Special / Style | Neon Theme | Ability Keys |
|---|--------|-----------------|------------|--------------|
| 1 | **Katana** | *Moon Ring* | `#b14cff` (Purple) | Q, E, R + RMB Ultimate |
| 2 | **Twin Swords** | *Flash Step* | `#35d6ff` (Cyan) | Q, E, R + RMB Ultimate |
| 3 | **Greatsword** | *Earthbreaker* | `#ffa726` (Amber) | Q, E, R + RMB Ultimate |
| 4 | **Twin Blades** | *Blood Whirl* | `#ff2f52` (Crimson) | Q, E, R + RMB Ultimate |
| 5 | **Twin Axes** | *Twin Crescent*| `#54ff62` (Emerald) | Q, E, R + RMB Ultimate |
| 6 | **Long Staff** | *Thunder Bell* | `#4f7bff` (Cobalt) | Q, E, R + RMB Ultimate |
| 7 | **Gauntlets** | *Hundred Fists* | `#ffd23f` (Gold) | Q, E, R + RMB Ultimate |
| 8 | **Bow** | *Arrow Rain* | `#a6ff3d` (Lime) | Q, E, R + RMB Ultimate |
| 9 | **Daggers** | *Shadow Strike*| `#e8f6ff` (Frost) | Q, E, R + RMB Ultimate |
| 10| **Longsword** | *Sword Qi* | `#ff3b30` (Blood) | Q, E, R + RMB Ultimate |

---

## 🕹️ Controls

### Keyboard & Mouse
- **Move**: `W`, `A`, `S`, `D`
- **Slash**: `Left Click` or `J` (hold to chain combos)
- **Moves / Skills**: `Q`, `E`, `R` (each weapon has its own 3 unique moves)
- **Ultimate**: `Right Click` or `K` (requires full energy)
- **Perfect Dodge**: `Space` (dodge at the last millisecond to trigger Bullet-Time slow motion)
- **Switch Weapons**: `1` – `0` or `Scroll Wheel` (switch mid-combo to multiply score)
- **Camera**: `Mouse` (pointer lock) or `←` / `→`
- **Utility**: `M` (Mute/Unmute), `P` / `Esc` (Pause), `F` (Fullscreen)

### Mobile / Touch
- **Move**: Virtual thumbstick on the left half of the screen
- **Camera**: Drag on the right half of the screen
- **Actions**: Dedicated floating buttons for `SLASH`, `DODGE`, `1`, `2`, `3`, `ULTI`, `◀`, `▶`

---

## 🚀 Running the Project

```bash
# Navigate to project folder
cd /home/jay/ten-arms

# Development Mode
npm run dev

# Production Build & Start
npm run build
npm run start
```

Access the game in your browser at:
**[http://localhost:3000](http://localhost:3000)**
