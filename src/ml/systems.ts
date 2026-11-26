export type SystemStatus = "ready" | "coming-soon";

/**
 * A physical system the lab can train on. Only the double pendulum is
 * implemented; the other cards exist so a new system can be registered here
 * without redesigning the page.
 */
export interface PhysicalSystem {
  id: string;
  code: string;
  name: string;
  status: SystemStatus;
  summary: string;
}

export const SYSTEMS: readonly PhysicalSystem[] = [
  {
    id: "double-pendulum",
    code: "01",
    name: "Double pendulum",
    status: "ready",
    summary: "Two-link arm. Both networks train on this system.",
  },
  {
    id: "spring-mass",
    code: "02",
    name: "Spring-mass",
    status: "ready",
    summary: "m x″ + c x′ + k x = A sin(ω t). A damped, optionally driven oscillator.",
  },
  {
    id: "projectile",
    code: "03",
    name: "Projectile with drag",
    status: "coming-soon",
    summary: "m a + c |v| v + m g = 0. Quadratic air drag, with a landing marker.",
  },
  {
    id: "orbital",
    code: "04",
    name: "Orbital motion",
    status: "coming-soon",
    summary: "a = −GM r / |r|³, with energy and angular-momentum penalties.",
  },
];

export const ACTIVE_SYSTEM = SYSTEMS[0];
