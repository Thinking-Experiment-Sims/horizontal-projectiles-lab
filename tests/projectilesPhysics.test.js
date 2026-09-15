/**
 * projectilesPhysics.test.js
 * 
 * Unit tests for ProjectilesPhysics kinematics, ramp rolling,
 * photogate transit timing, projectile flight, and carbon target paper hit evaluation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const ProjectilesPhysics = require("../src/projectilesPhysics.js");

test("Ramp height calculation", () => {
  // Test 30 deg incline, 0.40m along straight ramp
  const h = ProjectilesPhysics.calculateReleaseHeight(0.40, 30, 0.15);
  // straightHeight = 0.40 * sin(30 deg) = 0.20m
  // curveHeight = 0.15 * (1 - cos(30 deg)) = 0.15 * (1 - 0.866025) = 0.020096m
  // total h approx 0.2201m
  assert.ok(Math.abs(h - 0.2201) < 0.005);

  // Zero release distance should yield just curve height
  const h0 = ProjectilesPhysics.calculateReleaseHeight(0, 30, 0.15);
  assert.ok(Math.abs(h0 - 0.0201) < 0.005);
});

test("Exit velocity on table track", () => {
  // Rolling solid sphere: v = sqrt((10/7) * eta * g * h)
  // Let h = 0.20m, eta = 1.0, g = 9.80 m/s^2
  // v = sqrt((10/7) * 1.0 * 9.8 * 0.20) = sqrt(2.8) approx 1.6733 m/s
  const v = ProjectilesPhysics.calculateRampExitVelocity(0.40, 30, {
    efficiency: 1.0,
    curveRadius: 0,
    noiseStdDev: 0
  });
  // h = 0.40 * sin(30) = 0.20m
  assert.ok(Math.abs(v - 1.6733) < 0.005);
});

test("Photogate transit time", () => {
  // If velocity is 2.0 m/s and photogate distance is 0.100 m:
  // Delta_t = 0.100 / 2.0 = 0.050 s
  const dt = ProjectilesPhysics.calculatePhotogateTime(2.0, 0.100);
  assert.equal(dt, 0.050);

  // If velocity is 1.25 m/s:
  const dt2 = ProjectilesPhysics.calculatePhotogateTime(1.25, 0.100);
  assert.equal(dt2, 0.080);
});

test("Fall time from table height", () => {
  // t_fall = sqrt(2 * H / g)
  // If H = 0.80 m, g = 9.80:
  // t_fall = sqrt(1.6 / 9.8) approx 0.40406 s
  const tFall = ProjectilesPhysics.calculateFallTime(0.80, 9.80);
  assert.ok(Math.abs(tFall - 0.40406) < 0.001);

  // If H = 0, fall time is 0
  assert.equal(ProjectilesPhysics.calculateFallTime(0), 0);
});

test("Horizontal landing distance", () => {
  // x_land = v_0x * sqrt(2 * H / g)
  // If v = 2.0 m/s, H = 0.80 m, g = 9.80:
  // x_land = 2.0 * 0.40406 approx 0.8081 m
  const xLand = ProjectilesPhysics.calculateLandingDistance(2.0, 0.80, 9.80);
  assert.ok(Math.abs(xLand - 0.8081) < 0.001);
});

test("Trajectory points generation", () => {
  const points = ProjectilesPhysics.calculateTrajectory(2.0, 0.80, 10, 9.80);
  assert.equal(points.length, 10);
  
  // First point at launch
  assert.equal(points[0].t, 0);
  assert.equal(points[0].x, 0);
  assert.equal(points[0].y, 0.80);
  assert.equal(points[0].vx, 2.0);
  assert.equal(points[0].vy, 0);

  // Last point on floor
  const last = points[points.length - 1];
  assert.ok(Math.abs(last.y - 0.0) < 0.001);
  assert.ok(Math.abs(last.x - 0.8081) < 0.005);
});

test("Target paper hit evaluation - Bullseye", () => {
  const landingX = 1.152;
  const predictedX = 1.150; // 2 mm away
  const evalResult = ProjectilesPhysics.evaluateTargetHit(landingX, predictedX);

  assert.equal(evalResult.hitOnPaper, true);
  assert.ok(Math.abs(evalResult.deviationMm - 2.0) < 0.001);
  assert.equal(evalResult.ratingCategory, "bullseye");
  assert.equal(evalResult.badgeClass, "badge-bullseye");
});

test("Target paper hit evaluation - Miss", () => {
  const landingX = 1.500;
  const predictedX = 1.150; // 35 cm away, standard paper length is 28 cm (half is 14 cm)
  const evalResult = ProjectilesPhysics.evaluateTargetHit(landingX, predictedX);

  assert.equal(evalResult.hitOnPaper, false);
  assert.equal(evalResult.ratingCategory, "miss");
});

test("Array average helper", () => {
  const avg = ProjectilesPhysics.average([0.052, 0.054, 0.050]);
  assert.ok(Math.abs(avg - 0.052) < 0.0001);
  assert.equal(ProjectilesPhysics.average([]), 0);
});
