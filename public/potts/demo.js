// The preview's example essay floats above the lattice in a native dialog.
// A dialog handles focus trapping and Escape; real blog posts stay in Markdown.
const reader = document.querySelector('[data-reader]');
const openButton = document.querySelector('[data-open-reader]');
const closeButton = document.querySelector('[data-close-reader]');

openButton.addEventListener('click', () => reader.showModal());
closeButton.addEventListener('click', () => reader.close());
