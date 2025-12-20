// Community detail page helpers (admin edit toggle + icon preview)
(function () {
  function domReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function autosize(textarea) {
    if (!textarea) return;
    const resize = function () {
      textarea.style.height = 'auto';
      textarea.style.height = (textarea.scrollHeight + 2) + 'px';
    };
    textarea.addEventListener('input', resize);
    resize();
  }

  domReady(function () {
    const toggleBtn = document.getElementById('community-edit-toggle');
    const cancelBtn = document.getElementById('community-edit-cancel');

    // Support both new and legacy ids (some builds used *-block)
    const editBlock = document.getElementById('community-edit') || document.getElementById('community-edit-block');
    const viewBlock = document.getElementById('community-view') || document.getElementById('community-view-block');

    const overlay = document.getElementById('communityAvatarOverlay') || document.querySelector('.community-avatar-overlay');
    const iconInput = document.getElementById('id_icon') || document.querySelector('input[name="icon"]');

    const avatarBox = document.querySelector('.community-avatar');
    const originalAvatar = {
      hasImg: false,
      src: null,
    };

    if (avatarBox) {
      const img = avatarBox.querySelector('img');
      originalAvatar.hasImg = !!img;
      originalAvatar.src = img ? img.getAttribute('src') : null;
    }

    function setEditing(isEditing) {
      if (!toggleBtn || !editBlock || !viewBlock) return;

      editBlock.classList.toggle('d-none', !isEditing);
      viewBlock.classList.toggle('d-none', isEditing);
      toggleBtn.setAttribute('aria-expanded', isEditing ? 'true' : 'false');
      document.body.classList.toggle('community-is-editing', isEditing);
      if (overlay) overlay.classList.toggle('d-none', !isEditing);

      if (isEditing) {
        const ta = editBlock.querySelector('textarea[name="description"]');
        autosize(ta);
        if (ta) ta.focus();
      }
    }

    if (toggleBtn && editBlock && viewBlock) {
      toggleBtn.addEventListener('click', function () {
        const isOpen = !editBlock.classList.contains('d-none');
        setEditing(!isOpen);
      });
    }

    function setAvatarPreview(dataUrl) {
      if (!avatarBox) return;

      let img = avatarBox.querySelector('img');
      const fallback = avatarBox.querySelector('.community-avatar-fallback');
      const overlayLabel = avatarBox.querySelector('.community-avatar-overlay');

      if (!img) {
        img = document.createElement('img');
        img.alt = 'community icon';
        if (overlayLabel) {
          avatarBox.insertBefore(img, overlayLabel);
        } else {
          avatarBox.appendChild(img);
        }
      }

      img.src = dataUrl;
      img.style.display = 'block';
      if (fallback) fallback.style.display = 'none';
    }

    function restoreAvatar() {
      if (!avatarBox) return;

      const img = avatarBox.querySelector('img');
      const fallback = avatarBox.querySelector('.community-avatar-fallback');

      if (originalAvatar.hasImg && originalAvatar.src) {
        if (img) {
          img.src = originalAvatar.src;
          img.style.display = 'block';
        }
        // если был файл-иконки, fallback в шаблоне отсутствует
      } else {
        if (img) img.remove();
        if (fallback) fallback.style.display = '';
      }
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        setEditing(false);
        if (iconInput) iconInput.value = '';
        restoreAvatar();
      });
    }

    if (iconInput) {
      iconInput.addEventListener('change', function () {
        const file = this.files && this.files[0];
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = function (e) {
          setAvatarPreview(e.target.result);
        };
        reader.readAsDataURL(file);
      });
    }

    // If edit panel is visible on load (e.g. browser kept state), keep textarea correct
    if (editBlock && !editBlock.classList.contains('d-none')) {
      const ta = editBlock.querySelector('textarea[name="description"]');
      autosize(ta);
    }
  });
})();
