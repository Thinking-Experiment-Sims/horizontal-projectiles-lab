/**
 * projectilesApp.js
 * 
 * Interactive Application & Canvas Renderer for the Horizontal Projectiles Lab.
 * Replicates the classic classroom experiment: ramp release, 2-photogate speed measurement,
 * table height measurement, hotdog-folded target paper with carbon paper placement,
 * and zero-clue student inquiry.
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
    // Phase: 'ready', 'rolling_ramp', 'rolling_table', 'flying', 'bounced', 'stopped'
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
      status: "READY", // 'READY', 'GATE_1', 'STOPPED'
      elapsedTime: 0, // current run's photogate transit time (s)
      gate1Active: false,
      gate2Active: false,
      trials: [] // array of photogate times: [t1, t2, t3, ...]
    },

    // Target Paper Setup
    targetPaper: {
      placed: false,
      creaseX: 1.15, // student-specified predicted landing distance (m)
      length: Physics.PAPER_LENGTH, // ~0.28m
      carbonPaperLifted: false,
      strikes: [] // list of impacts { dropNum, actualX, creaseX, devMm, evalResult }
    },

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
    dragging: null, // 'ball', 'target', 'heightTape'
    mouseWorld: { x: 0, y: 0 }
  };

  /* ==========================================================================
     DOM Element References
     ========================================================================== */
  const dom = {
    // Canvas elements
    canvas: document.getElementById("simCanvas"),
    targetCanvas: document.getElementById("targetCanvas"),

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

    // Modal
    inspectModal: document.getElementById("inspectModal"),
    btnCloseModal: document.getElementById("btnCloseModal"),
    btnLiftCarbon: document.getElementById("btnLiftCarbon"),
    modalEvalSummary: document.getElementById("modalEvalSummary"),

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
  // World bounds in meters:
  // Floor is y = 0. Table launch edge is x = 0, y = tableHeight.
  // x spans from -0.85m to +2.45m. y spans from -0.15m to 1.70m.
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
    const footX = world.transitionStartX; // where ramp meets horizontal table

    // The curved transition connects horizontally at (footX, tableH)
    // with radius R tangent to horizontal.
    // Arc center:
    const arcCenterX = footX;
    const arcCenterY = tableH + R;
    
    // Transition point from arc to straight incline:
    // Angle from bottom of circle is angleRad
    const transX = arcCenterX - R * Math.sin(angleRad);
    const transY = arcCenterY - R * Math.cos(angleRad);

    // Straight ramp extends backwards along angleRad:
    // s is measured along incline from the transition point
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
   * s >= 0: along the straight incline
   * s < 0: along the curved transition foot
   */
  function getBallRampCoordinates(s) {
    const geom = getRampGeometry();
    const rBall = state.ball.radius;

    if (s >= 0) {
      // Along straight incline
      // Offset outwards normal to incline: normal vector is (-sin, cos)
      const normalX = -Math.sin(geom.angleRad);
      const normalY = Math.cos(geom.angleRad);
      const px = geom.transX - s * Math.cos(geom.angleRad) + normalX * rBall;
      const py = geom.transY + s * Math.sin(geom.angleRad) + normalY * rBall;
      return { x: px, y: py, angle: -geom.angleRad };
    } else {
      // On curved foot: s is negative distance along arc
      const arcDist = Math.max(-geom.R * geom.angleRad, s);
      const theta = -arcDist / geom.R; // angle from horizontal (0 to angleRad)
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
    state.phase = "ready";
    state.ball.s = state.releaseDistance;
    state.ball.vx = 0;
    state.ball.vy = 0;
    state.ball.rotation = 0;
    state.ball.tFlight = 0;
    state.trajectoryPath = [];
    
    // Update ball coordinates to ramp release position
    const pos = getBallRampCoordinates(state.ball.s);
    state.ball.x = pos.x;
    state.ball.y = pos.y;

    // Reset console active LEDs
    state.timer.gate1Active = false;
    state.timer.gate2Active = false;
    updateConsoleLEDs();

    dom.btnRelease.disabled = false;
    dom.btnReset.disabled = true;
  }

  function releaseBall() {
    if (state.phase !== "ready") return;

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
    if (state.phase === "ready" || state.phase === "stopped") return;

    // Apply simulation speed multiplier
    const simDt = dt * state.simSpeed;

    const geom = getRampGeometry();
    const g = Physics.G;
    const rBall = state.ball.radius;
    const tableH = state.tableHeight;
    const vExit = state.ball.currentExitV;

    // 1. ROLLING DOWN RAMP
    if (state.phase === "rolling_ramp") {
      // Rolling acceleration along incline: a = (5/7) * g * sin(theta)
      const aIncline = (5 / 7) * g * Math.sin(geom.angleRad);
      
      // We calculate progress based on exit velocity and energy curve
      // For smooth animation across the curved foot:
      const totalArcLen = geom.R * geom.angleRad;
      const totalRampDist = state.releaseDistance + totalArcLen;
      
      // Estimate current speed along track
      const distTraveled = state.releaseDistance - state.ball.s;
      const currentSpeed = Math.min(vExit, Math.max(0.05, Math.sqrt(2 * aIncline * Math.max(0, distTraveled))));
      
      state.ball.s -= currentSpeed * simDt;
      state.ball.rotation += (currentSpeed * simDt) / rBall;

      if (state.ball.s <= -totalArcLen) {
        // Exited ramp onto flat horizontal table!
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

      // Photogate beam detection logic
      const g1X = state.gate1X;
      const g2X = state.gate2X;

      // Passing Gate 1:
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

      // Passing Gate 2:
      if (prevX < g2X && state.ball.x >= g2X) {
        state.timer.status = "STOPPED";
        state.timer.gate2Active = true;
        
        // Exact transit time Delta t = d / v
        const exactTransitTime = Physics.calculatePhotogateTime(state.ball.vx, state.photogateDistance);
        state.timer.elapsedTime = exactTransitTime;
        dom.readoutTime.textContent = exactTransitTime.toFixed(4);
        
        // Log this trial into photogate memory
        logPhotogateTrial(exactTransitTime);
        updateConsoleLEDs();
      }

      // Reaching Table Launch Edge (x = 0)
      if (state.ball.x >= 0) {
        state.phase = "flying";
        state.ball.x = 0;
        state.ball.y = tableH + rBall;
        state.ball.vy = 0; // purely horizontal launch
        state.ball.tFlight = 0;
        state.trajectoryPath.push({ x: state.ball.x, y: state.ball.y });
      }
    }

    // 3. FREE PROJECTILE FLIGHT IN AIR
    else if (state.phase === "flying") {
      state.ball.tFlight += simDt;
      state.ball.x += state.ball.vx * simDt;
      state.ball.vy -= g * simDt;
      state.ball.y += state.ball.vy * simDt;
      state.ball.rotation += (state.ball.vx * simDt) / rBall;

      state.trajectoryPath.push({ x: state.ball.x, y: state.ball.y });

      // Check collision with floor (y <= rBall)
      if (state.ball.y <= rBall) {
        state.ball.y = rBall;
        handleFloorImpact(state.ball.x);
        state.phase = "bounced";
        state.ball.vy = -state.ball.vy * 0.35; // bounce restitution
        state.ball.vx *= 0.65;
      }
    }

    // 4. BOUNCING & ROLLING TO STOP ON FLOOR
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

    // Evaluate target hit
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

    // Update target status badge
    if (isTargetPlaced) {
      dom.targetStatusBadge.textContent = `${evalResult.rating} (${evalResult.absDeviationMm.toFixed(1)} mm)`;
      dom.targetStatusBadge.className = `target-status-badge ${evalResult.badgeClass}`;
      dom.btnInspectTarget.disabled = false;
    } else {
      dom.targetStatusBadge.textContent = `Landed at ${landingX.toFixed(3)} m (Target not placed)`;
      dom.targetStatusBadge.className = "target-status-badge";
    }

    // Automatically refresh target closeup modal if currently open
    if (dom.inspectModal.classList.contains("open")) {
      renderTargetCloseup();
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

    // Autofill photogate times in student notebook for convenience
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

    // 1. Draw Lab Room Background (Floor, Wall, Subtle Grid)
    drawEnvironment();

    // 2. Draw Lab Table & Mounts
    drawTable();

    // 3. Draw Ramp Track on Table
    drawRamp();

    // 4. Draw Photogates & Infrared Beams
    drawPhotogates();

    // 5. Draw Measuring Tools (Plumb Line, Height Tape, Floor Scale)
    if (state.showFloorTape) drawFloorTape();
    if (state.showPlumbLine) drawPlumbLine();
    if (state.showHeightTape) drawHeightTape();

    // 6. Draw Folded Target Paper with Carbon Paper on Floor
    drawTargetPaperOnFloor();

    // 7. Draw Trajectory Trail
    if (state.showTrajectory && state.trajectoryPath.length > 1) {
      drawTrajectory();
    }

    // 8. Draw Ball
    drawBall();
  }

  /**
   * Renders classroom lab environment with subtle wall baseboard and floor.
   */
  function drawEnvironment() {
    const w = dom.canvas.width;
    const h = dom.canvas.height;
    const floorP = worldToScreen(0, 0);

    // Wall background
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, w, floorP.y);

    // Wall blueprint grid
    ctx.strokeStyle = "rgba(15, 126, 155, 0.05)";
    ctx.lineWidth = 1;
    const gridStep = 0.20; // 20 cm grid in world
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

    // Baseboard along bottom of wall
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

    // Floor surface line
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
    const tableTopThick = 0.04; // 4 cm thick tabletop
    const tableLeftX = -0.75;
    const tableRightX = 0.00; // Launch edge is at x = 0

    const pTopLeft = worldToScreen(tableLeftX, tableH);
    const pTopRight = worldToScreen(tableRightX, tableH);
    const pBottomLeft = worldToScreen(tableLeftX, tableH - tableTopThick);
    const pFloorLeft = worldToScreen(tableLeftX, 0);
    const pFloorRight = worldToScreen(tableRightX, 0);

    const legWidthPx = 14;

    // Table legs (Sturdy brushed dark steel)
    ctx.fillStyle = "#334155";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;

    // Left leg
    ctx.fillRect(pBottomLeft.x + 8, pBottomLeft.y, legWidthPx, pFloorLeft.y - pBottomLeft.y);
    ctx.strokeRect(pBottomLeft.x + 8, pBottomLeft.y, legWidthPx, pFloorLeft.y - pBottomLeft.y);

    // Right leg
    ctx.fillRect(pTopRight.x - 22, pBottomLeft.y, legWidthPx, pFloorRight.y - pBottomLeft.y);
    ctx.strokeRect(pTopRight.x - 22, pBottomLeft.y, legWidthPx, pFloorRight.y - pBottomLeft.y);

    // Cross brace
    const braceY = (pBottomLeft.y + pFloorLeft.y) * 0.65;
    ctx.fillRect(pBottomLeft.x + 8, braceY, (pTopRight.x - 22) - (pBottomLeft.x + 8), 8);

    // Wooden tabletop with bevel and highlight
    const topW = pTopRight.x - pTopLeft.x;
    const topH = pBottomLeft.y - pTopLeft.y;

    const woodGrad = ctx.createLinearGradient(pTopLeft.x, pTopLeft.y, pTopLeft.x, pBottomLeft.y);
    woodGrad.addColorStop(0, "#d97706");
    woodGrad.addColorStop(0.3, "#b45309");
    woodGrad.addColorStop(1, "#78350f");

    ctx.fillStyle = woodGrad;
    ctx.fillRect(pTopLeft.x, pTopLeft.y, topW, topH);
    
    // Top surface shine
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
    ctx.fillRect(pTopLeft.x, pTopLeft.y, topW, 2);

    // Front edge outline
    ctx.strokeStyle = "#451a03";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pTopLeft.x, pTopLeft.y, topW, topH);

    // Aluminum track rail along table top
    const trackP1 = worldToScreen(world.transitionStartX, tableH);
    const trackP2 = worldToScreen(0, tableH);
    ctx.fillStyle = "#94a3b8";
    ctx.fillRect(trackP1.x, trackP1.y - 3, trackP2.x - trackP1.x, 3);
    ctx.strokeStyle = "#475569";
    ctx.lineWidth = 1;
    ctx.strokeRect(trackP1.x, trackP1.y - 3, trackP2.x - trackP1.x, 3);
  }

  /**
   * Renders the curved incline ramp mounted on the table.
   */
  function drawRamp() {
    const geom = getRampGeometry();
    const tableH = state.tableHeight;
    const rBall = state.ball.radius;

    // Track rail path (upper surface of rail)
    ctx.strokeStyle = "#0f7e9b";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();

    // Straight portion
    const pTop = worldToScreen(geom.topX, geom.topY);
    const pTrans = worldToScreen(geom.transX, geom.transY);
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pTrans.x, pTrans.y);

    // Curved transition foot
    const steps = 20;
    for (let i = 1; i <= steps; i++) {
      const sArc = -(i / steps) * (geom.R * geom.angleRad);
      const pt = getBallRampCoordinates(sArc);
      const spt = worldToScreen(pt.x, pt.y - rBall);
      ctx.lineTo(spt.x, spt.y);
    }
    ctx.stroke();

    // Ramp support bracket & clamp onto table
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
      
      // Tick normal to rail
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

    // Angle indicator arc near table
    const pArcCenter = worldToScreen(geom.topX, tableH);
    ctx.strokeStyle = "var(--accent-amber)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pArcCenter.x, pArcCenter.y, 28, -geom.angleRad, 0);
    ctx.stroke();
    ctx.fillStyle = "var(--accent-amber-dark)";
    ctx.font = "bold 10px JetBrains Mono, monospace";
    ctx.fillText(`θ=${state.rampAngleDeg}°`, pArcCenter.x + 38, pArcCenter.y - 6);

    // Release stop indicator pin at current release position
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
    const gateH = 34; // height of U-bracket

    function drawSingleGate(gx, active, label) {
      // Photogate black bracket
      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;

      // Base mount
      ctx.fillRect(gx - 6, g1.y - 2, 12, 6);

      // Vertical post
      ctx.fillRect(gx - 3, g1.y - gateH, 6, gateH);

      // Top sensor housing
      drawRoundedRect(ctx, gx - 8, g1.y - gateH - 8, 16, 10, 3);
      ctx.fill();
      ctx.stroke();

      // Infrared beam (dashed red line when active/inactive)
      ctx.strokeStyle = active ? "rgba(220, 38, 38, 0.9)" : "rgba(15, 126, 155, 0.4)";
      ctx.lineWidth = active ? 2 : 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(gx, g1.y - gateH);
      ctx.lineTo(gx, g1.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Gate label badge
      ctx.fillStyle = active ? "#dc2626" : "#0f7e9b";
      ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, gx, g1.y - gateH - 12);

      // Glowing LED on bracket
      ctx.fillStyle = active ? "#ef4444" : "#22c55e";
      ctx.beginPath();
      ctx.arc(gx, g1.y - gateH - 3, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    drawSingleGate(g1.x, state.timer.gate1Active, "G1");
    drawSingleGate(g2.x, state.timer.gate2Active, "G2");

    // Dimension line between photogates showing known distance d = 10.0 cm
    ctx.strokeStyle = "var(--primary-teal)";
    ctx.lineWidth = 1.2;
    const dimY = g1.y - gateH - 24;
    ctx.beginPath();
    ctx.moveTo(g1.x, dimY);
    ctx.lineTo(g2.x, dimY);
    ctx.stroke();

    // Arrows
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
   * Establishes the origin x = 0 on the floor, matching real lab practice!
   */
  function drawPlumbLine() {
    const tableH = state.tableHeight;
    const pTop = worldToScreen(0, tableH);
    const pFloor = worldToScreen(0, 0);

    // Plumb cord
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(pTop.x, pTop.y);
    ctx.lineTo(pFloor.x, pFloor.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Brass plumb bob hanging just above floor
    const bobY = pFloor.y - 10;
    ctx.fillStyle = "#d97706";
    ctx.strokeStyle = "#92400e";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pFloor.x, pFloor.y - 2); // pointed tip
    ctx.lineTo(pFloor.x - 5, bobY - 8);
    ctx.lineTo(pFloor.x + 5, bobY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Origin label on floor
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
    const tapeX = 0.12; // 12 cm to the right of table edge
    const pFloor = worldToScreen(tapeX, 0);
    const pTop = worldToScreen(tapeX, tableH);

    // Ruler body (bright yellow-white fiberglass tape)
    const tapeW = 16;
    ctx.fillStyle = "#fffbeb";
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 1.2;
    ctx.fillRect(pTop.x - tapeW / 2, pTop.y, tapeW, pFloor.y - pTop.y);
    ctx.strokeRect(pTop.x - tapeW / 2, pTop.y, tapeW, pFloor.y - pTop.y);

    // Ruler graduation ticks every 5 cm and 10 cm
    ctx.strokeStyle = "#78350f";
    ctx.fillStyle = "#78350f";
    ctx.font = "8px JetBrains Mono, monospace";
    ctx.textAlign = "right";

    const stepM = 0.05; // 5 cm
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

    // Indicator flag at table height reading
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

    // Fiberglass metric floor tape strip
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.fillRect(pStart.x, tapeY, pEnd.x - pStart.x, tapeH);
    ctx.strokeRect(pStart.x, tapeY, pEnd.x - pStart.x, tapeH);

    // Graduation ticks every 10 cm & 5 cm
    ctx.font = "8px JetBrains Mono, monospace";
    ctx.textAlign = "center";

    const step = 0.05; // 5 cm
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
    const paperH = 18; // screen thickness on floor
    const paperY = pStart.y - 3;

    // White sheet underneath
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, pStart.x, paperY, paperW, paperH, 2);
    ctx.fill();
    ctx.stroke();

    // Dark Carbon Paper on top (semi-translucent if not lifted)
    if (!state.targetPaper.carbonPaperLifted) {
      ctx.fillStyle = "rgba(30, 41, 59, 0.88)"; // carbon black
      drawRoundedRect(ctx, pStart.x + 2, paperY + 1, paperW - 4, paperH - 2, 2);
      ctx.fill();
    }

    // Distinct Hotdog Crease down center of paper
    ctx.strokeStyle = state.targetPaper.carbonPaperLifted ? "#0f7e9b" : "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pCrease.x, paperY - 4);
    ctx.lineTo(pCrease.x, paperY + paperH + 4);
    ctx.stroke();

    // Crease Flag & Label
    ctx.fillStyle = "var(--accent-amber-dark)";
    ctx.font = "bold 9px JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`Crease: ${creaseX.toFixed(3)} m`, pCrease.x, paperY - 8);

    // Draw previous carbon impact marks on the paper
    state.targetPaper.strikes.forEach(strike => {
      const sp = worldToScreen(strike.actualX, 0);
      
      // Carbon mark dot
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(sp.x, paperY + paperH / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Outer splatter ring
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sp.x, paperY + paperH / 2, 5, 0, Math.PI * 2);
      ctx.stroke();

      // Drop # badge
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
   * Renders the steel ball with specular shine and rotation stripe.
   */
  function drawBall() {
    const bp = worldToScreen(state.ball.x, state.ball.y);
    const rPx = state.ball.radius * world.scaleX;

    // Subtle drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.beginPath();
    ctx.ellipse(bp.x, bp.y + rPx * 0.9, rPx * 0.9, rPx * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball body (Brushed Chrome/Steel gradient)
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

    // Rotation orientation mark so students see it rolling
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
    const paperLen = state.targetPaper.length; // ~0.28m = 280 mm
    const halfLenMm = (paperLen * 1000) / 2; // 140 mm
    const pxPerMm = (w - 80) / (paperLen * 1000);
    const centerPx = w / 2; // Exact center is the Crease

    // 1. Draw Clean White Paper Sheet with hotdog fold crease
    targetCtx.fillStyle = "#ffffff";
    targetCtx.strokeStyle = "#94a3b8";
    targetCtx.lineWidth = 1.5;
    drawRoundedRect(targetCtx, 30, 25, w - 60, h - 50, 6);
    targetCtx.fill();
    targetCtx.stroke();

    // Subtle paper fold shading on left & right halves
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

    // Carbon paper overlay if not lifted
    if (!state.targetPaper.carbonPaperLifted) {
      targetCtx.fillStyle = "rgba(15, 23, 42, 0.82)"; // dark graphite carbon
      drawRoundedRect(targetCtx, 40, 35, w - 80, h - 70, 4);
      targetCtx.fill();
    }

    // 2. The Folded Crease Line (Center: exactly 0 mm deviation)
    targetCtx.strokeStyle = state.targetPaper.carbonPaperLifted ? "#0f7e9b" : "#38bdf8";
    targetCtx.lineWidth = 2.5;
    targetCtx.setLineDash([]);
    targetCtx.beginPath();
    targetCtx.moveTo(centerPx, 15);
    targetCtx.lineTo(centerPx, h - 15);
    targetCtx.stroke();

    // Crease banner
    targetCtx.fillStyle = "var(--primary-teal-dark)";
    targetCtx.font = "bold 12px JetBrains Mono, monospace";
    targetCtx.textAlign = "center";
    targetCtx.fillText(`★ THE CREASE (Prediction = ${creaseX.toFixed(3)} m) ★`, centerPx, 18);

    // 3. Millimeter Vernier Ruler across the paper
    const rulerY = h - 65;
    targetCtx.strokeStyle = state.targetPaper.carbonPaperLifted ? "#334155" : "#94a3b8";
    targetCtx.fillStyle = state.targetPaper.carbonPaperLifted ? "#1e293b" : "#e2e8f0";
    targetCtx.lineWidth = 1;
    targetCtx.font = "9px JetBrains Mono, monospace";

    // Draw ticks every 5 mm and 10 mm relative to crease
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

    // 4. Draw Carbon Strike Marks on Target Paper
    const strikes = state.targetPaper.strikes;
    if (strikes.length === 0) {
      targetCtx.fillStyle = state.targetPaper.carbonPaperLifted ? "#64748b" : "#cbd5e1";
      targetCtx.font = "italic 13px Inter, sans-serif";
      targetCtx.fillText("No ball strikes recorded yet. Release the ball to land on the target!", centerPx, h / 2);
      return;
    }

    strikes.forEach((strike, idx) => {
      const devMm = (strike.actualX - creaseX) * 1000;
      const strikeX = centerPx + devMm * pxPerMm;
      const strikeY = h / 2 + (idx - (strikes.length - 1) / 2) * 26;

      // Carbon impact mark with realistic splatter ring
      targetCtx.fillStyle = "#000000";
      targetCtx.beginPath();
      targetCtx.arc(strikeX, strikeY, 5.5, 0, Math.PI * 2);
      targetCtx.fill();

      targetCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      targetCtx.lineWidth = 2;
      targetCtx.beginPath();
      targetCtx.arc(strikeX, strikeY, 8.5, 0, Math.PI * 2);
      targetCtx.stroke();

      // Strike label
      targetCtx.fillStyle = "var(--accent-amber-dark)";
      targetCtx.font = "bold 11px JetBrains Mono, monospace";
      targetCtx.textAlign = "center";
      const devSign = devMm >= 0 ? `+${devMm.toFixed(1)}` : devMm.toFixed(1);
      targetCtx.fillText(`Drop #${strike.dropNum} (${devSign} mm)`, strikeX, strikeY - 12);
    });

    // Update modal evaluation summary cards
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

    // Apparatus sliders
    dom.sliderAngle.addEventListener("input", (e) => {
      state.rampAngleDeg = parseFloat(e.target.value);
      dom.valAngle.textContent = `${state.rampAngleDeg}°`;
      resetBallToRelease();
    });

    dom.sliderRelease.addEventListener("input", (e) => {
      state.releaseDistance = parseFloat(e.target.value);
      dom.valRelease.textContent = `${(state.releaseDistance * 100).toFixed(0)} cm`;
      resetBallToRelease();
    });

    dom.sliderHeight.addEventListener("input", (e) => {
      state.tableHeight = parseFloat(e.target.value);
      dom.valHeight.textContent = `${state.tableHeight.toFixed(2)} m`;
      dom.nbTableHeight.textContent = `${state.tableHeight.toFixed(2)} m`;
      resetBallToRelease();
    });

    // Target Placement Controls
    dom.btnPlaceTarget.addEventListener("click", () => {
      state.targetPaper.placed = !state.targetPaper.placed;
      if (state.targetPaper.placed) {
        dom.btnPlaceTarget.textContent = "📄 Remove Target Paper";
        dom.btnPlaceTarget.className = "btn btn-secondary";
        dom.targetStatusBadge.textContent = "Paper Placed on Floor";
        dom.btnInspectTarget.disabled = false;
      } else {
        dom.btnPlaceTarget.textContent = "📄 Place Target Paper on Floor";
        dom.btnPlaceTarget.className = "btn btn-primary";
        dom.targetStatusBadge.textContent = "Not Placed";
      }
    });

    dom.inputCreaseX.addEventListener("change", (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val) || val < 0.2) val = 0.2;
      if (val > 2.3) val = 2.3;
      state.targetPaper.creaseX = val;
      dom.inputCreaseX.value = val.toFixed(3);
      dom.sliderCreaseX.value = val;
    });

    dom.sliderCreaseX.addEventListener("input", (e) => {
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

    // Student notebook: Apply predicted landing distance to target paper crease
    dom.btnApplyNotebookPred.addEventListener("click", () => {
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
      } else {
        alert("Please enter a valid predicted landing distance between 0.20 m and 2.40 m.");
      }
    });

    // Mouse / Touch drag on canvas to adjust ball release or target crease
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
      const pos = getCanvasCoords(e);
      state.mouseWorld = pos.world;

      // Check if clicking near the ball on the ramp to drag release position
      if (state.phase === "ready") {
        const ballScreen = worldToScreen(state.ball.x, state.ball.y);
        const dist = Math.hypot(pos.sx - ballScreen.x, pos.sy - ballScreen.y);
        if (dist < 26) {
          state.dragging = "ball";
          e.preventDefault();
          return;
        }
      }

      // Check if clicking target paper to drag crease along floor
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
      if (!state.dragging) return;
      const pos = getCanvasCoords(e);

      if (state.dragging === "ball" && state.phase === "ready") {
        // Project world position onto straight ramp
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
    const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000); // capped at 50ms
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
    resetBallToRelease();
    renderTrialsLog();
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
