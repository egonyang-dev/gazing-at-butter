# Gazing at Butter

An interactive installation that requires collective observation to maintain the state of melting butter. Without viewers, the butter burns. With viewers, it stabilizes.

The system does not simulate this. It does it.

---

## Concept

A block of butter is placed on a pan. It is heated continuously. The only mechanism for preventing it from burning is for people to watch it — together, in real time, through a shared interface.

The installation asks what it means to maintain something through attention. The butter does not respond to effort, care, or intent. It responds only to the fact of being looked at.

---

## How It Works

Each participant connects to a shared session via browser. A camera detects whether they are actively gazing at the screen. The server tracks the ratio of observers to total participants.

If the gaze ratio exceeds the threshold, heat decreases. If too few people are watching, the heat climbs.

The butter progresses through states: **Stable — Melting — Browning — Burning — Irreversible.**

Once burnt, the session ends. A new session begins.

---

## System Behavior

| Condition | Observer ratio | Thermal result |
|-----------|----------------|----------------|
| Stable | > 60% observing | Heat decreases 1.5 / 500ms |
| Unstable | < 60% observing | Heat increases 2.5 / 500ms |
| Burning threshold | — | Heat ≥ 60 |
| Irreversible | — | Heat = 100 |

The butter becomes irreversible in approximately 17 seconds with no observers. With sufficient collective gaze, it holds indefinitely.

---

## Participation

**Participate** — requires camera access. Your gaze is detected locally using facial landmark estimation. No image data is transmitted or stored.

**Observe only** — no camera. You are counted as a participant but your gaze is not registered. This shifts the balance toward burning.

---

## Running the Installation

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in one or more browsers. The system responds to collective participation — a single viewer is insufficient under most conditions.

---

## Running the Visual Test

```bash
npm test
```

This runs a Playwright script that records two scenarios:

- **Stable** — three observers, heat held at 5. Captures 5 frames over 10 seconds.
- **Burning** — no observers, heat climbs from server state. Captures 10 frames over 20 seconds.

Screenshots are saved to `screenshots/`.

---

## Technical Notes

Server: Node.js, Express, Socket.io  
Rendering: p5.js (canvas, Perlin noise, film grain, camera shake)  
Gaze detection: TensorFlow.js, MediaPipe FaceMesh, Eye Aspect Ratio  
Testing: Playwright

The live version at [egonyang-dev.github.io/gazing-at-butter](https://egonyang-dev.github.io/gazing-at-butter) is a static preview. The real-time collective behavior requires the Node.js server.
