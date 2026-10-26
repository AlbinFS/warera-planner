/**
 * Runs the engine's worker scripts in Node, for tests: each script gets a
 * `self` and talks to a Worker-like wrapper, the way a Web Worker would.
 */
import fs from 'node:fs';

const FILES = {
  optimizer: 'optimizer.worker.js',
  hints: 'hints.worker.js',
  skills: 'skills.worker.js',
  skillsScorer: 'skills-scorer.worker.js',
};

const sources = {};

export function spawnNodeWorker(kind) {
  sources[kind] ??= fs.readFileSync(new URL(`../src/engine/vendor/${FILES[kind]}`, import.meta.url), 'utf8');
  const self = { onmessage: null, postMessage: null };
  const worker = {
    onmessage: null,
    onerror: null,
    // Asynchronous like a real worker, so a reply never arrives inside postMessage.
    postMessage(data) { setImmediate(() => self.onmessage({ data })); },
    terminate() {},
  };
  self.postMessage = (data) => worker.onmessage?.({ data });
  new Function('self', sources[kind])(self);
  return worker;
}
