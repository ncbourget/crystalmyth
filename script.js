const pages = document.querySelectorAll('.page');
const zoom = document.querySelector('#zoom');
const basket = document.querySelector('#basket');
const checkout = {};

function turnPage() {
  let name = location.hash.slice(1) || 'home';
  if (name === 'projects') name = 'projects-1';
  if (!document.getElementById(name)?.classList.contains('page')) name = 'home';
  pages.forEach(page => { page.hidden = page.id !== name; });
  document.querySelectorAll('nav a').forEach(link => {
    if (link.hash === '#' + name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.title = name === 'home' ? 'Crystal Myth' : name.replaceAll('-', ' ') + ' — Crystal Myth';
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', turnPage);
turnPage();

document.querySelector('#cart-link').addEventListener('click', () => basket.showModal());
document.querySelectorAll('dialog .close').forEach(button => {
  button.addEventListener('click', () => button.closest('dialog').close());
});
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
  });
});
document.querySelectorAll('.enlarge').forEach(button => {
  button.addEventListener('click', () => {
    zoom.querySelector('img').src = button.querySelector('img').src;
    zoom.querySelector('img').alt = button.querySelector('img').alt;
    zoom.showModal();
  });
});
document.querySelectorAll('.slideshow').forEach(show => {
  const photos = show.querySelectorAll('.picture');
  let photo = 0;
  const controls = document.createElement('div');
  controls.className = 'slide-controls';
  controls.innerHTML = '<button aria-label="Previous photo">←</button><span aria-live="polite">1 / ' + photos.length + '</span><button aria-label="Next photo">→</button>';
  show.append(controls);
  controls.querySelectorAll('button').forEach((button, side) => {
    button.addEventListener('click', () => {
      photo = (photo + (side ? 1 : -1) + photos.length) % photos.length;
      photos.forEach((picture, number) => { picture.style.display = number === photo ? 'block' : 'none'; });
      controls.querySelector('span').textContent = (photo + 1) + ' / ' + photos.length;
    });
  });
});
document.querySelectorAll('.buy').forEach(box => {
  const shirt = box.closest('.page').id;
  const link = document.createElement('a');
  link.href = checkout[shirt] || 'https://www.instagram.com/crystalmyth.xyz';
  link.textContent = checkout[shirt] ? 'Buy this shirt' : 'Ask about this shirt ↗';
  box.append(link);
  const back = document.createElement('a');
  back.href = '#home';
  back.className = 'back';
  back.textContent = '← Shop';
  box.closest('.page').prepend(back);
});
