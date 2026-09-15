/**
 * projectilesPhysics.js
 * 
 * Pure physics engine and mathematical utilities for the Horizontal Projectiles Lab
 * (Bullseye & Carbon Paper Simulation).
 * 
 * Zero DOM dependencies for Node.js testability.
 * 
 * Part of "The Thinking Experiment" PhysicsKit.
 * Strictly adheres to SI Metric units and experimental physics pedagogy.
 */

class ProjectilesPhysics {
  // Physical constants (SI units)
  static G = 9.80; // m/s^2 (Standard gravitational acceleration)
  static BALL_RADIUS = 0.0125; // 1.25 cm = 0.0125 m (Standard 2.5 cm diameter steel ball)
  static BALL_MASS = 0.065; // 65 g = 0.065 kg
  static ROLLING_FACTOR = 5 / 7; // For solid sphere rolling without slipping: I = (2/5)mr^2 -> a = (5/7)g*sin(theta)
  static TRACK_EFFICIENCY = 0.98; // Realistic slight rolling bearing/surface friction efficiency
  
  // Default experimental apparatus parameters
  static DEFAULT_PHOTOGATE_DISTANCE = 0.100; // 10.0 cm = 0.100 m
  static DEFAULT_TABLE_HEIGHT = 0.90; // 90 cm = 0.90 m
  static DEFAULT_RAMP_ANGLE = 30; // 30 degrees
  static DEFAULT_RELEASE_DISTANCE = 0.45; // 45 cm = 0.45 m along incline
  static RAMP_CURVE_RADIUS = 0.15; // 15 cm transition curve radius from incline to table
  static PAPER_LENGTH = 0.280; // Standard US Letter folded hotdog style length ~ 28.0 cm (0.280 m)
  static PAPER_WIDTH = 0.108; // Width ~ 10.8 cm (0.108 m)

  /**
   * Convert degrees to radians.
   * @param {number} deg 
   * @returns {number} radians
   */
  static degToRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /**
   * Convert radians to degrees.
   * @param {number} rad 
   * @returns {number} degrees
   */
  static radToDeg(rad) {
    return (rad * 180) / Math.PI;
  }

  /**
   * Calculates the vertical release height above the horizontal table surface.
   * Accounts for the straight inclined ramp portion and the tangent circular transition foot.
   * 
   * @param {number} releaseDist - Distance along the straight ramp from transition start (m)
   * @param {number} rampAngleDeg - Inclination angle of the ramp in degrees
   * @param {number} curveRadius - Radius of the smooth transition curve to table (m)
   * @returns {number} Vertical height above table surface (m)
   */
  static calculateReleaseHeight(releaseDist, rampAngleDeg, curveRadius = ProjectilesPhysics.RAMP_CURVE_RADIUS) {
    const angleRad = ProjectilesPhysics.degToRad(rampAngleDeg);
    const straightHeight = Math.max(0, releaseDist) * Math.sin(angleRad);
    const curveHeight = curveRadius * (1 - Math.cos(angleRad));
    return straightHeight + curveHeight;
  }

  /**
   * Calculates the horizontal exit velocity of a rolling solid sphere entering the table track.
   * Derived from energy conservation for rolling without slipping:
   * m*g*h = (1/2)*m*v^2 + (1/2)*I*omega^2 = (7/10)*m*v^2
   * v = sqrt((10/7) * eta * g * h)
   * 
   * @param {number} releaseDist - Distance along the straight ramp (m)
   * @param {number} rampAngleDeg - Ramp angle in degrees
   * @param {Object} [options] - Optional overrides (noiseStdDev, efficiency, g, seed)
   * @returns {number} Velocity on table in m/s
   */
  static calculateRampExitVelocity(releaseDist, rampAngleDeg, options = {}) {
    const g = options.g ?? ProjectilesPhysics.G;
    const efficiency = options.efficiency ?? ProjectilesPhysics.TRACK_EFFICIENCY;
    const height = ProjectilesPhysics.calculateReleaseHeight(releaseDist, rampAngleDeg, options.curveRadius);
    
    if (height <= 0) return 0;

    // Ideal velocity from rolling conservation of energy
    const idealVelocity = Math.sqrt((10 / 7) * efficiency * g * height);

    // Optional realistic micro-scatter (e.g., student release hand quiver or minor track dust)
    const noiseStdDev = options.noiseStdDev ?? 0;
    if (noiseStdDev > 0) {
      // Gaussian noise via Box-Muller transform or provided random value
      const randNormal = options.randomNormal ?? ProjectilesPhysics.generateGaussianNoise();
      const noisyVelocity = idealVelocity * (1 + randNormal * noiseStdDev);
      return Math.max(0, noisyVelocity);
    }

    return idealVelocity;
  }

  /**
   * Helper to generate standard normal random variate N(0, 1) via Box-Muller.
   * @returns {number}
   */
  static generateGaussianNoise() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Calculates the time required for the ball to traverse the photogate gap.
   * Delta_t = d / v
   * 
   * @param {number} velocity - Horizontal speed across photogates (m/s)
   * @param {number} gateDistance - Known distance between photogate beams (m)
   * @returns {number} Transit time interval in seconds (or Infinity if v <= 0)
   */
  static calculatePhotogateTime(velocity, gateDistance = ProjectilesPhysics.DEFAULT_PHOTOGATE_DISTANCE) {
    if (velocity <= 0) return Infinity;
    return gateDistance / velocity;
  }

  /**
   * Calculates the time the ball takes to fall from the table edge to the floor.
   * y(t) = H - (1/2)*g*t^2 = 0  =>  t = sqrt(2 * H / g)
   * 
   * @param {number} tableHeight - Vertical height of table above floor (m)
   * @param {number} [g] - Gravitational acceleration (m/s^2)
   * @returns {number} Fall time in seconds
   */
  static calculateFallTime(tableHeight, g = ProjectilesPhysics.G) {
    if (tableHeight <= 0) return 0;
    return Math.sqrt((2 * tableHeight) / g);
  }

  /**
   * Calculates the horizontal landing distance from the plumb line at table edge.
   * x_land = v_0x * t_fall = v_0x * sqrt(2 * H / g)
   * 
   * @param {number} velocity - Initial horizontal velocity at table edge (m/s)
   * @param {number} tableHeight - Table height above floor (m)
   * @param {number} [g] - Gravitational acceleration (m/s^2)
   * @returns {number} Horizontal landing distance in meters
   */
  static calculateLandingDistance(velocity, tableHeight, g = ProjectilesPhysics.G) {
    const tFall = ProjectilesPhysics.calculateFallTime(tableHeight, g);
    return velocity * tFall;
  }

  /**
   * Generates discrete trajectory points (x, y) for the ball during projectile flight.
   * x(t) = v_0x * t
   * y(t) = tableHeight - (1/2) * g * t^2
   * 
   * @param {number} velocity - Launch horizontal velocity (m/s)
   * @param {number} tableHeight - Table height above floor (m)
   * @param {number} [numPoints=50] - Number of points along the trajectory
   * @param {number} [g=9.80] - Gravity
   * @returns {Array<{t: number, x: number, y: number, vx: number, vy: number}>}
   */
  static calculateTrajectory(velocity, tableHeight, numPoints = 50, g = ProjectilesPhysics.G) {
    const tFall = ProjectilesPhysics.calculateFallTime(tableHeight, g);
    const points = [];
    
    if (tFall <= 0) {
      return [{ t: 0, x: 0, y: tableHeight, vx: velocity, vy: 0 }];
    }

    const dt = tFall / (numPoints - 1);
    for (let i = 0; i < numPoints; i++) {
      const t = Math.min(tFall, i * dt);
      const x = velocity * t;
      const y = Math.max(0, tableHeight - 0.5 * g * t * t);
      const vx = velocity;
      const rawVy = -g * t;
      const vy = Math.abs(rawVy) < 1e-9 ? 0 : rawVy;
      points.push({ t, x, y, vx, vy });
    }

    return points;
  }

  /**
   * Evaluates a landing strike relative to the student's folded target paper.
   * The paper has a center crease at predictedX.
   * 
   * @param {number} actualLandingX - Actual floor impact distance from table edge (m)
   * @param {number} predictedX - Student's predicted distance where crease is placed (m)
   * @param {number} [paperLength] - Total length of target paper (m)
   * @returns {Object} Evaluation summary
   */
  static evaluateTargetHit(actualLandingX, predictedX, paperLength = ProjectilesPhysics.PAPER_LENGTH) {
    const halfLen = paperLength / 2;
    const paperStart = predictedX - halfLen;
    const paperEnd = predictedX + halfLen;
    const hitOnPaper = actualLandingX >= paperStart && actualLandingX <= paperEnd;
    
    // Deviation from the crease line (+ means landed past crease, - means landed short of crease)
    const deviation = actualLandingX - predictedX;
    const absDeviation = Math.abs(deviation);
    
    // Percent error relative to actual landing distance
    const percentError = actualLandingX > 0 ? (absDeviation / actualLandingX) * 100 : 0;

    // Qualitative rating based on precision (in mm)
    let rating = "";
    let ratingCategory = "";
    let badgeClass = "";

    if (absDeviation <= 0.005) { // within 5 mm
      rating = "Direct Hit on Crease! 🎯";
      ratingCategory = "bullseye";
      badgeClass = "badge-bullseye";
    } else if (absDeviation <= 0.015) { // within 1.5 cm
      rating = "Excellent Prediction! 🎯";
      ratingCategory = "excellent";
      badgeClass = "badge-success";
    } else if (absDeviation <= 0.030) { // within 3.0 cm
      rating = "Good Prediction! 👍";
      ratingCategory = "good";
      badgeClass = "badge-good";
    } else if (hitOnPaper) {
      rating = "On Paper (Review Calculations) ⚠️";
      ratingCategory = "on_paper";
      badgeClass = "badge-warning";
    } else {
      rating = "Missed Target Paper! ❌";
      ratingCategory = "miss";
      badgeClass = "badge-error";
    }

    return {
      actualLandingX,
      predictedX,
      deviation, // m (+ is past crease, - is short)
      deviationMm: deviation * 1000, // mm
      absDeviationMm: absDeviation * 1000, // mm
      percentError,
      hitOnPaper,
      paperStart,
      paperEnd,
      paperLength,
      rating,
      ratingCategory,
      badgeClass
    };
  }

  /**
   * Helper to compute average of an array of numbers.
   * @param {number[]} values 
   * @returns {number}
   */
  static average(values) {
    if (!values || values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ProjectilesPhysics;
}
