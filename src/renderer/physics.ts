const PHYS = {
  N_SEG: 16,
  SPRING: 0.038,
  DAMPING: 0.93,
  STRETCH_HOLD_MS: 1600,
  STRETCH_T_SPRING: 0.24,
  STRETCH_T_DAMP: 0.68,
  PEND_SPRING: 0.003,
  PEND_DAMP: 0.962,
  PEND_IMPULSE: 0.065,
  PEND_MAX_DEG: 45,
  PEND_MAX_PX: 22,
  WIGGLE_IMPULSE: 0.008,
  WIGGLE_MIN_SPEED: 6,
  WIGGLE_MAX_DX: 2.5,
  SETTLE_POS_EPS: 0.01,
  SETTLE_VEL_EPS: 0.005,
};

interface PhysicsState {
  stretchT: number;
  stretchTVel: number;
  pendulumAngle: number;
  pendulumVelAngle: number;
  prevDragDx: number;
  lastWiggleDx: number;
  lastDragMoveAt: number;
  dragHoldStartAt: number;
  dragging: boolean;
  releasing: boolean;
  dxState: number[];
  velState: number[];
}

function createPhysicsState(): PhysicsState {
  return {
    stretchT: 0,
    stretchTVel: 0,
    pendulumAngle: 0,
    pendulumVelAngle: 0,
    prevDragDx: 0,
    lastWiggleDx: 0,
    lastDragMoveAt: 0,
    dragHoldStartAt: 0,
    dragging: false,
    releasing: false,
    dxState: new Array(16).fill(0),
    velState: new Array(16).fill(0),
  };
}

function physicsStartDrag(s: PhysicsState, now: number): void {
  s.dragging = true;
  s.releasing = false;
  s.dragHoldStartAt = now;
  s.prevDragDx = 0;
  s.lastWiggleDx = 0;
}

function physicsEndDrag(s: PhysicsState): void {
  s.dragging = false;
  s.releasing = true;
  s.lastWiggleDx = 0;
}

function physicsDragImpulse(s: PhysicsState, dx: number, now: number): void {
  s.lastDragMoveAt = now;
  const delta = dx - s.prevDragDx;
  const scaledDelta = Math.sign(delta) * Math.pow(Math.abs(delta), 2.2) * PHYS.PEND_IMPULSE;
  s.pendulumVelAngle -= scaledDelta;
  s.lastWiggleDx = dx;
  s.prevDragDx = dx;
}

function physicsSettled(s: PhysicsState): boolean {
  if (s.dragging || s.releasing) return false;
  if (s.stretchT !== 0 || s.stretchTVel !== 0) return false;
  if (
    Math.abs(s.pendulumAngle) > PHYS.SETTLE_POS_EPS ||
    Math.abs(s.pendulumVelAngle) > PHYS.SETTLE_VEL_EPS
  )
    return false;
  for (let i = 0; i < PHYS.N_SEG; i++) {
    if (Math.abs(s.dxState[i]) > PHYS.SETTLE_POS_EPS || Math.abs(s.velState[i]) > PHYS.SETTLE_VEL_EPS)
      return false;
  }
  return true;
}

function physicsReset(s: PhysicsState): void {
  s.stretchT = 0;
  s.stretchTVel = 0;
  s.pendulumAngle = 0;
  s.pendulumVelAngle = 0;
  for (let i = 0; i < PHYS.N_SEG; i++) {
    s.dxState[i] = 0;
    s.velState[i] = 0;
  }
}

function physicsTick(s: PhysicsState, now: number): boolean {
  if (s.dragging && now - s.lastDragMoveAt > 80) s.prevDragDx *= 0.78;

  if (s.dragging && s.dragHoldStartAt > 0) {
    const holdT = Math.min(1, (now - s.dragHoldStartAt) / PHYS.STRETCH_HOLD_MS);
    const eased = holdT < 0.5 ? 4 * holdT * holdT * holdT : 1 - Math.pow(-2 * holdT + 2, 3) / 2;
    s.stretchT = Math.min(0.32, eased);
  }

  if (s.releasing) {
    s.stretchTVel += (0 - s.stretchT) * PHYS.STRETCH_T_SPRING;
    s.stretchTVel *= PHYS.STRETCH_T_DAMP;
    s.stretchT += s.stretchTVel;
    if (Math.abs(s.stretchT) < 0.006 && Math.abs(s.stretchTVel) < 0.005) {
      s.stretchT = 0;
      s.stretchTVel = 0;
    }
  }

  const activePendSpring = s.dragging ? 0.018 : s.releasing ? 0.05 : PHYS.PEND_SPRING;
  const activePendDamp = s.dragging ? 0.86 : s.releasing ? 0.72 : PHYS.PEND_DAMP;
  s.pendulumVelAngle += -s.pendulumAngle * activePendSpring;
  s.pendulumVelAngle *= activePendDamp;
  s.pendulumAngle += s.pendulumVelAngle;
  s.pendulumAngle = Math.max(-PHYS.PEND_MAX_DEG, Math.min(PHYS.PEND_MAX_DEG, s.pendulumAngle));

  const pendDx = Math.sin((s.pendulumAngle * Math.PI) / 180) * PHYS.PEND_MAX_PX;
  for (let i = 0; i < PHYS.N_SEG; i++) {
    const d = i / (PHYS.N_SEG - 1);
    const dPrev = i > 0 ? (i - 1) / (PHYS.N_SEG - 1) : 0;
    const relTarget = pendDx * (d * d - dPrev * dPrev);
    s.velState[i] += (relTarget - s.dxState[i]) * PHYS.SPRING;
    s.velState[i] *= PHYS.DAMPING;
    s.dxState[i] = Math.max(
      -PHYS.WIGGLE_MAX_DX,
      Math.min(PHYS.WIGGLE_MAX_DX, s.dxState[i] + s.velState[i])
    );
  }

  if (s.dragging && Math.abs(s.lastWiggleDx) > PHYS.WIGGLE_MIN_SPEED) {
    const kick =
      Math.sign(s.lastWiggleDx) * Math.pow(Math.abs(s.lastWiggleDx), 1.3) * PHYS.WIGGLE_IMPULSE;
    s.velState[0] -= kick;
    s.lastWiggleDx *= 0.6;
  }

  const lagMotion = (Math.abs(s.pendulumAngle) + Math.abs(s.pendulumVelAngle)) / PHYS.PEND_MAX_DEG;
  if (s.releasing && s.stretchT < 0.02 && lagMotion < 0.12) {
    s.releasing = false;
    physicsReset(s);
    return true;
  }
  return false;
}
