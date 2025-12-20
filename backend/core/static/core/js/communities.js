/* communities.js — AJAX join/leave without page reload */
(function () {
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
  }

  async function handleMembershipSubmit(e) {
    const form = e.target.closest('.js-community-membership');
    if (!form) return;

    e.preventDefault();
    e.stopPropagation();

    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;

    // If already "member" and disabled, do nothing.
    if (btn.disabled) return;

    const action = form.getAttribute('action');
    const method = (form.getAttribute('method') || 'post').toUpperCase();

    const formData = new FormData(form);

    btn.disabled = true;
    const prevText = btn.textContent;
    btn.textContent = '...';

    try {
      const resp = await fetch(action, {
        method,
        body: formData,
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRFToken': getCookie('csrftoken') || ''
        },
        redirect: 'follow'
      });

      if (!resp.ok) throw new Error('Request failed');

      // Success: convert button to "Вы подписаны" without navigating.
      btn.textContent = 'Вы подписаны';
      btn.classList.remove('btn-outline-secondary');
      btn.classList.add('btn-success');
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');

      // Also prevent accidental card click in any case.
      return;
    } catch (err) {
      console.error('[communities] membership ajax error:', err);
      btn.disabled = false;
      btn.textContent = prevText;
      alert('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
  }

  document.addEventListener('submit', function (e) {
    if (e.target && e.target.closest('.js-community-membership')) {
      handleMembershipSubmit(e);
    }
  }, true);

  // If button is inside other clickable areas, stop clicks.
  document.addEventListener('click', function (e) {
    const el = e.target.closest('.js-community-membership button, .js-community-membership');
    if (el) {
      e.stopPropagation();
    }
  }, true);
})();
