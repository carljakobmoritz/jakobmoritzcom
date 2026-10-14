/**
 * Browser/Node translation of Jakob Moritz's q246810.c.
 * Source: https://github.com/GrumpyGoedel/potts/blob/f869369ceaae6bdae692adda39f9877ec34155ef/q246810.c
 *
 * H = -sum_<ij> delta(s_i, s_j), in units J = k_B = 1.
 * Four nearest neighbours, periodic square lattice, random sequential updates.
 * temperatureRatio is T/Tc, matching the C command-line argument -T.
 * This module contains the physics. It does not depend on p5 or the DOM.
 */
export class PottsModel {
  constructor({ size = 128, q = 4, temperatureRatio = 0.5, random = Math.random } = {}) {
    if (!Number.isInteger(size) || size < 2 || size > 512) {
      throw new RangeError('size must be an integer between 2 and 512.');
    }
    if (!Number.isInteger(q) || q < 2 || q > 256) {
      throw new RangeError('q must be an integer between 2 and 256.');
    }
    if (typeof random !== 'function') throw new TypeError('random must be a function.');
    this.size = size;
    this.q = q;
    this.random = random; // Supply a function returning uniform numbers in [0, 1).
    this.cells = new Uint8Array(size * size);
    this.attempts = 0;
    this.accepted = 0;
    this.criticalTemperature = 1 / Math.log(1 + Math.sqrt(q));
    this.setTemperatureRatio(temperatureRatio);
    this.randomize();
  }

  // A flat array replaces the C int**: x is the column, y is the row.
  // Wrapping coordinates makes the left/right and top/bottom edges neighbours.
  index(x, y) {
    const L = this.size;
    return ((y % L + L) % L) * L + ((x % L + L) % L);
  }

  at(x, y) {
    return this.cells[this.index(x, y)];
  }

  randomize() {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = Math.floor(this.random() * this.q);
    }
    this.attempts = 0;
    this.accepted = 0;
  }

  setTemperatureRatio(value) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError('T/Tc must be a finite, non-negative number.');
    }
    this.temperatureRatio = value;
    this.temperature = value * this.criticalTemperature;
  }

  energyDifference(x, y, proposedState) {
    const current = this.at(x, y);
    const left = this.at(x - 1, y);
    const right = this.at(x + 1, y);
    const up = this.at(x, y - 1);
    const down = this.at(x, y + 1);

    const oldMatches = Number(current === left) + Number(current === right)
      + Number(current === up) + Number(current === down);
    const newMatches = Number(proposedState === left) + Number(proposedState === right)
      + Number(proposedState === up) + Number(proposedState === down);

    // Each matching bond has energy -1. More matches means lower energy.
    // The C energycalc clips negative changes to zero; we keep the sign
    // and implement the equivalent acceptance rule explicitly below.
    return oldMatches - newMatches;
  }

  acceptanceProbability(deltaEnergy) {
    if (deltaEnergy <= 0) return 1;
    if (this.temperature === 0) return 0; // Well-defined zero-temperature limit.
    return Math.exp(-deltaEnergy / this.temperature);
  }

  attempt() {
    // One attempted update, not one full Monte Carlo sweep.
    const x = Math.floor(this.random() * this.size);
    const y = Math.floor(this.random() * this.size);
    const index = this.index(x, y);
    const current = this.cells[index];

    // This proposes any OTHER state uniformly, just like the C while loop.
    // Neighbours determine the energy; they do not restrict the proposal.
    let proposed;
    do {
      proposed = Math.floor(this.random() * this.q);
    } while (proposed === current);

    const deltaEnergy = this.energyDifference(x, y, proposed);
    // Short-circuiting also preserves the C rule of drawing an acceptance
    // random number only for uphill proposals.
    const accept = deltaEnergy <= 0
      || this.random() < this.acceptanceProbability(deltaEnergy);

    if (accept) {
      this.cells[index] = proposed;
      this.accepted++;
    }
    this.attempts++;
    return accept;
  }

  advance(numberOfAttempts) {
    if (!Number.isSafeInteger(numberOfAttempts) || numberOfAttempts < 0) {
      throw new RangeError('advance() needs a non-negative integer.');
    }
    for (let i = 0; i < numberOfAttempts; i++) this.attempt();
  }

  get sweeps() {
    // A site is selected with replacement: a sweep is L² attempts,
    // not a guarantee that every site has been visited exactly once.
    return this.attempts / this.cells.length;
  }

  energyPerSite() {
    // Count each bond once (right and down), useful for experiments/tests.
    let energy = 0;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const spin = this.at(x, y);
        if (spin === this.at(x + 1, y)) energy--;
        if (spin === this.at(x, y + 1)) energy--;
      }
    }
    return energy / this.cells.length;
  }
}
