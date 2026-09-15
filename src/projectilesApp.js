/**
 * projectilesApp.js
 * 
 * Interactive Application & Canvas Renderer for the Horizontal Projectiles Lab.
 * Replicates the classic classroom experiment: ramp release, 2-photogate speed measurement,
 * table height measurement, hotdog-folded target paper with carbon paper placement,
 * and zero-clue student inquiry.
 * 
 * Includes:
 * 1. Ball catching at table edge before target paper is placed (hides landing trajectory).
 * 2. Permanent session locking via localStorage (cannot reload and try again).
 * 3. Teacher Reset Override with PIN authentication.
 * 
 * Part of "The Thinking Experiment" PhysicsKit.
 * Strictly adheres to SI Metric units and The Thinking Experiment design system.
 */

(function () {
  "use strict";

  // Check dependencies
  const Physics = typeof ProjectilesPhysics !== "undefined" ? ProjectilesPhysics : window.ProjectilesPhysics;
  if (!Physics) {
    console.error("ProjectilesPhysics module is required.");
    return;
  }

  // Storage key for anti-cheating session lock
  const STORAGE_KEY = "the_thinking_experiment_projectile_lab_v1";

  // Cross-browser safe rounded rectangle path helper (no ctx.roundRect)
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  /* ==========================================================================
     Application State
     ========================================================================== */
  const state = {
    // Apparatus geometry (SI units: meters, degrees)
    rampAngleDeg: 30, // Incline angle
    releaseDistance: 0.45, // Distance along straight ramp rail (m)
    tableHeight: 0.90, // Table height above floor (m)
    photogateDistance: 0.100, // Distance between photogate beams (m)
    
    // Photogates position on table
    gate1X: -0.30, // 30 cm before table edge (m)
    gate2X: -0.20, // 20 cm before table edge (m)

    // Ball simulation state
    // Phase: 'ready', 'rolling_ramp', 'rolling_table', 'caught', 'flying', 'bounced', 'stopped'
    phase: "ready",
    ball: {
      s: 0.45, // distance along ramp
      x: 0, // world x (m)
      y: 0, // world y (m)
      vx: 0, // m/s
      vy: 0, // m/s
      rotation: 0, // radians
      radius: Physics.BALL_RADIUS,
      currentExitV: 0,
      tFlight: 0
    },

    // Photogate timer console
    timer: {
      status: "READY", // 'READY', 'TIMING', 'STOPPED'
      elapsedTime: 0, // current run's photogate transit time (s)
      gate1Active: false,
      gate2Active: false,
      trials: [] // array of photogate times: [ {trial, time} ]
    },

    // Target Paper Setup
    targetPaper: {
      placed: false,
      creaseX: 1.150, // student-specified predicted landing distance (m)
      length: Physics.PAPER_LENGTH, // ~0.28m
      carbonPaperLifted: false,
      strikes: [] // list of impacts { dropNum, actualX, creaseX, devMm, evalResult }
    },

    // Permanent Anti-Cheating Lock
    isLocked: false, // true once official landing test is released onto target paper

    // Experimental settings
    noiseEnabled: true, // realistic slight hand/track scatter across 3 trials
    noiseStdDev: 0.0035, // ~0.35% velocity variation
    simSpeed: 1.0, // 1.0, 0.5, 0.25
    showTrajectory: true,
    showPlumbLine: true,
    showHeightTape: true,
    showFloorTape: true,

    // Trajectory history for current drop
    trajectoryPath: [],

    // Interaction & dragging
    dragging: null, // 'ball', 'target'
    mouseWorld: { x: 0, y: 0 }
  };

  /* ==========================================================================
     DOM Element References
     ========================================================================== */
  const dom = {
    // Canvas elements
    canvas: document.getElementById("simCanvas"),
    targetCanvas: document.getElementById("targetCanvas"),

    // Lock banner
    lockBanner: document.getElementById("lockBanner"),
    lockBannerBadge: document.getElementById("lockBannerBadge"),
    lockBannerText: document.getElementById("lockBannerText"),
    lockBannerSub: document.getElementById("lockBannerSub"),

    // Buttons
    btnRelease: document.getElementById("btnRelease"),
    btnReset: document.getElementById("btnReset"),
    btnPlaceTarget: document.getElementById("btnPlaceTarget"),
    btnInspectTarget: document.getElementById("btnInspectTarget"),
    btnClearLog: document.getElementById("btnClearLog"),

    // Speed buttons
    btnSpeed1x: document.getElementById("btnSpeed1x"),
    btnSpeedHalf: document.getElementById("btnSpeedHalf"),
    btnSpeedQuarter: document.getElementById("btnSpeedQuarter"),

    // Tool toggles
    togglePlumb: document.getElementById("togglePlumb"),
    toggleHeightTape: document.getElementById("toggleHeightTape"),
    toggleFloorTape: document.getElementById("toggleFloorTape"),
    toggleTrajectory: document.getElementById("toggleTrajectory"),
    toggleNoise: document.getElementById("toggleNoise"),

    // Parameter sliders & displays
    sliderAngle: document.getElementById("sliderAngle"),
    valAngle: document.getElementById("valAngle"),
    sliderRelease: document.getElementById("sliderRelease"),
    valRelease: document.getElementById("valRelease"),
    sliderHeight: document.getElementById("sliderHeight"),
    valHeight: document.getElementById("valHeight"),

    // Target controls
    inputCreaseX: document.getElementById("inputCreaseX"),
    sliderCreaseX: document.getElementById("sliderCreaseX"),
    targetStatusBadge: document.getElementById("targetStatusBadge"),

    // Photogate Console
    ledGate1: document.getElementById("ledGate1"),
    ledGate2: document.getElementById("ledGate2"),
    consoleStatus: document.getElementById("consoleStatus"),
    readoutTime: document.getElementById("readoutTime"),
    trialsLogBody: document.getElementById("trialsLogBody"),

    // Modals
    inspectModal: document.getElementById("inspectModal"),
    btnCloseModal: document.getElementById("btnCloseModal"),
    btnLiftCarbon: document.getElementById("btnLiftCarbon"),
    modalEvalSummary: document.getElementById("modalEvalSummary"),

    teacherModal: document.getElementById("teacherModal"),
    btnTeacherReset: document.getElementById("btnTeacherReset"),
    btnCloseTeacherModal: document.getElementById("btnCloseTeacherModal"),
    btnCancelTeacherReset: document.getElementById("btnCancelTeacherReset"),
    btnConfirmTeacherReset: document.getElementById("btnConfirmTeacherReset"),
    teacherPinInput: document.getElementById("teacherPinInput"),
    teacherPinError: document.getElementById("teacherPinError"),

    // Student Notebook
    nbGate1Time: document.getElementById("nbGate1Time"),
    nbGate2Time: document.getElementById("nbGate2Time"),
    nbGate3Time: document.getElementById("nbGate3Time"),
    nbAvgTime: document.getElementById("nbAvgTime"),
    nbCalcVx: document.getElementById("nbCalcVx"),
    nbTableHeight: document.getElementById("nbTableHeight"),
    nbCalcFallTime: document.getElementById("nbCalcFallTime"),
    nbCalcXPred: document.getElementById("nbCalcXPred"),
    btnApplyNotebookPred: document.getElementById("btnApplyNotebookPred")
  };

  const ctx = dom.canvas.getContext("2d");
  const targetCtx = dom.targetCanvas ? dom.targetCanvas.getContext("2d") : null;

  /* ==========================================================================
     World Coordinate Mapping & Geometry
     ========================================================================== */
  const world = {
    xMin: -0.85,
    xMax: 2.45,
    yMin: -0.15,
    yMax: 1.70,
    rampTransitionRadius: Physics.RAMP_CURVE_RADIUS,
    transitionStartX: -0.45 // where curved foot starts on table
  };

  function updateWorldScale() {
    const width = dom.canvas.width;
    const height = dom.canvas.height;
    world.scaleX = width / (world.xMax - world.xMin);
    world.scaleY = height / (world.yMax - world.yMin);
    world.scale = Math.min(world.scaleX, world.scaleY);
  }

  function worldToScreen(wx, wy) {
    const sx = (wx - world.xMin) * world.scaleX;
    const sy = dom.canvas.height - (wy - world.yMin) * world.scaleY;
    return { x: sx, y: sy };
  }

  function screenToWorld(sx, sy) {
    const wx = world.xMin + sx / world.scaleX;
    const wy = world.yMin + (dom.canvas.height - sy) / world.scaleY;
    return { x: wx, y: wy };
  }

  /**
   * Calculates world coordinates of the curved ramp & incline rail.
   */
  function getRampGeometry() {
    const angleRad = Physics.degToRad(state.rampAngleDeg);
    const R = world.rampTransitionRadius;
    const tableH = state.tableHeight;
    const footX = world.transitionStartX;

    const arcCenterX = footX;
    const arcCenterY = tableH + R;
    
    const transX = arcCenterX - R * Math.sin(angleRad);
    const transY = arcCenterY - R * Math.cos(angleRad);

    const maxS = 0.80; // max rail length
    const topX = transX - maxS * Math.cos(angleRad);
    const topY = transY + maxS * Math.sin(angleRad);

    return {
      angleRad,
      R,
      footX,
      arcCenterX,
      arcCenterY,
      transX,
      transY,
      topX,
      topY,
      straightLength: maxS
    };
  }

  /**
   * Returns world (x, y) coordinates for a ball positioned at distance s on the ramp.
   */
  function getBallRampCoordinates(s) {
    const geom = getRampGeometry();
    const rBall = state.ball.radius;

    if (s >= 0) {
      const normalX = -Math.sin(geom.angleRad);
      const normalY = Math.cos(geom.angleRad);
      const px = geom.transX - s * Math.cos(geom.angleRad) + normalX * rBall;
      const py = geom.transY + s * Math.sin(geom.angleRad) + normalY * rBall;
      return { x: px, y: py, angle: -geom.angleRad };
    } else {
      const arcDist = Math.max(-geom.R * geom.angleRad, s);
      const theta = -arcDist / geom.R;
      const px = geom.arcCenterX - (geom.R - rBall) * Math.sin(theta);
      const py = geom.arcCenterY - (geom.R - rBall) * Math.cos(theta);
      return { x: px, y: py, angle: -theta };
    }
  }

  /* ==========================================================================
     Simulation Mechanics & Physics Update Loop
     ========================================================================== */
  let lastTimestamp = 0;
  let animFrameId = null;

  function resetBallToRelease() {
    if (state.isLocked) return;

    state.phase = "ready";
    state.ball.s = state.releaseDistance;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.rotation = 0;
    state.ball.tFlight = 0;
    state.trajectoryPath = [];
    
    const pos = getBallRampCoordinates(state.ball.s);
    state.ball.x = pos.x;
    state.ball.y = pos.y;

    state.timer.gate1Active = false;
    state.timer.gate2Active = false;
    updateConsoleLEDs();

    dom.btnRelease.disabled = false;
    dom.btnReset.disabled = true;

    if (!state.targetPaper.placed) {
      updateLockBanner("practice");
    } else {
      updateLockBanner("ready");
    }
  }

  function releaseBall() {
    if (state.phase !== "ready" || state.isLocked) return;

    // If target paper is placed, this is the OFFICIAL ONE-SHOT DROP! Lock the lab!
    if (state.targetPaper.placed) {
      state.isLocked = true;
      saveLockState();
      lockUI();
      updateLockBanner("armed");
    }

    // Calculate exit velocity with optional realistic noise
    const noiseStd = state.noiseEnabled ? state.noiseStdDev : 0;
    state.ball.currentExitV = Physics.calculateRampExitVelocity(
      state.releaseDistance,
      state.rampAngleDeg,
      { noiseStdDev: noiseStd }
    );

    state.phase = "rolling_ramp";
    state.ball.s = state.releaseDistance;
    state.ball.rotation = 0;
    state.ball.tFlight = 0;
    state.trajectoryPath = [];

    // Reset current timer readout
    state.timer.status = "READY";
    state.timer.elapsedTime = 0;
    state.timer.gate1Active = false;
    state.timer.gate2Active = false;
    updateConsoleUI();

    dom.btnRelease.disabled = true;
    dom.btnReset.disabled = false;
  }

  function updateSimulation(dt) {
    if (state.phase === "ready" || state.phase === "stopped" || state.phase === "caught") return;

    const simDt = dt * state.simSpeed;
    const geom = getRampGeometry();
    const g = Physics.G;
    const rBall = state.ball.radius;
    const tableH = state.tableHeight;
    const vExit = state.ball.currentExitV;

    // 1. ROLLING DOWN RAMP
    if (state.phase === "rolling_ramp") {
      const aIncline = (5 / 7) * g * Math.sin(geom.angleRad);
      const totalArcLen = geom.R * geom.angleRad;
      const distTraveled = state.releaseDistance - state.ball.s;
      const currentSpeed = Math.min(vExit, Math.max(0.05, Math.sqrt(2 * aIncline * Math.max(0, distTraveled))));
      
      state.ball.s -= currentSpeed * simDt;
      state.ball.rotation += (currentSpeed * simDt) / rBall;

      if (state.ball.s <= -totalArcLen) {
        state.phase = "rolling_table";
        state.ball.x = geom.footX;
        state.ball.y = tableH + rBall;
        state.ball.vx = vExit;
        state.ball.vy = 0;
      } else {
        const coords = getBallRampCoordinates(state.ball.s);
        state.ball.x = coords.x;
        state.ball.y = coords.y;
      }
    }

    // 2. ROLLING ALONG HORIZONTAL TABLE TRACK
    else if (state.phase === "rolling_table") {
      const prevX = state.ball.x;
      state.ball.x += state.ball.vx * simDt;
      state.ball.y = tableH + rBall;
      state.ball.rotation += (state.ball.vx * simDt) / rBall;

      // Photogate beam detection
      const g1X = state.gate1X;
      const g2X = state.gate2X;

      // Gate 1 Trigger:
      if (prevX < g1X && state.ball.x >= g1X) {
        state.timer.status = "TIMING";
        state.timer.gate1Active = true;
        updateConsoleLEDs();
      }

      // Timing between gates
      if (state.timer.status === "TIMING") {
        state.timer.elapsedTime += simDt;
        dom.readoutTime.textContent = state.timer.elapsedTime.toFixed(4);
      }

      // Gate 2 Trigger:
      if (prevX < g2X && state.ball.x >= g2X) {
        state.timer.status = "STOPPED";
        state.timer.gate2Active = true;
        
        const exactTransitTime = Physics.calculatePhotogateTime(state.ball.vx, state.photogateDistance);
        state.timer.elapsedTime = exactTransitTime;
        dom.readoutTime.textContent = exactTransitTime.toFixed(4);
        
        logPhotogateTrial(exactTransitTime);
        updateConsoleLEDs();
      }

      // 🛑 CRITICAL CLASSROOM LOGIC:
      // If target paper is NOT placed: Ball is CAUGHT at table edge in catch box!
      if (!state.targetPaper.placed) {
        if (state.ball.x >= -0.04) {
          state.phase = "caught";
          state.ball.x = -0.02;
          state.ball.vx = 0;
          state.ball.vy = 0;
          dom.btnReset.disabled = false;
          dom.btnRelease.disabled = true;
          updateLockBanner("caught");
        }
      } else {
        // Target paper IS placed: Free launch off table edge!
        if (state.ball.x >= 0) {
          state.phase = "flying";
          state.ball.x = 0;
          state.ball.y = tableH + rBall;
          state.ball.vy = 0;
          state.ball.tFlight = 0;
          state.trajectoryPath.push({ x: state.ball.x, y: state.ball.y });
        }
      }
    }

    // 3. FREE PROJECTILE FLIGHT IN AIR (Only when paper is placed!)
    else if (state.phase === "flying") {
      state.ball.tFlight += simDt;
      state.ball.x += state.ball.vx * simDt;
      state.ball.vy -= g * simDt;
      state.ball.y += state.ball.vy * simDt;
      state.ball.rotation += (state.ball.vx * simDt) / rBall;

      state.trajectoryPath.push({ x: state.ball.x, y: state.ball.y });

      // Collision with floor (y <= rBall)
      if (state.ball.y <= rBall) {
        state.ball.y = rBall;
        handleFloorImpact(state.ball.x);
        state.phase = "bounced";
        state.ball.vy = -state.ball.vy * 0.35;
        state.ball.vx *= 0.65;
      }
    }

    // 4. BOUNCING & ROLLING TO STOP ON TARGET PAPER / FLOOR
    else if (state.phase === "bounced") {
      state.ball.x += state.ball.vx * simDt;
      state.ball.vy -= g * simDt;
      state.ball.y += state.ball.vy * simDt;
      state.ball.rotation += (state.ball.vx * simDt) / rBall;

      if (state.ball.y <= rBall) {
        state.ball.y = rBall;
        state.ball.vy = -state.ball.vy * 0.25;
        state.ball.vx *= 0.7;
        
        if (Math.abs(state.ball.vy) < 0.1 && Math.abs(state.ball.vx) < 0.05) {
          state.phase = "stopped";
          state.ball.vx = 0;
          state.ball.vy = 0;
          // Save completed locked state to localStorage
          saveLockState();
          lockUI();
          updateLockBanner("locked");
        }
      }
    }
  }

  /**
   * Records floor impact on target paper or floor.
   */
  function handleFloorImpact(landingX) {
    const dropNum = state.targetPaper.strikes.length + 1;
    const isTargetPlaced = state.targetPaper.placed;
    const creaseX = state.targetPaper.creaseX;

    const evalResult = Physics.evaluateTargetHit(landingX, creaseX, state.targetPaper.length);

    state.targetPaper.strikes.push({
      dropNum,
      actualX: landingX,
      creaseX: isTargetPlaced ? creaseX : null,
      deviationMm: isTargetPlaced ? evalResult.deviationMm : null,
      hitOnPaper: isTargetPlaced ? evalResult.hitOnPaper : false,
      evalResult: isTargetPlaced ? evalResult : null,
      timestamp: new Date().toLocaleTimeString()
    });

    if (isTargetPlaced) {
      dom.targetStatusBadge.textContent = `${evalResult.rating} (${evalResult.absDeviationMm.toFixed(1)} mm)`;
      dom.targetStatusBadge.className = `target-status-badge ${evalResult.badgeClass}`;
      dom.btnInspectTarget.disabled = false;
      saveLockState();
    }

    if (dom.inspectModal.classList.contains("open")) {
      renderTargetCloseup();
    }
  }

  /**
   * Updates the lock banner status above the canvas.
   */
  function updateLockBanner(mode) {
    if (!dom.lockBanner) return;

    if (mode === "practice" || (!state.targetPaper.placed && !state.isLocked)) {
      dom.lockBanner.className = "lock-banner practice";
      dom.lockBannerBadge.textContent = "🧤 Practice Timing";
      dom.lockBannerText.textContent = "Ball is caught at table edge. Landing is hidden until you place the folded carbon target paper!";
      dom.lockBannerSub.textContent = "Landing Hidden";
    } else if (mode === "caught") {
      dom.lockBanner.className = "lock-banner practice";
      dom.lockBannerBadge.textContent = "🧤 Ball Caught";
      dom.lockBannerText.textContent = `Timing logged (Δt = ${state.timer.elapsedTime.toFixed(4)} s). Calculate velocity & fall time, then place target paper!`;
      dom.lockBannerSub.textContent = "Safe in Catch Box";
    } else if (mode === "ready" || (state.targetPaper.placed && !state.isLocked)) {
      dom.lockBanner.className = "lock-banner ready";
      dom.lockBannerBadge.textContent = "⚠️ Official Test Armed";
      dom.lockBannerText.textContent = "Target paper placed! You have ONE SHOT to hit the crease. Once released, reloading will NOT reset your test!";
      dom.lockBannerSub.textContent = "One Shot • No Retries";
    } else if (mode === "armed") {
      dom.lockBanner.className = "lock-banner locked";
      dom.lockBannerBadge.textContent = "🔒 Flight in Progress";
      dom.lockBannerText.textContent = "Official test launched! Results are being recorded to carbon paper...";
      dom.lockBannerSub.textContent = "Locked";
    } else if (mode === "locked" || state.isLocked) {
      dom.lockBanner.className = "lock-banner locked";
      dom.lockBannerBadge.textContent = "🔒 Test Completed & Locked";
      dom.lockBannerText.textContent = "Official test recorded. Reloading preserves your result. Inspect the target paper to evaluate your prediction!";
      dom.lockBannerSub.textContent = "Permanently Recorded";
    }
  }

  /**
   * Locks all interactive controls once the official drop is executed.
   */
  function lockUI() {
    dom.sliderAngle.disabled = true;
    dom.sliderRelease.disabled = true;
    dom.sliderHeight.disabled = true;
    dom.sliderCreaseX.disabled = true;
    dom.inputCreaseX.disabled = true;
    dom.btnPlaceTarget.disabled = true;
    dom.btnRelease.disabled = true;
    dom.btnRelease.innerHTML = "<span>🔒</span> Test Completed (Locked)";
    dom.btnReset.disabled = true;
    dom.btnClearLog.disabled = true;
    dom.btnApplyNotebookPred.disabled = true;
    dom.btnInspectTarget.disabled = false;
  }

  /**
   * Unlocks all interactive controls (only via Teacher Reset).
   */
  function unlockUI() {
    dom.sliderAngle.disabled = false;
    dom.sliderRelease.disabled = false;
    dom.sliderHeight.disabled = false;
    dom.sliderCreaseX.disabled = false;
    dom.inputCreaseX.disabled = false;
    dom.btnPlaceTarget.disabled = false;
    dom.btnRelease.disabled = false;
    dom.btnRelease.innerHTML = "<span>🚀</span> Release Ball";
    dom.btnReset.disabled = true;
    dom.btnClearLog.disabled = false;
    dom.btnApplyNotebookPred.disabled = false;
  }

  /**
   * Saves locked test state to localStorage so reloading cannot bypass the test.
   */
  function saveLockState() {
    const data = {
      isLocked: state.isLocked,
      phase: state.phase,
      rampAngleDeg: state.rampAngleDeg,
      releaseDistance: state.releaseDistance,
      tableHeight: state.tableHeight,
      photogateDistance: state.photogateDistance,
      timerTrials: state.timer.trials,
      lastElapsedTime: state.timer.elapsedTime,
      targetPaper: state.targetPaper,
      trajectoryPath: state.trajectoryPath,
      ballFinal: {
        x: state.ball.x,
        y: state.ball.y,
        rotation: state.ball.rotation
      }
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Unable to save lock state to localStorage", e);
    }
  }

  /**
   * Restores locked state on page reload / refresh.
   */
  function loadLockState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.isLocked) return false;

      state.isLocked = true;
      state.rampAngleDeg = data.rampAngleDeg;
      state.releaseDistance = data.releaseDistance;
      state.tableHeight = data.tableHeight;
      state.photogateDistance = data.photogateDistance || 0.100;
      state.timer.trials = data.timerTrials || [];
      state.timer.elapsedTime = data.lastElapsedTime || 0;
      state.targetPaper = data.targetPaper || state.targetPaper;
      state.targetPaper.placed = true;
      state.trajectoryPath = data.trajectoryPath || [];

      state.phase = "stopped";
      if (data.ballFinal) {
        state.ball.x = data.ballFinal.x;
        state.ball.y = data.ballFinal.y;
        state.ball.rotation = data.ballFinal.rotation;
      }

      // Sync slider UI
      dom.sliderAngle.value = state.rampAngleDeg;
      dom.valAngle.textContent = `${state.rampAngleDeg}°`;
      dom.sliderRelease.value = state.releaseDistance;
      dom.valRelease.textContent = `${(state.releaseDistance * 100).toFixed(0)} cm`;
      dom.sliderHeight.value = state.tableHeight;
      dom.valHeight.textContent = `${state.tableHeight.toFixed(2)} m`;
      dom.nbTableHeight.textContent = `${state.tableHeight.toFixed(2)} m`;

      if (state.targetPaper.creaseX) {
        dom.inputCreaseX.value = state.targetPaper.creaseX.toFixed(3);
        dom.sliderCreaseX.value = state.targetPaper.creaseX;
      }

      renderTrialsLog();
      if (state.timer.elapsedTime > 0) {
        dom.readoutTime.textContent = state.timer.elapsedTime.toFixed(4);
      }

      const lastStrike = state.targetPaper.strikes[state.targetPaper.strikes.length - 1];
      if (lastStrike && lastStrike.evalResult) {
        dom.targetStatusBadge.textContent = `${lastStrike.evalResult.rating} (${lastStrike.evalResult.absDeviationMm.toFixed(1)} mm)`;
        dom.targetStatusBadge.className = `target-status-badge ${lastStrike.evalResult.badgeClass}`;
      }

      lockUI();
      updateLockBanner("locked");
      return true;
    } catch (e) {
      console.warn("Error reading localStorage lock state", e);
      return false;
    }
  }

  /**
   * Teacher Reset: Clears lock and resets simulation.
   */
  function executeTeacherReset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}

    state.isLocked = false;
    state.targetPaper.placed = false;
    state.targetPaper.strikes = [];
    state.timer.trials = [];
    state.trajectoryPath = [];

    unlockUI();
    resetBallToRelease();
    renderTrialsLog();
    updateLockBanner("practice");

    dom.readoutTime.textContent = "0.0000";
    dom.nbGate1Time.textContent = "--";
    dom.nbGate2Time.textContent = "--";
    dom.nbGate3Time.textContent = "--";
    dom.btnPlaceTarget.textContent = "📄 Place Target Paper on Floor";
    dom.btnPlaceTarget.className = "btn btn-primary";
    dom.targetStatusBadge.textContent = "Not Placed";
    dom.targetStatusBadge.className = "target-status-badge";
    dom.btnInspectTarget.disabled = true;

    if (dom.teacherModal) {
      dom.teacherModal.classList.remove("open");
    }
  }

  /**
   * Logs photogate transit time into trials memory table.
   */
  function logPhotogateTrial(transitTime) {
    const trialNum = state.timer.trials.length + 1;
    state.timer.trials.push({
      trial: trialNum,
      time: transitTime
    });

    renderTrialsLog();

    if (trialNum === 1) dom.nbGate1Time.textContent = transitTime.toFixed(4) + " s";
    if (trialNum === 2) dom.nbGate2Time.textContent = transitTime.toFixed(4) + " s";
    if (trialNum === 3) dom.nbGate3Time.textContent = transitTime.toFixed(4) + " s";
  }

  function renderTrialsLog() {
    dom.trialsLogBody.innerHTML = "";
    if (state.timer.trials.length === 0) {
      dom.trialsLogBody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#7a94a0;">No drop trials recorded yet.</td></tr>`;
      return;
    }

    state.timer.trials.forEach(item => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td style="color:#a9c4cf;">Trial ${item.trial}</td>
        <td style="color:#38bdf8; font-weight:700;">${item.time.toFixed(4)} s</td>
        <td style="color:#7a94a0;">${(item.time * 1000).toFixed(1)} ms</td>
      `;
      dom.trialsLogBody.appendChild(row);
    });
  }

  function updateConsoleLEDs() {
    if (state.timer.gate1Active) {
      dom.ledGate1.classList.add("active");
    } else {
      dom.ledGate1.classList.remove("active");
    }

    if (state.timer.gate2Active) {
      dom.ledGate2.classList.add("active");
    } else {
      dom.ledGate2.classList.remove("active");
    }
  }

  function updateConsoleUI() {
    dom.consoleStatus.textContent = state.timer.status;
    updateConsoleLEDs();
  }

  /* ==========================================================================
     Canvas Rendering Functions (Main Simulation)
     ========================================================================== */
  function render() {
    const w = dom.canvas.width;
    const h = dom.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Draw Lab Room Background
    drawEnvironment();

    // 2. Draw Lab Table & Mounts
    drawTable();

    // 3. Draw Catch Box (when target paper is not placed)
    drawCatchBox();

    // 4. Draw Ramp Track on Table
    drawRamp();

    // 5. Draw Photogates & Infrared Beams
    drawPhotogates();

    // 6. Draw Measuring Tools (Plumb Line, Height Tape, Floor Scale)
    if (state.showFloorTape) drawFloorTape();
    if (state.showPlumbLine) drawPlumbLine();
    if (state.showHeightTape) drawHeightTape();

    // 7. Draw Folded Target Paper with Carbon Paper on Floor
    drawTargetPaperOnFloor();

    // 8. Draw Trajectory Trail (Only when paper was placed and official flight happened)
    if (state.showTrajectory && state.trajectoryPath.length > 1) {
      drawTrajectory();
    }

    // 9. Draw Ball
    drawBall();
  }

  /**
   * Renders classroom lab environment with subtle wall baseboard and floor.
   */
  function drawEnvironment() {
    const w = dom.canvas.width;
    const h = dom.canvas.height;
    const floorP = worldToScreen(0, 0);

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, floorP.y);

    // Blueprint grid
    ctx.strokeStyle = "rgba(15, 126, 155, 0.05)";
    ctx.lineWidth = 1;
    const gridStep = 0.20;
    for (let wx = Math.floor(world.xMin / gridStep) * gridStep; wx <= world.xMax; wx += gridStep) {
      const p1 = worldToScreen(wx, 0);
      const p2 = worldToScreen(wx, world.yMax);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let wy = 0; wy <= world.yMax; wy += gridStep) {
      const p1 = worldToScreen(world.xMin, wy);
      const p2 = worldToScreen(world.xMax, wy);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // Baseboard
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, floorP.y - 14, w, 14);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, floorP.y - 14, w, 14);

    // Floor area
    const floorGrad = ctx.createLinearGradient(0, floorP.y, 0, h);
    floorGrad.addColorStop(0, "#e9f4fb");
    floorGrad.addColorStop(1, "#d8ebf5");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, floorP.y, w, h - floorP.y);

    ctx.strokeStyle = "#0f7e9b";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, floorP.y);
    ctx.lineTo(w, floorP.y);
    ctx.stroke();
  }

  /**
   * Renders sturdy physics lab table with wooden top and steel legs.
   */
  function drawTable() {
    const tableH = state.tableHeight;
    const tableTopThick = 0.04;
    const tableLeftX = -0.75;
    const tableRightX = 0.00;

    const pTopLeft = worldToScreen(tableLeftX, tableH);
    const pTopRight = worldToScreen(tableRightX, tableH);
    const pBottomLeft = worldToScreen(tableLeftX, tableH - tableTopThick);
    const pFloorLeft = worldToScreen(tableLeftX, 0);
    const pFloorRight = worldToScreen(tableRightX, 0);

    const legWidthPx = 14;

    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;

    ctx.fillRect(pBottomLeft.x + 8, pBottomLeft.y, legWidthPx, pFloorLeft.y - pBottomLeft.y);
    ctx.strokeRect(pBottomLeft.x + 8, pBottomLeft.y, legWidthPx, pFloorLeft.y - pBottomLeft.y);

    ctx.fillRect(pTopRight.x - 22, pBottomLeft.y, legWidthPx, pFloorRight.y - pBottomLeft.y);
    ctx.strokeRect(pTopRight.x - 22, pBottomLeft.y, legWidthPx, pFloorRight.y - pBottomLeft.y);

    const braceY = (pBottomLeft.y + pFloorLeft.y) * 0.65;
    ctx.fillRect(pBottomLeft.x + 8, braceY, (pTopRight.x - 22) - (pBottomLeft.x + 8), 8);

    const topW = pTopRight.x - pTopLeft.x;
    const topH = pBottomLeft.y - pTopLeft.y;

    const woodGrad = ctx.createLinearGradient(pTopLeft.x, pTopLeft.y, pTopLeft.x, pBottomLeft.y);
    woodGrad.addColorStop(0, "#d97706");
    woodGrad.addColorStop(0.3, "#b45309");
    woodGrad.addColorStop(1, "#78350f");

    ctx.fillStyle = woodGrad;
    ctx.fillRect(pTopLeft.x, pTopLeft.y, topW, topH);
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(pTopLeft.x, pTopLeft.y, topW, 2);

    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pTopLeft.x, pTopLeft.y, topW, topH);

    // Aluminum track rail
    const trackP1 = worldToScreen(world.transitionStartX, tableH);
    const trackP2 = worldToScreen(0, tableH);
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(trackP1.x, trackP1.y - 3, trackP2.x - trackP1.x, 3);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.strokeRect(trackP1.x, trackP1.y - 3, trackP2.x - trackP1.x, 3);
  }

  /**
   * Renders the Catch Box mounted at the table edge (hides landing until paper is placed).
   */
  function drawCatchBox() {
    if (state.targetPaper.placed) return;

    const tableH = state.tableHeight;
    const boxLeft = worldToScreen(-0.06, tableH);
    const boxRight = worldToScreen(0.02, tableH);
    const boxTop = worldToScreen(-0.06, tableH + 0.075);

    const w = boxRight.x - boxLeft.x;
    const h = boxLeft.y - boxTop.y;

    // Rigid catcher frame
    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, boxLeft.x, boxTop.y, w, h, 4);
    ctx.fill();
    ctx.stroke();

    // Dense blue foam lining inside
    ctx.fillStyle = "#0284c7";
    drawRoundedRect(ctx, boxLeft.x + 3, boxTop.y + 3, w - 6, h - 4, 2);
    ctx.fill();

    // Box label
    ctx.fillStyle = "var(--primary-teal-dark)";
    ctx.font = "bold 9px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("🧤 CATCH BOX", (boxLeft.x + boxRight.x) / 2, boxTop.y - 6);
  }

  /**
   * Renders the curved incline ramp mounted on the table.
   */
  function drawRamp() {
    const geom = getRampGeometry();
    const tableH = state.tableHeight;
    const rBall = state.ball.radius;

    ctx.strokeStyle = "#0f7e9b";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();

    const pTop = worldToScreen(geom.topX, geom.topY);
    const pTrans = worldToScreen(geom.transX, geom.transY);
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pTrans.x, pTrans.y);

    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const sArc = -(i / steps) * (geom.R * geom.angleRad);
      const pt = getBallRampCoordinates(sArc);
      const spt = worldToScreen(pt.x, pt.y - rBall);
      ctx.lineTo(spt.x, spt.y);
    }
    ctx.stroke();

    // Ramp support bracket
    ctx.fillStyle = "rgba(15, 126, 155, 0.12)";
    ctx.strokeStyle = "#0f7e9b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pTrans.x, pTrans.y);
    const pFoot = worldToScreen(geom.footX, tableH);
    ctx.lineTo(pFoot.x, pFoot.y);
    const pClampBase = worldToScreen(geom.topX, tableH);
    ctx.lineTo(pClampBase.x, pClampBase.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Centimeter graduation scale along straight rail
    ctx.strokeStyle = "#095f76";
    ctx.fillStyle = "#095f76";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 1;

    const numTicks = 8;
    for (let i = 0; i <= numTicks; i++) {
      const sTick = (i / numTicks) * geom.straightLength;
      const tPos = getBallRampCoordinates(sTick);
      const stPos = worldToScreen(tPos.x, tPos.y - rBall);
      
      const nx = -Math.sin(geom.angleRad);
      const ny = Math.cos(geom.angleRad);
      const tickLen = (i % 2 === 0) ? 7 : 4;
      
      ctx.beginPath();
      ctx.moveTo(stPos.x, stPos.y);
      ctx.lineTo(stPos.x - ny * tickLen, stPos.y - nx * tickLen);
      ctx.stroke();

      if (i % 2 === 0 && i > 0) {
        ctx.fillText(`${(sTick * 100).toFixed(0)}cm`, stPos.x - ny * (tickLen + 10), stPos.y - nx * (tickLen + 10));
      }
    }

    // Angle indicator arc
    const pArcCenter = worldToScreen(geom.topX, tableH);
    ctx.strokeStyle = "var(--accent-amber)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pArcCenter.x, pArcCenter.y, 28, -geom.angleRad, 0);
    ctx.stroke();
    ctx.fillStyle = "var(--accent-amber-dark)";
    ctx.font = "bold 10px JetBrains Mono, monospace";
    ctx.fillText(`θ=${state.rampAngleDeg}°`, pArcCenter.x + 38, pArcCenter.y - 6);

    // Release stop indicator pin
    const relPos = getBallRampCoordinates(state.releaseDistance);
    const sRel = worldToScreen(relPos.x, relPos.y);
    ctx.strokeStyle = "var(--accent-amber)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sRel.x, sRel.y, 14, 0, Math.PI * 2);
    ctx.stroke();
  }

  /**
   * Renders the two photogates on the horizontal table track.
   */
  function drawPhotogates() {
    const tableH = state.tableHeight;
    const g1 = worldToScreen(state.gate1X, tableH);
    const g2 = worldToScreen(state.gate2X, tableH);
    const gateH = 34;

    function drawSingleGate(gx, active, label) {
      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;

      ctx.fillRect(gx - 6, g1.y - 2, 12, 6);
      ctx.fillRect(gx - 3, g1.y - gateH, 6, gateH);

      drawRoundedRect(ctx, gx - 8, g1.y - gateH - 8, 16, 10, 3);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = active ? "rgba(220, 38, 38, 0.9)" : "rgba(15, 126, 155, 0.4)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(gx, g1.y - gateH);
      ctx.lineTo(gx, g1.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = active ? "#dc2626" : "#0f7e9b";
      ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, gx, g1.y - gateH - 12);

      ctx.fillStyle = active ? "#ef4444" : "#22c55e";
      ctx.beginPath();
      ctx.arc(gx, g1.y - gateH - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    drawSingleGate(g1.x, state.timer.gate1Active, "G1");
    drawSingleGate(g2.x, state.timer.gate2Active, "G2");

    // Dimension line between gates
    ctx.strokeStyle = "var(--primary-teal)";
    ctx.lineWidth = 1.2;
    const dimY = g1.y - gateH - 24;
    ctx.beginPath();
    ctx.moveTo(g1.x, dimY);
    ctx.lineTo(g2.x, dimY);
    ctx.stroke();

    ctx.fillStyle = "var(--primary-teal)";
    ctx.beginPath();
    ctx.moveTo(g1.x, dimY - 3); ctx.lineTo(g1.x + 5, dimY); ctx.lineTo(g1.x, dimY + 3); ctx.fill();
    ctx.moveTo(g2.x, dimY - 3); ctx.lineTo(g2.x - 5, dimY); ctx.lineTo(g2.x, dimY + 3); ctx.fill();

    ctx.font = "bold 10px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`d = ${(state.photogateDistance * 100).toFixed(1)} cm`, (g1.x + g2.x) / 2, dimY - 4);
  }

  /**
   * Renders the plumb line suspended from the launch edge (x = 0) down to floor.
   */
  function drawPlumbLine() {
    const tableH = state.tableHeight;
    const pTop = worldToScreen(0, tableH);
    const pFloor = worldToScreen(0, 0);

    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pFloor.x, pFloor.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const bobY = pFloor.y - 10;
    ctx.fillStyle = "#d97706";
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pFloor.x, pFloor.y - 2);
    ctx.lineTo(pFloor.x - 5, bobY - 8);
    ctx.lineTo(pFloor.x + 5, bobY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "var(--primary-teal-dark)";
    ctx.font = "bold 10px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText("x = 0.00 m (Plumb Line)", pFloor.x, pFloor.y + 24);
  }

  /**
   * Renders the vertical metric tape measure next to the table for measuring H.
   */
  function drawHeightTape() {
    const tableH = state.tableHeight;
    const tapeX = 0.12;
    const pFloor = worldToScreen(tapeX, 0);
    const pTop = worldToScreen(tapeX, tableH);

    const tapeW = 16;
    ctx.fillStyle = "#fffbeb";
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 1.2;
    ctx.fillRect(pTop.x - tapeW / 2, pTop.y, tapeW, pFloor.y - pTop.y);
    ctx.strokeRect(pTop.x - tapeW / 2, pTop.y, tapeW, pFloor.y - pTop.y);

    ctx.strokeStyle = "#78350f";
    ctx.fillStyle = "#78350f";
    ctx.font = "8px JetBrains Mono, monospace";
    ctx.textAlign = "right";

    const stepM = 0.05;
    for (let y = 0; y <= tableH + 0.01; y += stepM) {
      const py = worldToScreen(tapeX, y).y;
      const isMajor = Math.round(y * 100) % 10 === 0;
      const tickLen = isMajor ? 7 : 4;
      
      ctx.beginPath();
      ctx.moveTo(pTop.x + tapeW / 2, py);
      ctx.lineTo(pTop.x + tapeW / 2 - tickLen, py);
      ctx.stroke();

      if (isMajor && y > 0) {
        ctx.fillText(`${(y * 100).toFixed(0)}`, pTop.x + tapeW / 2 - tickLen - 1, py + 3);
      }
    }

    ctx.fillStyle = "var(--accent-amber)";
    ctx.beginPath();
    ctx.moveTo(pTop.x + tapeW / 2 + 2, pTop.y);
    ctx.lineTo(pTop.x + tapeW / 2 + 10, pTop.y - 5);
    ctx.lineTo(pTop.x + tapeW / 2 + 10, pTop.y + 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "var(--accent-amber-dark)";
    ctx.font = "bold 10px JetBrains Mono, monospace";
    ctx.textAlign = "left";
    ctx.fillText(`H = ${tableH.toFixed(2)} m`, pTop.x + tapeW / 2 + 14, pTop.y + 3);
  }

  /**
   * Renders the metric measuring tape along the floor from 0 to 2.4 m.
   */
  function drawFloorTape() {
    const pStart = worldToScreen(0, 0);
    const pEnd = worldToScreen(world.xMax, 0);
    const tapeY = pStart.y + 6;
    const tapeH = 14;

    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.fillRect(pStart.x, tapeY, pEnd.x - pStart.x, tapeH);
    ctx.strokeRect(pStart.x, tapeY, pEnd.x - pStart.x, tapeH);

    ctx.font = "8px JetBrains Mono, monospace";
    ctx.textAlign = "center";

    const step = 0.05;
    for (let x = 0; x <= world.xMax; x += step) {
      const px = worldToScreen(x, 0).x;
      const is10cm = Math.round(x * 100) % 10 === 0;
      const tickH = is10cm ? 8 : 4;
      
      ctx.strokeStyle = is10cm ? "#0f7e9b" : "#64748b";
      ctx.beginPath();
      ctx.moveTo(px, tapeY);
      ctx.lineTo(px, tapeY + tickH);
      ctx.stroke();

      if (is10cm && x > 0 && x <= 2.3) {
        ctx.fillStyle = "#0f7e9b";
        ctx.fillText(`${x.toFixed(1)}m`, px, tapeY + tapeH - 2);
      }
    }
  }

  /**
   * Renders the folded target paper ("hotdog style") and carbon paper on the floor.
   */
  function drawTargetPaperOnFloor() {
    if (!state.targetPaper.placed) return;

    const creaseX = state.targetPaper.creaseX;
    const len = state.targetPaper.length;
    const startX = creaseX - len / 2;
    const endX = creaseX + len / 2;

    const pStart = worldToScreen(startX, 0);
    const pEnd = worldToScreen(endX, 0);
    const pCrease = worldToScreen(creaseX, 0);

    const paperW = pEnd.x - pStart.x;
    const paperH = 18;
    const paperY = pStart.y - 3;

    // White paper sheet underneath
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, pStart.x, paperY, paperW, paperH, 2);
    ctx.fill();
    ctx.stroke();

    // Dark Carbon Paper on top
    if (!state.targetPaper.carbonPaperLifted) {
      ctx.fillStyle = "rgba(30, 41, 59, 0.88)";
      drawRoundedRect(ctx, pStart.x + 2, paperY + 1, paperW - 4, paperH - 2, 2);
      ctx.fill();
    }

    // Folded Crease down center of paper
    ctx.strokeStyle = state.targetPaper.carbonPaperLifted ? "#0f7e9b" : "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pCrease.x, paperY - 4);
    ctx.lineTo(pCrease.x, paperY + paperH + 4);
    ctx.stroke();

    ctx.fillStyle = "var(--accent-amber-dark)";
    ctx.font = "bold 9px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`Crease: ${creaseX.toFixed(3)} m`, pCrease.x, paperY - 8);

    // Carbon impact marks
    state.targetPaper.strikes.forEach(strike => {
      const sp = worldToScreen(strike.actualX, 0);
      
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(sp.x, paperY + paperH / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sp.x, paperY + paperH / 2, 5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 8px Inter, sans-serif";
      ctx.fillText(strike.dropNum, sp.x, paperY + paperH / 2 + 2.5);
    });
  }

  /**
   * Renders trajectory parabola dots.
   */
  function drawTrajectory() {
    ctx.strokeStyle = "rgba(214, 123, 25, 0.7)";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();

    state.trajectoryPath.forEach((pt, idx) => {
      const sp = worldToScreen(pt.x, pt.y);
      if (idx === 0) ctx.moveTo(sp.x, sp.y);
      else ctx.lineTo(sp.x, sp.y);
    });

    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * Renders the steel ball.
   */
  function drawBall() {
    const bp = worldToScreen(state.ball.x, state.ball.y);
    const rPx = state.ball.radius * world.scaleX;

    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y + rPx * 0.9, rPx * 0.9, rPx * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    const ballGrad = ctx.createRadialGradient(
      bp.x - rPx * 0.35,
      bp.y - rPx * 0.35,
      rPx * 0.1,
      bp.x,
      bp.y,
      rPx
    );
    ballGrad.addColorStop(0, "#ffffff");
    ballGrad.addColorStop(0.3, "#cbd5e1");
    ballGrad.addColorStop(0.8, "#64748b");
    ballGrad.addColorStop(1, "#334155");

    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, rPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.translate(bp.x, bp.y);
    ctx.rotate(state.ball.rotation);
    ctx.strokeStyle = "rgba(15, 126, 155, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-rPx * 0.7, 0);
    ctx.lineTo(rPx * 0.7, 0);
    ctx.stroke();
    ctx.restore();
  }

  /* ==========================================================================
     Magnified Target Paper Close-Up View (Inspection Modal)
     ========================================================================== */
  function renderTargetCloseup() {
    if (!targetCtx || !dom.targetCanvas) return;

    const w = dom.targetCanvas.width;
    const h = dom.targetCanvas.height;
    targetCtx.clearRect(0, 0, w, h);

    const creaseX = state.targetPaper.creaseX;
    const paperLen = state.targetPaper.length;
    const pxPerMm = (w - 80) / (paperLen * 1000);
    const centerPx = w / 2;

    targetCtx.fillStyle = "#ffffff";
    targetCtx.strokeStyle = "#94a3b8";
    targetCtx.lineWidth = 1.5;
    drawRoundedRect(targetCtx, 30, 25, w - 60, h - 50, 6);
    targetCtx.fill();
    targetCtx.stroke();

    const leftFoldGrad = targetCtx.createLinearGradient(30, 0, centerPx, 0);
    leftFoldGrad.addColorStop(0, "rgba(241, 245, 249, 0.8)");
    leftFoldGrad.addColorStop(0.9, "rgba(255, 255, 255, 0)");
    leftFoldGrad.addColorStop(1, "rgba(15, 126, 155, 0.12)");
    targetCtx.fillStyle = leftFoldGrad;
    targetCtx.fillRect(30, 25, centerPx - 30, h - 50);

    const rightFoldGrad = targetCtx.createLinearGradient(centerPx, 0, w - 30, 0);
    rightFoldGrad.addColorStop(0, "rgba(15, 126, 155, 0.12)");
    rightFoldGrad.addColorStop(0.1, "rgba(255, 255, 255, 0)");
    rightFoldGrad.addColorStop(1, "rgba(241, 245, 249, 0.8)");
    targetCtx.fillStyle = rightFoldGrad;
    targetCtx.fillRect(centerPx, 25, w - 30 - centerPx, h - 50);

    if (!state.targetPaper.carbonPaperLifted) {
      targetCtx.fillStyle = "rgba(15, 23, 42, 0.82)";
      drawRoundedRect(targetCtx, 40, 35, w - 80, h - 70, 4);
      targetCtx.fill();
    }

    targetCtx.strokeStyle = state.targetPaper.carbonPaperLifted ? "#0f7e9b" : "#38bdf8";
    targetCtx.lineWidth = 2.5;
    targetCtx.beginPath();
    targetCtx.moveTo(centerPx, 15);
    targetCtx.lineTo(centerPx, h - 15);
    targetCtx.stroke();

    targetCtx.fillStyle = "var(--primary-teal-dark)";
    targetCtx.font = "bold 12px JetBrains Mono, monospace";
    targetCtx.textAlign = "center";
    targetCtx.fillText(`★ THE CREASE (Prediction = ${creaseX.toFixed(3)} m) ★`, centerPx, 18);

    const rulerY = h - 65;
    targetCtx.strokeStyle = state.targetPaper.carbonPaperLifted ? "#334155" : "#94a3b8";
    targetCtx.fillStyle = state.targetPaper.carbonPaperLifted ? "#1e293b" : "#e2e8f0";
    targetCtx.lineWidth = 1;
    targetCtx.font = "9px JetBrains Mono, monospace";

    for (let dMm = -120; dMm <= 120; dMm += 5) {
      const xPos = centerPx + dMm * pxPerMm;
      const is10 = dMm % 10 === 0;
      const tickLen = is10 ? 12 : 6;
      
      targetCtx.beginPath();
      targetCtx.moveTo(xPos, rulerY);
      targetCtx.lineTo(xPos, rulerY + tickLen);
      targetCtx.stroke();

      if (is10) {
        const sign = dMm > 0 ? `+${dMm}` : `${dMm}`;
        targetCtx.fillText(sign, xPos, rulerY + tickLen + 10);
      }
    }

    const strikes = state.targetPaper.strikes;
    if (strikes.length === 0) {
      targetCtx.fillStyle = state.targetPaper.carbonPaperLifted ? "#64748b" : "#cbd5e1";
      targetCtx.font = "italic 13px Inter, sans-serif";
      targetCtx.fillText("No ball strikes recorded yet. Release the ball onto the target to test your prediction!", centerPx, h / 2);
      return;
    }

    strikes.forEach((strike, idx) => {
      const devMm = (strike.actualX - creaseX) * 1000;
      const strikeX = centerPx + devMm * pxPerMm;
      const strikeY = h / 2 + (idx - (strikes.length - 1) / 2) * 26;

      targetCtx.fillStyle = "#000000";
      targetCtx.beginPath();
      targetCtx.arc(strikeX, strikeY, 5.5, 0, Math.PI * 2);
      targetCtx.fill();

      targetCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      targetCtx.lineWidth = 2;
      targetCtx.beginPath();
      targetCtx.arc(strikeX, strikeY, 8.5, 0, Math.PI * 2);
      targetCtx.stroke();

      targetCtx.fillStyle = "var(--accent-amber-dark)";
      targetCtx.font = "bold 11px JetBrains Mono, monospace";
      targetCtx.textAlign = "center";
      const devSign = devMm >= 0 ? `+${devMm.toFixed(1)}` : devMm.toFixed(1);
      targetCtx.fillText(`Drop #${strike.dropNum} (${devSign} mm)`, strikeX, strikeY - 12);
    });

    const latest = strikes[strikes.length - 1];
    if (latest && latest.evalResult) {
      dom.modalEvalSummary.innerHTML = `
        <div class="eval-item">
          <span class="eval-item-label">Target Crease (Prediction)</span>
          <span class="eval-item-value" style="color:var(--primary-teal);">${creaseX.toFixed(3)} m</span>
        </div>
        <div class="eval-item">
          <span class="eval-item-label">Actual Ball Impact</span>
          <span class="eval-item-value" style="color:var(--accent-amber-dark);">${latest.actualX.toFixed(3)} m</span>
        </div>
        <div class="eval-item">
          <span class="eval-item-label">Deviation from Crease</span>
          <span class="eval-item-value">${latest.evalResult.deviationMm >= 0 ? "+" : ""}${latest.evalResult.deviationMm.toFixed(1)} mm</span>
        </div>
        <div class="eval-item">
          <span class="eval-item-label">Evaluation</span>
          <span class="eval-item-value ${latest.evalResult.badgeClass}" style="display:inline-block; font-size:0.92rem; padding:0.2rem 0.5rem; border-radius:4px;">${latest.evalResult.rating}</span>
        </div>
      `;
    }
  }

  /* ==========================================================================
     Event Handlers & Interactivity
     ========================================================================== */
  function bindEvents() {
    // Primary buttons
    dom.btnRelease.addEventListener("click", releaseBall);
    dom.btnReset.addEventListener("click", resetBallToRelease);

    // Speed controls
    dom.btnSpeed1x.addEventListener("click", () => setSimSpeed(1.0, dom.btnSpeed1x));
    dom.btnSpeedHalf.addEventListener("click", () => setSimSpeed(0.5, dom.btnSpeedHalf));
    dom.btnSpeedQuarter.addEventListener("click", () => setSimSpeed(0.25, dom.btnSpeedQuarter));

    // Tool toggles
    dom.togglePlumb.addEventListener("click", () => {
      state.showPlumbLine = !state.showPlumbLine;
      dom.togglePlumb.classList.toggle("active", state.showPlumbLine);
    });
    dom.toggleHeightTape.addEventListener("click", () => {
      state.showHeightTape = !state.showHeightTape;
      dom.toggleHeightTape.classList.toggle("active", state.showHeightTape);
    });
    dom.toggleFloorTape.addEventListener("click", () => {
      state.showFloorTape = !state.showFloorTape;
      dom.toggleFloorTape.classList.toggle("active", state.showFloorTape);
    });
    dom.toggleTrajectory.addEventListener("click", () => {
      state.showTrajectory = !state.showTrajectory;
      dom.toggleTrajectory.classList.toggle("active", state.showTrajectory);
    });
    dom.toggleNoise.addEventListener("click", () => {
      state.noiseEnabled = !state.noiseEnabled;
      dom.toggleNoise.classList.toggle("active", state.noiseEnabled);
      dom.toggleNoise.textContent = state.noiseEnabled ? "🎲 Real Scatter: ON" : "🎯 Ideal Physics: ON";
    });

    // Apparatus sliders (only if not locked)
    dom.sliderAngle.addEventListener("input", (e) => {
      if (state.isLocked) return;
      state.rampAngleDeg = parseFloat(e.target.value);
      dom.valAngle.textContent = `${state.rampAngleDeg}°`;
      resetBallToRelease();
    });

    dom.sliderRelease.addEventListener("input", (e) => {
      if (state.isLocked) return;
      state.releaseDistance = parseFloat(e.target.value);
      dom.valRelease.textContent = `${(state.releaseDistance * 100).toFixed(0)} cm`;
      resetBallToRelease();
    });

    dom.sliderHeight.addEventListener("input", (e) => {
      if (state.isLocked) return;
      state.tableHeight = parseFloat(e.target.value);
      dom.valHeight.textContent = `${state.tableHeight.toFixed(2)} m`;
      dom.nbTableHeight.textContent = `${state.tableHeight.toFixed(2)} m`;
      resetBallToRelease();
    });

    // Target Placement Controls
    dom.btnPlaceTarget.addEventListener("click", () => {
      if (state.isLocked) return;
      state.targetPaper.placed = !state.targetPaper.placed;
      if (state.targetPaper.placed) {
        dom.btnPlaceTarget.textContent = "📄 Remove Target Paper";
        dom.btnPlaceTarget.className = "btn btn-secondary";
        dom.targetStatusBadge.textContent = "Paper Placed on Floor";
        dom.btnInspectTarget.disabled = false;
        updateLockBanner("ready");
      } else {
        dom.btnPlaceTarget.textContent = "📄 Place Target Paper on Floor";
        dom.btnPlaceTarget.className = "btn btn-primary";
        dom.targetStatusBadge.textContent = "Not Placed";
        updateLockBanner("practice");
      }
    });

    dom.inputCreaseX.addEventListener("change", (e) => {
      if (state.isLocked) return;
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val < 0.2) val = 0.2;
      if (val > 2.3) val = 2.3;
      state.targetPaper.creaseX = val;
      dom.inputCreaseX.value = val.toFixed(3);
      dom.sliderCreaseX.value = val;
    });

    dom.sliderCreaseX.addEventListener("input", (e) => {
      if (state.isLocked) return;
      const val = parseFloat(e.target.value);
      state.targetPaper.creaseX = val;
      dom.inputCreaseX.value = val.toFixed(3);
    });

    // Target Inspection Modal
    dom.btnInspectTarget.addEventListener("click", () => {
      dom.inspectModal.classList.add("open");
      renderTargetCloseup();
    });

    dom.btnCloseModal.addEventListener("click", () => {
      dom.inspectModal.classList.remove("open");
    });

    dom.inspectModal.addEventListener("click", (e) => {
      if (e.target === dom.inspectModal) dom.inspectModal.classList.remove("open");
    });

    dom.btnLiftCarbon.addEventListener("click", () => {
      state.targetPaper.carbonPaperLifted = !state.targetPaper.carbonPaperLifted;
      dom.btnLiftCarbon.textContent = state.targetPaper.carbonPaperLifted
        ? "📄 Cover with Carbon Paper"
        : "🔍 Lift Carbon Paper (View Crease)";
      renderTargetCloseup();
    });

    // Clear trial logs
    dom.btnClearLog.addEventListener("click", () => {
      if (state.isLocked) return;
      state.timer.trials = [];
      state.targetPaper.strikes = [];
      dom.readoutTime.textContent = "0.0000";
      dom.nbGate1Time.textContent = "--";
      dom.nbGate2Time.textContent = "--";
      dom.nbGate3Time.textContent = "--";
      renderTrialsLog();
      dom.targetStatusBadge.textContent = state.targetPaper.placed ? "Paper Placed on Floor" : "Not Placed";
      dom.targetStatusBadge.className = "target-status-badge";
      resetBallToRelease();
    });

    // Student notebook apply prediction
    dom.btnApplyNotebookPred.addEventListener("click", () => {
      if (state.isLocked) return;
      const predVal = parseFloat(dom.nbCalcXPred.value);
      if (!isNaN(predVal) && predVal > 0.2 && predVal <= 2.4) {
        state.targetPaper.creaseX = predVal;
        state.targetPaper.placed = true;
        dom.inputCreaseX.value = predVal.toFixed(3);
        dom.sliderCreaseX.value = predVal;
        dom.btnPlaceTarget.textContent = "📄 Remove Target Paper";
        dom.btnPlaceTarget.className = "btn btn-secondary";
        dom.targetStatusBadge.textContent = `Crease Set to ${predVal.toFixed(3)} m`;
        dom.btnInspectTarget.disabled = false;
        updateLockBanner("ready");
      } else {
        alert("Please enter a valid predicted landing distance between 0.20 m and 2.40 m.");
      }
    });

    // Teacher Reset Modal Events
    if (dom.btnTeacherReset) {
      dom.btnTeacherReset.addEventListener("click", () => {
        dom.teacherPinError.style.display = "none";
        dom.teacherPinInput.value = "";
        dom.teacherModal.classList.add("open");
        dom.teacherPinInput.focus();
      });
    }

    if (dom.btnCloseTeacherModal) {
      dom.btnCloseTeacherModal.addEventListener("click", () => {
        dom.teacherModal.classList.remove("open");
      });
    }

    if (dom.btnCancelTeacherReset) {
      dom.btnCancelTeacherReset.addEventListener("click", () => {
        dom.teacherModal.classList.remove("open");
      });
    }

    if (dom.btnConfirmTeacherReset) {
      dom.btnConfirmTeacherReset.addEventListener("click", () => {
        const pin = dom.teacherPinInput.value.trim().toLowerCase();
        if (pin === "physics" || pin === "reset") {
          executeTeacherReset();
        } else {
          dom.teacherPinError.style.display = "block";
        }
      });
    }

    // Canvas interactions
    bindCanvasInteractions();
  }

  function setSimSpeed(speed, activeBtn) {
    state.simSpeed = speed;
    [dom.btnSpeed1x, dom.btnSpeedHalf, dom.btnSpeedQuarter].forEach(btn => btn.classList.remove("active"));
    activeBtn.classList.add("active");
  }

  function bindCanvasInteractions() {
    function getCanvasCoords(e) {
      const rect = dom.canvas.getBoundingClientRect();
      const scaleX = dom.canvas.width / rect.width;
      const scaleY = dom.canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const sx = (clientX - rect.left) * scaleX;
      const sy = (clientY - rect.top) * scaleY;
      return { sx, sy, world: screenToWorld(sx, sy) };
    }

    dom.canvas.addEventListener("mousedown", handlePointerDown);
    dom.canvas.addEventListener("touchstart", handlePointerDown, { passive: false });

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("touchmove", handlePointerMove, { passive: false });

    window.addEventListener("mouseup", handlePointerUp);
    window.addEventListener("touchend", handlePointerUp);

    function handlePointerDown(e) {
      if (state.isLocked) return;

      const pos = getCanvasCoords(e);
      state.mouseWorld = pos.world;

      if (state.phase === "ready") {
        const ballScreen = worldToScreen(state.ball.x, state.ball.y);
        const dist = Math.hypot(pos.sx - ballScreen.x, pos.sy - ballScreen.y);
        if (dist < 26) {
          state.dragging = "ball";
          e.preventDefault();
          return;
        }
      }

      if (state.targetPaper.placed) {
        const creaseScreen = worldToScreen(state.targetPaper.creaseX, 0);
        if (Math.abs(pos.sx - creaseScreen.x) < 30 && Math.abs(pos.sy - creaseScreen.y) < 35) {
          state.dragging = "target";
          e.preventDefault();
          return;
        }
      }
    }

    function handlePointerMove(e) {
      if (!state.dragging || state.isLocked) return;
      const pos = getCanvasCoords(e);

      if (state.dragging === "ball" && state.phase === "ready") {
        const geom = getRampGeometry();
        const dx = geom.transX - pos.world.x;
        const dy = pos.world.y - geom.transY;
        const sProj = dx * Math.cos(geom.angleRad) + dy * Math.sin(geom.angleRad);
        const clampedS = Math.min(0.75, Math.max(0.15, sProj));
        state.releaseDistance = clampedS;
        dom.sliderRelease.value = clampedS;
        dom.valRelease.textContent = `${(clampedS * 100).toFixed(0)} cm`;
        resetBallToRelease();
        e.preventDefault();
      } else if (state.dragging === "target") {
        const clampedX = Math.min(2.30, Math.max(0.20, pos.world.x));
        state.targetPaper.creaseX = clampedX;
        dom.inputCreaseX.value = clampedX.toFixed(3);
        dom.sliderCreaseX.value = clampedX;
        e.preventDefault();
      }
    }

    function handlePointerUp() {
      state.dragging = null;
    }
  }

  /* ==========================================================================
     Animation Loop
     ========================================================================== */
  function animLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    updateSimulation(dt);
    render();

    animFrameId = requestAnimationFrame(animLoop);
  }

  /* ==========================================================================
     Initialization
     ========================================================================== */
  function init() {
    updateWorldScale();
    bindEvents();

    // Check if test was locked in localStorage (prevents reload and try again)
    const wasLocked = loadLockState();
    if (!wasLocked) {
      resetBallToRelease();
      renderTrialsLog();
      updateLockBanner("practice");
    }

    dom.nbTableHeight.textContent = `${state.tableHeight.toFixed(2)} m`;
    animFrameId = requestAnimationFrame(animLoop);
  }

  window.addEventListener("resize", () => {
    updateWorldScale();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
