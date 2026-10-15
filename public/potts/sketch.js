import { PottsModel } from './potts-model.js';

// Same p5 setup()/draw() pattern as The Nature of Code, in instance mode:
// p.createCanvas(), p.image(), etc. belong to THIS sketch only.
// Keep the original L=128. The viewport shows a crop; the model stays square.
const SIZE = 128;
const SEED = 23410981 + 317;

// A state is a colour label, not a signed spin direction.
// First two colours are deliberately high-contrast for q=2.
const COLOURS = [
  [234, 51, 238], [117, 251, 151], [140, 26, 245], [83, 182, 246],
  [191, 161, 190], [224, 172, 74], [99, 124, 165], [240, 229, 205],
  [113, 76, 88], [70, 114, 103]
];

export function mountPotts(root) {
  const stage = root.querySelector('[data-potts-stage]');
  const qControl = root.querySelector('[data-potts-q]');
  const temperatureControl = root.querySelector('[data-potts-temperature]');
  const temperatureOutput = root.querySelector('[data-potts-temperature-value]');
  const speedControl = root.querySelector('[data-potts-speed]');
  const pauseButton = root.querySelector('[data-potts-pause]');
  const restartButton = root.querySelector('[data-potts-restart]');
  const sweepsOutput = root.querySelector('[data-potts-sweeps]');
  const status = root.querySelector('[data-potts-status]');
  const legend = root.querySelector('[data-potts-legend]');
  const dock = root.querySelector('[data-potts-dock]');
  const toggleButton = root.querySelector('[data-potts-toggle]');
  const controlsBody = root.querySelector('[data-potts-body]');

  if (!stage || !qControl || !temperatureControl || !speedControl) {
    throw new Error('The Potts component is missing its stage or controls.');
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.body.classList.add('potts-page');
  let running = !reducedMotion.matches;
  let ready = false;
  let model;
  let bitmap;
  let attemptBudget = 0;
  let lastStatusTime = 0;
  const listeners = new AbortController();
  const options = { signal: listeners.signal };

  const instance = new window.p5(p => {
    function updateLegend() {
      legend.replaceChildren(...COLOURS.slice(0, model.q).map((rgb, index) => {
        const item = document.createElement('span');
        const swatch = document.createElement('span');
        swatch.className = 'potts-swatch';
        swatch.style.backgroundColor = `rgb(${rgb.join(',')})`;
        item.append(swatch, document.createTextNode(String(index)));
        return item;
      }));
    }

    function restart() {
      p.randomSeed(SEED);
      model = new PottsModel({
        size: SIZE,
        q: Number(qControl.value),
        temperatureRatio: Number(temperatureControl.value),
        random: () => p.random()
      });
      attemptBudget = 0;
      updateLegend();
      updateLabels();
      status.textContent = `Restarted with ${model.q} states at T/Tc = ${model.temperatureRatio.toFixed(2)}.`;
      p.redraw();
    }

    function updateLabels() {
      temperatureOutput.textContent = model.temperatureRatio.toFixed(2);
      temperatureControl.setAttribute('aria-valuetext', `${model.temperatureRatio.toFixed(2)} times the critical temperature`);
      sweepsOutput.textContent = model.sweeps.toFixed(1);
      pauseButton.textContent = running ? 'Pause' : 'Play';
      pauseButton.setAttribute('aria-label', running ? 'Pause simulation' : 'Play simulation');
    }

    function syncAnimation() {
      if (!ready) return;
      if (running && !document.hidden) p.loop();
      else p.noLoop();
      updateLabels();
    }

    function paint() {
      // One image pixel per site. Like background-size: cover, this fills any
      // viewport without stretching cells or changing the underlying model.
      // No rect() call per lattice site is needed on every animation frame.
      bitmap.loadPixels();
      for (let i = 0; i < model.cells.length; i++) {
        const colour = COLOURS[model.cells[i]];
        bitmap.pixels[4 * i] = colour[0];
        bitmap.pixels[4 * i + 1] = colour[1];
        bitmap.pixels[4 * i + 2] = colour[2];
        bitmap.pixels[4 * i + 3] = 255;
      }
      bitmap.updatePixels();
      const side = Math.max(p.width, p.height);
      p.image(bitmap, (p.width - side) / 2, (p.height - side) / 2, side, side);
    }

    p.setup = () => {
      p.pixelDensity(1);
      const canvas = p.createCanvas(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
      canvas.parent(stage);
      canvas.elt.addEventListener('pointerdown', event => {
        if (!ready || event.button !== 0) return;

        const rect = canvas.elt.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        // Convert the pointer position into canvas coordinates.
        const px = (event.clientX - rect.left) * p.width / rect.width;
        const py = (event.clientY - rect.top) * p.height / rect.height;

        // Undo the centred crop used by paint().
        const side = Math.max(p.width, p.height);
        const left = (p.width - side) / 2;
        const top = (p.height - side) / 2;
        const x = Math.floor((px - left) * model.size / side);
        const y = Math.floor((py - top) * model.size / side);

        if (x < 0 || x >= model.size || y < 0 || y >= model.size) return;

        model.cells[model.index(x, y)] = 1;
        paint(); // Show the change immediately, even while paused.
        status.textContent = `Set site (${x}, ${y}) to state 1.`;
      }, options);
      canvas.elt.setAttribute('role', 'img');
      canvas.elt.setAttribute('aria-label', 'Evolving Potts lattice. Each colour is a spin state; neighbouring sites tend to form domains.');
      p.noSmooth();
      p.frameRate(30);
      bitmap = p.createImage(SIZE, SIZE);
      restart();
      ready = true;
      syncAnimation();
      paint();
    };

    p.draw = () => {
      if (!ready) return;
      if (running && !document.hidden) {
        // Speed is in sweeps per second, independent of display refresh rate.
        // Cap catch-up time after a hidden/stalled tab: never run a huge backlog.
        const elapsedSeconds = Math.min(p.deltaTime, 100) / 1000;
        attemptBudget += Number(speedControl.value) * model.cells.length * elapsedSeconds;
        const attempts = Math.floor(attemptBudget);
        model.advance(attempts);
        attemptBudget -= attempts;
      }
      paint();
      if (p.millis() - lastStatusTime > 200) {
        updateLabels();
        lastStatusTime = p.millis();
      }
    };

    pauseButton.addEventListener('click', () => {
      running = !running;
      syncAnimation();
      status.textContent = running ? 'Simulation playing.' : 'Simulation paused.';
    }, options);
    restartButton.addEventListener('click', restart, options);
    qControl.addEventListener('change', restart, options);
    temperatureControl.addEventListener('input', () => {
      if (!model) return;
      model.setTemperatureRatio(Number(temperatureControl.value));
      updateLabels();
    }, options);
    temperatureControl.addEventListener('change', () => {
      status.textContent = `Temperature set to ${model.temperatureRatio.toFixed(2)} times Tc.`;
    }, options);
    document.addEventListener('visibilitychange', syncAnimation, options);
    reducedMotion.addEventListener('change', event => {
      if (event.matches) { running = false; syncAnimation(); }
    }, options);
    toggleButton.addEventListener('click', () => {
      const expanded = toggleButton.getAttribute('aria-expanded') !== 'true';
      toggleButton.setAttribute('aria-expanded', String(expanded));
      toggleButton.setAttribute('aria-label', expanded ? 'Hide controls' : 'Show controls');
      toggleButton.textContent = expanded ? 'Hide' : 'Controls';
      controlsBody.hidden = !expanded;
    }, options);

    const resizeObserver = new ResizeObserver(() => {
      if (!ready) return;
      p.resizeCanvas(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight), true);
      // Resizing only changes the drawing, never the lattice or its history.
      paint();
    });
    resizeObserver.observe(stage);

    // Leave enough scroll space below blog content for the floating dock.
    // Observe the actual height, including mobile wrapping and collapse.
    const dockObserver = new ResizeObserver(() => {
      document.body.style.setProperty('--potts-dock-height', `${dock.offsetHeight}px`);
    });
    dockObserver.observe(dock);

    const originalRemove = p.remove.bind(p);
    p.remove = () => {
      listeners.abort();
      resizeObserver.disconnect();
      dockObserver.disconnect();
      document.body.classList.remove('potts-page');
      document.body.style.removeProperty('--potts-dock-height');
      originalRemove();
    };
  }, stage);

  return instance;
}

// Include one component per page: its canvas and dock fill the viewport.
for (const root of document.querySelectorAll('[data-potts]')) {
  if (window.p5) mountPotts(root);
  else root.querySelector('[data-potts-status]').textContent = 'The simulation could not load. Please refresh the page.';
}
