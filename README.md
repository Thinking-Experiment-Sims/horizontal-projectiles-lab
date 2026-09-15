# Horizontal Projectiles: Bullseye & Carbon Paper Lab

An interactive inquiry physics simulation replicating the classic high school physics experiment: rolling a ball down an inclined ramp, timing its horizontal speed across a table with dual photogates, measuring table height, calculating the fall time, and predicting where it will land.

Part of **"The Thinking Experiment"** (PhysicsKit).

---

## 🎯 Authentic Classroom Experiment Replicated

In the classroom:
1. Students drop a ball three times from the same height on an inclined ramp mounted on a lab table.
2. The ball rolls onto the horizontal table and passes through two photogates separated by a known distance ($d = 10.0\text{ cm}$).
3. The photogate timer registers the pulse time ($\Delta t$) for each drop.
4. The ball rolls off the horizontal edge of the table and lands on the floor as a projectile.
5. Using their measurements, students calculate:
   - Initial horizontal velocity: $v_{0x} = \frac{d}{\Delta t}$
   - Fall time from table height: $t = \sqrt{\frac{2H}{g}}$
   - Predicted landing distance: $x_{\text{pred}} = v_{0x} \cdot t$
6. Students fold a sheet of paper lengthwise ("hotdog style"), creating a sharp crease line.
7. They place the paper on the floor with the crease positioned at their predicted landing distance ($x_{\text{pred}}$) from the plumb line ($x = 0$), and place carbon paper on top.
8. They release the ball for the test landing: the impact leaves a carbon dot on the paper, allowing them to measure their error in millimeters from the crease!

---

## 🔬 Key Pedagogical & Simulation Features

- **Zero Clues / Spoilers**: The simulation never reveals the calculated velocity, fall time, or landing formulas in advance. Students must perform the kinematics calculations themselves.
- **Adjustable Experimental Parameters**:
  - Ramp inclination angle ($\theta \in [15^\circ, 45^\circ]$).
  - Ball release position along ramp rail ($s \in [15\text{ cm}, 75\text{ cm}]$) with direct drag support.
  - Table height ($H \in [0.60\text{ m}, 1.30\text{ m}]$).
  - Target paper crease position ($x_{\text{pred}} \in [0.20\text{ m}, 2.30\text{ m}]$).
- **Measurement Instruments**:
  - Plumb line from table launch edge down to floor ($x = 0.00\text{ m}$).
  - Calibrated vertical height tape measure.
  - Calibrated metric floor tape with centimeter ticks.
  - Digital photogate timer console with 3-trial memory log and Gate 1 & 2 LED indicators.
- **Hotdog-Folded Target Paper & Carbon Paper**:
  - Visual white paper with central crease and carbon paper overlay on the floor.
  - Realistic carbon marks stamped at the exact impact locations.
  - Magnified Target Inspection modal with a vernier millimeter scale measuring distance from crease ($\Delta x$), percent error, and qualitative accuracy feedback (Bullseye, Excellent, Good).
- **Realistic Micro-Scatter Toggle**:
  - Simulates the authentic $\pm 0.3\%$ variation of a real lab release, producing a tight cluster of dots across the 3 drops.
- **Strict Brand Design System**:
  - Teal (`#0f7e9b`) headers, Amber (`#d67b19`) accents, pure white background cards, subtle borders (`#c8dbe3`), and no purple or gold.

---

## 🧪 Testing

Run unit tests via Node.js:
```bash
npm test
```
All physics calculations and error evaluation logic are verified in `tests/projectilesPhysics.test.js`.
