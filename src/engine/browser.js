/**
 * The engine in the browser: each worker kind is a Web Worker that is only
 * downloaded when it is first used.
 */
import { createEngine } from './engine.js';

const SCRIPTS = {
  optimizer: () => new Worker(new URL('./vendor/optimizer.worker.js', import.meta.url), { type: 'module' }),
  hints: () => new Worker(new URL('./vendor/hints.worker.js', import.meta.url), { type: 'module' }),
  skills: () => new Worker(new URL('./vendor/skills.worker.js', import.meta.url), { type: 'module' }),
  skillsScorer: () => new Worker(new URL('./vendor/skills-scorer.worker.js', import.meta.url), { type: 'module' }),
};

// Leave a core or two for the page itself.
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
const parallel = Math.max(1, Math.min(8, cores - 2));

let engine = null;

/** The shared engine for this page. */
export function getEngine() {
  engine ??= createEngine({ spawn: (kind) => SCRIPTS[kind](), optimizers: parallel, scorers: parallel });
  return engine;
}
