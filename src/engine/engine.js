/**
 * The optimizer engine: one interface over the four worker scripts.
 *
 * Workers are created through `spawn(kind)`, which returns a Worker-like
 * object ({ postMessage, onmessage, onerror, terminate }). The browser passes
 * real Web Workers (see browser.js); tests pass the same scripts run in Node.
 * Kinds: 'optimizer', 'hints', 'skills', 'skillsScorer'. Each is created the
 * first time it's needed.
 *
 *   engine.optimize(request)          raw optimizer request → { result, reason }
 *   engine.cheapestBuild(input, dmg)  cheapest build reaching a damage target, or null
 *   engine.strongestBuild(input, g)   most damage within a daily budget, or null
 *   engine.damageCurve(input, dmg)    cheapest build plus the damage/cost frontier around it
 *   engine.hints(input, build)        cheaper build with the same damage / stronger for the same cost
 *   engine.optimizeSkills(request)    skill layout search (economy-aware), with progress
 */

/** Sends one message at a time to a worker and resolves with its reply; progress messages go to `onProgress`. */
class Channel {
  constructor(worker) {
    this.worker = worker;
    this.queue = Promise.resolve();
  }

  request(message, { transfer = [], onProgress } = {}) {
    const run = () => new Promise((resolve, reject) => {
      this.worker.onmessage = ({ data }) => {
        if (data && typeof data === 'object' && 'progress' in data) return onProgress?.(data.progress);
        if (data && typeof data === 'object' && 'error' in data && data.error) return reject(new Error(String(data.error)));
        resolve(data);
      };
      this.worker.onerror = (event) => {
        event?.preventDefault?.();
        reject(new Error(event?.message || 'The optimizer stopped unexpectedly.'));
      };
      this.worker.postMessage(message, transfer);
    });
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }
}

/** Several copies of one worker kind; each request goes to the next free copy. */
class Pool {
  constructor(spawn, kind, size) {
    this.spawn = spawn;
    this.kind = kind;
    this.size = size;
    this.channels = [];
    this.idle = [];
    this.waiting = [];
  }

  async acquire() {
    if (this.idle.length) return this.idle.pop();
    if (this.channels.length < this.size) {
      const channel = new Channel(this.spawn(this.kind));
      this.channels.push(channel);
      return channel;
    }
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  release(channel) {
    const next = this.waiting.shift();
    if (next) next(channel);
    else this.idle.push(channel);
  }

  async request(message, options) {
    const channel = await this.acquire();
    try {
      return await channel.request(message, options);
    } finally {
      this.release(channel);
    }
  }

  close() {
    for (const c of this.channels) c.worker.terminate?.();
    this.channels = [];
    this.idle = [];
  }
}

// What the original page uses: the skill search stops after 45 seconds with its best layout so far.
const SKILLS_TIME_LIMIT_MS = 45000;

export function createEngine({ spawn, optimizers = 4, scorers = 4, createChannel = () => new MessageChannel() }) {
  const optimizerPool = new Pool(spawn, 'optimizer', optimizers);
  const hintsPool = new Pool(spawn, 'hints', 1);
  let skills = null;

  const optimize = (request) => optimizerPool.request(request);

  return {
    optimize,

    async cheapestBuild(input, damage) {
      return (await optimize({ mode: 'damage', input, target: damage, maxBudget: Infinity, graph: false })).result ?? null;
    },

    async strongestBuild(input, budget) {
      return (await optimize({ mode: 'budget', input, budget })).result ?? null;
    },

    async damageCurve(input, damage) {
      return (await optimize({ mode: 'damage', input, target: damage, maxBudget: Infinity })).result ?? null;
    },

    async hints(input, build) {
      const reply = await hintsPool.request({ id: 0, input, build, prices: {} });
      return reply.points ?? [];
    },

    /**
     * request: { market, player, combat, economy, range, locks, resetCostPerPoint }.
     * Resolves to the worker's response ({ result, reason }). `signal` cancels.
     */
    async optimizeSkills(request, { timeLimitMs = SKILLS_TIME_LIMIT_MS, onProgress, signal } = {}) {
      skills ??= {
        search: new Channel(spawn('skills')),
        scorers: Array.from({ length: scorers }, () => spawn('skillsScorer')),
      };
      const current = skills;
      const stop = () => {
        current.search.worker.terminate?.();
        for (const s of current.scorers) s.terminate?.();
        if (skills === current) skills = null;
      };
      if (signal?.aborted) throw new Error('Skill optimization cancelled.');
      signal?.addEventListener('abort', stop, { once: true });
      try {
        const channels = current.scorers.map(() => createChannel());
        current.scorers.forEach((scorer, i) => scorer.postMessage({ request, port: channels[i].port2 }, [channels[i].port2]));
        const ports = channels.map((c) => c.port1);
        const reply = await Promise.race([
          current.search.request({ request, timeLimitMs, scorers: ports }, { transfer: ports, onProgress }),
          new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('Skill optimization cancelled.')), { once: true })),
        ]);
        return reply.response;
      } finally {
        signal?.removeEventListener('abort', stop);
      }
    },

    close() {
      optimizerPool.close();
      hintsPool.close();
      if (skills) {
        skills.search.worker.terminate?.();
        for (const s of skills.scorers) s.terminate?.();
        skills = null;
      }
    },
  };
}
