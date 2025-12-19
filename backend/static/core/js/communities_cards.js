// Communities list interactions:
// 1) Click on card (but not on controls) opens the community.
// 2) Join button uses fetch() (no full page reload) and turns into "Вы подписаны".

(function () {
  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i].trim();
      if (c.startsWith(name + '=')) return decodeURIComponent(c.substring(name.length + 1));
    }
    return '';
  }

  // Card click → open
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.community-card[data-href]');
    if (!card) return;

    // Ignore clicks on interactive elements
    if (e.target.closest('a,button,input,textarea,select,form,label,.community-actions')) return;

    const href = card.getAttribute('data-href');
    if (href) window.location.href = href;
  });

  // Join (AJAX) – event delegation for dynamically added cards
  document.addEventListener(
    'submit',
    async (e) => {
      const form = e.target.closest('form.community-membership-form');
      if (!form) return;
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '...';
      }

      try {
        const resp = await fetch(form.action, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCookie('csrftoken'),
          },
          body: new FormData(form),
        });

        if (!resp.ok) throw new Error('Request failed');

        // Replace form with a disabled "subscribed" button (no reload)
        const actions = form.closest('.community-actions') || form.parentElement;
        form.remove();
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-outline-success btn-sm';
        b.disabled = true;
        b.textContent = 'Вы подписаны';
        actions && actions.appendChild(b);
      } catch (err) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText || 'Вступить';
        }
      }
    },
    true
  );
})();
