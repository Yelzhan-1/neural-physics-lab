/* Interactive study model. The published experiments use the original project's
   separate TensorFlow models. Angles enter this API in degrees. */
(() => {
  'use strict';
  const gravity = 9.81, dt = 0.02, duration = 10;
  const hidden = 32, inputs = 6, accelerationUnit = 16;
  const linearSize = hidden + 1;
  const inputSize = hidden * (inputs + 1);
  const parameterCount = inputSize + 2 * linearSize;
  const seed = 2026;
  const cache = new Map();

  function randomSequence(start) {
    let x = start >>> 0;
    return () => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }

  function settings(options = {}) {
    const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
    return {
      theta1: number(options.theta1, 120), theta2: number(options.theta2, -45),
      m1: Math.max(0.01, number(options.m1, 1)), m2: Math.max(0.01, number(options.m2, 1)),
      data: Math.min(100, Math.max(1, number(options.data, 5)))
    };
  }

  // Solve the coupled two-link equations for unit rod lengths, no damping.
  function acceleration(s, p) {
    const total = p.m1 + p.m2;
    const delta = s[0] - s[1];
    const cross = p.m2 * Math.cos(delta);
    const coupling = p.m2 * Math.sin(delta);
    const f1 = -coupling * s[3] ** 2 - total * gravity * Math.sin(s[0]);
    const f2 = coupling * s[2] ** 2 - p.m2 * gravity * Math.sin(s[1]);
    const determinant = total * p.m2 - cross ** 2;
    return [(p.m2 * f1 - cross * f2) / determinant, (total * f2 - cross * f1) / determinant];
  }

  function step(state, delta, system) {
    function derivative(s) { return [s[2], s[3], ...system(s)]; }
    function offset(v, scale) { return state.map((x, i) => x + scale * v[i]); }
    const a = derivative(state), b = derivative(offset(a, delta/2));
    const c = derivative(offset(b, delta/2)), d = derivative(offset(c, delta));
    return state.map((x, i) => x + delta / 6 * (a[i] + 2*b[i] + 2*c[i] + d[i]));
  }

  function input(s) {
    return [Math.sin(s[0]), Math.cos(s[0]), Math.sin(s[1]), Math.cos(s[1]), s[2]/6, s[3]/6];
  }

  function initialize() {
    const random = randomSequence(seed);
    const weights = new Float64Array(parameterCount);
    for (let i = 0; i < inputSize; i++) weights[i] = (random() * 2 - 1) * 1.2;
    return weights;
  }

  function activate(weights, x, features) {
    for (let i = 0; i < hidden; i++) {
      const base = i * (inputs + 1);
      let sum = weights[base + inputs];
      for (let j = 0; j < inputs; j++) sum += x[j] * weights[base+j];
      features[i] = Math.tanh(sum);
    }
    features[hidden] = 1;
  }

  function output(weights, features, channel) {
    const base = inputSize + channel * linearSize;
    let value = 0;
    for (let i = 0; i < linearSize; i++) value += features[i] * weights[base+i];
    return value;
  }

  function predictor(weights) {
    const features = new Float64Array(linearSize);
    return state => {
      activate(weights, input(state), features);
      return [accelerationUnit * output(weights, features, 0), accelerationUnit * output(weights, features, 1)];
    };
  }

  function examples(p) {
    const rng = randomSequence(seed), observations = [], constraints = [];
    const system = s => acceleration(s, p);
    const uniform = limit => (rng()*2 - 1)*limit;
    for (let tr = 0; tr < 8; tr++) {
      let s = [uniform(2.2), uniform(2.2), uniform(1.2), uniform(1.2)];
      for (let i = 0; i < 150; i++) {
        let next = s;
        for (let j = 0; j < 4; j++) next = step(next, dt / 4, system);
        // Labels for the standard model are finite differences of observations.
        observations.push({x:input(s), y:[(next[2]-s[2])/(dt*accelerationUnit), (next[3]-s[3])/(dt*accelerationUnit)]});
        s = next;
      }
    }
    for (let i = observations.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [observations[i], observations[j]] = [observations[j], observations[i]];
    }
    observations.length = Math.round(observations.length * p.data / 100);
    // At unlabeled collocation states the PINN minimizes its residual against
    // the explicit equations of motion. No additional trajectory pairs enter.
    for (let i = 0; i < 1024; i++) {
      const state = [uniform(Math.PI), uniform(Math.PI), uniform(6), uniform(6)];
      constraints.push({x:input(state), y:system(state).map(v => v/accelerationUnit)});
    }
    return {observations, constraints};
  }

  // Ridge-fit the readout of the tanh network for the instant preview.
  function initialFit(data, informed) {
    const weights = initialize(), features = new Float64Array(linearSize);
    const rows = Array.from({length:linearSize}, () => new Float64Array(linearSize + 2));
    function accumulate(samples, importance) {
      const factor = importance / samples.length;
      for (const {x,y} of samples) {
        activate(weights, x, features);
        for (let i = 0; i < linearSize; i++) {
          const f = features[i] * factor, row = rows[i];
          for (let j = 0; j <= i; j++) row[j] += f * features[j];
          row[linearSize] += f*y[0]; row[linearSize+1] += f*y[1];
        }
      }
    }
    accumulate(data.observations, 1);
    if (informed) accumulate(data.constraints, 0.6);
    for (let i = 0; i < linearSize; i++) {
      rows[i][i] += 0.00025;
      for (let j = 0; j < i; j++) rows[j][i] = rows[i][j];
    }
    // The regularized Gram matrix is positive definite.
    for (let i = 0; i < linearSize; i++) {
      const row = rows[i], pivot = row[i];
      for (let k = i; k < row.length; k++) row[k] /= pivot;
      for (let j = 0; j < linearSize; j++) {
        if (i === j) continue;
        const target = rows[j], scale = target[i];
        for (let k = i; k < row.length; k++) target[k] -= scale * row[k];
      }
    }
    for (let i = 0; i < linearSize; i++) {
      weights[inputSize+i] = rows[i][linearSize];
      weights[inputSize+linearSize+i] = rows[i][linearSize+1];
    }
    return weights;
  }

  function cacheKey(p) { return [p.m1, p.m2, p.data].join('/'); }
  function remember(p, pair) {
    cache.set(cacheKey(p), pair);
    if (cache.size > 24) cache.delete(cache.keys().next().value);
  }

  function energy(s, p) {
    const total = p.m1 + p.m2;
    const kinetic = (total*s[2]**2 + p.m2*s[3]**2)/2 + p.m2*s[2]*s[3]*Math.cos(s[0]-s[1]);
    const potential = total*gravity*(1-Math.cos(s[0])) + p.m2*gravity*(1-Math.cos(s[1]));
    return kinetic + potential;
  }

  function rollout(p, nnWeights, pinnWeights) {
    const initial = [p.theta1*Math.PI/180, p.theta2*Math.PI/180, 0, 0];
    const initialEnergy = energy(initial, p);
    const exact = s => acceleration(s, p);
    const nnAcceleration = predictor(nnWeights), pinnAcceleration = predictor(pinnWeights);
    const states = {physics: initial, nn: initial, pinn: initial};
    const frames = [];
    for (let i = 0; i <= Math.round(duration / dt); i++) {
      const frame = {t:i*dt};
      for (const key of ['physics','nn','pinn']) {
        const s = states[key];
        const x1 = Math.sin(s[0]), y1 = Math.cos(s[0]);
        const x2 = x1+Math.sin(s[1]), y2 = y1+Math.cos(s[1]);
        const energyDrift = energy(s,p) - initialEnergy;
        const tipError = key === 'physics' ? 0 : Math.hypot(x2-frame.physics.x2,y2-frame.physics.y2);
        frame[key] = {x1,y1,x2,y2,tipError,energyDrift,energyDriftPercent:initialEnergy > 0 ? 100*Math.abs(energyDrift)/initialEnergy : null};
      }
      frames.push(frame);
      if (i < Math.round(duration / dt)) {
        for (let j = 0; j < 4; j++) states.physics = step(states.physics, dt/4, exact);
        states.nn = step(states.nn, dt, nnAcceleration);
        states.pinn = step(states.pinn, dt, pinnAcceleration);
      }
    }
    return {dt,duration,frames};
  }

  function run(options) {
    const p = settings(options);
    let pair = cache.get(cacheKey(p));
    if (!pair) {
      const data = examples(p);
      pair = [initialFit(data, false), initialFit(data, true)];
      remember(p, pair);
    }
    return rollout(p, ...pair);
  }

  // Live fitting updates every parameter with mini-batch Adam. Fraction
  // controls the number of trajectory labels for both models. Progress is
  // measured as the active optimization budget used after completed batches.
  async function train(options, onProgress = () => {}, {signal} = {}) {
    const p = settings(options), data = examples(p), pair = [];
    const budgetPerModelMs = 10000, batchSize = 64;
    const yieldUI = () => new Promise(resolve => setTimeout(resolve,0));
    const checkAbort = () => { if (signal?.aborted) throw new DOMException('Training stopped','AbortError'); };
    onProgress(0);
    for (let model = 0; model < 2; model++) {
      const weights = initialFit(data, model === 1);
      const m = new Float64Array(parameterCount), v = new Float64Array(parameterCount);
      const g = new Float64Array(parameterCount), z = new Float64Array(linearSize);
      const sampleRng = randomSequence(seed+1), collocationRng = randomSequence(seed+2);
      let usedMs = 0, batchStart = performance.now();
      for (let n = 1; usedMs < budgetPerModelMs; n++) {
        checkAbort();
        g.fill(0);
        for (let sample = 0; sample < batchSize; sample++) {
          let collection = data.observations, rng = sampleRng;
          if (model && sample % 2) { collection = data.constraints; rng = collocationRng; }
          const {x, y} = collection[Math.floor(rng()*collection.length)];
          activate(weights,x,z);
          const a = output(weights,z,0)-y[0], b = output(weights,z,1)-y[1];
          for (let i = 0; i < linearSize; i++) {
            const aIndex = inputSize+i, bIndex = inputSize+linearSize+i;
            g[aIndex] += a*z[i]; g[bIndex] += b*z[i];
            if (i === hidden) continue;
            const d = (a*weights[aIndex]+b*weights[bIndex])*(1-z[i]*z[i]);
            const base = i*(inputs+1);
            for (let j=0; j < inputs; j++) g[base+j] += d*x[j];
            g[base+inputs] += d;
          }
        }
        const schedule = 0.08 + 0.92 * (1 - usedMs/budgetPerModelMs);
        const rate = 0.0008 * schedule * Math.sqrt(1-0.999**n)/(1-0.9**n);
        for (let i=0; i < parameterCount; i++) {
          const gradient = g[i] / batchSize;
          m[i] = 0.9*m[i] + 0.1*gradient;
          v[i] = 0.999*v[i] + 0.001*gradient**2;
          weights[i] -= rate*m[i]/(Math.sqrt(v[i])+1e-8);
        }
        const spent = performance.now() - batchStart;
        if (spent >= 32) {
          usedMs += spent;
          onProgress((model + Math.min(1,usedMs/budgetPerModelMs))/2);
          await yieldUI(); batchStart = performance.now();
        }
      }
      pair.push(weights);
    }
    checkAbort(); remember(p, pair); onProgress(1);
    return rollout(p,...pair);
  }

  globalThis.NPLSimulation = Object.freeze({run,train});
})();
