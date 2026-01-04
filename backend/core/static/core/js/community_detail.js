(function () {
  function domReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function getCookie(name) {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    for (let i = 0; i < cookies.length; i++) {
      const c = cookies[i].trim();
      if (c.startsWith(name + '=')) return decodeURIComponent(c.substring(name.length + 1));
    }
    return '';
  }

  function renderMemberCard(m) {
    const badge = `<span class="badge text-bg-light border">${m.role_label || m.role || ''}</span>`;
    const avatarLetter = (m.display_name || m.username || '?')[0].toUpperCase();
    const avatar = m.avatar_url
      ? `<span class="avatar avatar--sm"><img src="${m.avatar_url}" alt="${m.display_name}"></span>`
      : `<span class="avatar avatar--sm"><span class="avatar-initial">${avatarLetter}</span></span>`;
    return `<div class="community-member" data-member-item>
      <div class="d-flex align-items-center gap-2">
        <div class="avatar-stack">${avatar}</div>
        <div class="flex-grow-1 min-w-0">
          <div class="d-flex align-items-center gap-2">
            <span class="fw-semibold text-truncate">${m.display_name || m.username}</span>
            ${badge}
          </div>
          <div class="small text-secondary text-truncate">@${m.username}</div>
        </div>
      </div>
    </div>`;
  }

  function renderJoinRequest(item, approveUrl, denyUrl) {
    const avatarLetter = (item.display_name || item.username || '?')[0].toUpperCase();
    const avatar = item.avatar_url
      ? `<span class="avatar avatar--sm"><img src="${item.avatar_url}" alt="${item.display_name}"></span>`
      : `<span class="avatar avatar--sm"><span class="avatar-initial">${avatarLetter}</span></span>`;
    return `<div class="d-flex align-items-center gap-2" data-request-id="${item.id}">
      ${avatar}
      <div class="flex-grow-1 min-w-0">
        <div class="fw-semibold text-truncate">${item.display_name || item.username}</div>
        <div class="small text-secondary">@${item.username}</div>
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-success btn-sm" data-approve="${approveUrl.replace('/0/', '/' + item.id + '/')}">Принять</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-deny="${denyUrl.replace('/0/', '/' + item.id + '/')}">Отклонить</button>
      </div>
    </div>`;
  }

  function renderModeratorRequest(item, actionUrl) {
    const avatarLetter = (item.display_name || item.username || '?')[0].toUpperCase();
    const avatar = item.avatar_url
      ? `<span class="avatar avatar--sm"><img src="${item.avatar_url}" alt="${item.display_name}"></span>`
      : `<span class="avatar avatar--sm"><span class="avatar-initial">${avatarLetter}</span></span>`;
    const approveUrl = actionUrl.replace('/0/', '/' + item.id + '/');
    const denyUrl = approveUrl.replace('/approve/', '/deny/');
    return `<div class="d-flex align-items-center gap-2" data-mod-request-id="${item.id}">
      ${avatar}
      <div class="flex-grow-1 min-w-0">
        <div class="fw-semibold text-truncate">${item.display_name || item.username}</div>
        <div class="small text-secondary">@${item.username}</div>
      </div>
      <div class="d-flex gap-2">
        <button type="button" class="btn btn-success btn-sm" data-mod-approve="${approveUrl}">Назначить</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-mod-deny="${denyUrl}">Отклонить</button>
      </div>
    </div>`;
  }

  domReady(function () {
    const page = document.getElementById('communityPage');
    if (!page) return;

    const membersApi = page.dataset.membersApi;
    const joinUrl = page.dataset.joinUrl;
    const leaveUrl = page.dataset.leaveUrl;
    const settingsUrl = page.dataset.settingsUrl;
    const joinRequestsUrl = page.dataset.joinRequestsUrl;
    const moderatorRequestUrl = page.dataset.moderatorRequestUrl;
    const moderatorRequestsUrl = page.dataset.moderatorRequestsUrl;
    const moderatorActionUrl = page.dataset.moderatorActionUrl;
    const membersCountEl = document.getElementById('communityMembersCount');
    const shareButtons = document.querySelectorAll('[data-share-trigger]');
    const moderatorRequestBtn = document.querySelector('[data-moderator-request]');

    shareButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const payload = { url: window.location.href, title: document.title };
        if (navigator.share) {
          try {
            await navigator.share(payload);
          } catch (err) {
            // ignore
          }
          return;
        }
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(window.location.href);
            btn.textContent = 'Ссылка скопирована';
            setTimeout(() => (btn.textContent = 'Поделиться'), 2000);
          } catch (err) {
            console.error(err);
          }
        }
      });
    });

    if (moderatorRequestBtn && moderatorRequestUrl) {
      moderatorRequestBtn.addEventListener('click', async () => {
        moderatorRequestBtn.disabled = true;
        try {
          const resp = await fetch(moderatorRequestUrl, {
            method: 'POST',
            headers: {
              'X-CSRFToken': getCookie('csrftoken'),
              'X-Requested-With': 'XMLHttpRequest',
            },
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data.status === 'pending') {
            moderatorRequestBtn.textContent = 'Заявка отправлена';
          } else {
            moderatorRequestBtn.disabled = false;
          }
        } catch (err) {
          moderatorRequestBtn.disabled = false;
        }
      });
    }

    function updateCounts(count) {
      if (membersCountEl) membersCountEl.textContent = count;
      const totalEl = document.getElementById('participantsTotal');
      if (totalEl) totalEl.textContent = count;
      document.querySelectorAll('[data-preview-members]').forEach((el) => {
        el.textContent = `${count} участников`;
      });
      document.querySelectorAll('[data-preview-members-count]').forEach((el) => {
        el.textContent = count;
      });
    }

    // Membership (join/leave) fetch
    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('form.community-membership-form');
      if (!form) return;
      e.preventDefault();
      const action = form.dataset.action;
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const resp = await fetch(action === 'leave' ? leaveUrl : joinUrl, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRFToken': getCookie('csrftoken'),
          },
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error('failed');
        if (typeof data.members === 'number') updateCounts(data.members);
        if (action === 'join' && data.status === 'pending') {
          if (submitBtn) {
            submitBtn.textContent = 'Запрос отправлен';
            submitBtn.disabled = true;
          }
          form.action = joinUrl;
        } else if (action === 'join') {
          form.innerHTML = '<button type="submit" class="btn btn-outline-secondary">Выйти</button>';
          form.dataset.action = 'leave';
          form.action = leaveUrl;
        } else {
          form.innerHTML = '<button type="submit" class="btn btn-primary">Присоединиться</button>';
          form.dataset.action = 'join';
          form.action = joinUrl;
        }
      } catch (err) {
        if (submitBtn) submitBtn.disabled = false;
      }
    });

    // Participants modal
    const participantsModal = document.getElementById('participantsModal');
    const participantsList = document.getElementById('participantsList');
    const participantsSearch = document.getElementById('participantsSearch');
    const participantsLoadMore = document.getElementById('participantsLoadMore');
    const participantsEmpty = document.getElementById('participantsEmpty');
    const participantsError = document.getElementById('participantsError');

    let membersPage = 1;
    let membersQuery = '';
    let membersController = null;

    function setParticipantsState({ empty = false, error = false }) {
      if (participantsEmpty) participantsEmpty.classList.toggle('d-none', !empty);
      if (participantsError) participantsError.classList.toggle('d-none', !error);
    }

    async function fetchMembers(pageNumber, append = false) {
      if (!membersApi) return;
      if (membersController) membersController.abort();
      membersController = new AbortController();
      const params = new URLSearchParams({ page: String(pageNumber) });
      if (membersQuery) params.append('q', membersQuery);
      participantsLoadMore && (participantsLoadMore.disabled = true);
      try {
        const resp = await fetch(`${membersApi}?${params.toString()}`, { signal: membersController.signal });
        if (!resp.ok) throw new Error('failed');
        const data = await resp.json();
        const html = data.results.map(renderMemberCard).join('');
        if (!append) participantsList.innerHTML = '';
        participantsList.insertAdjacentHTML('beforeend', html);
        setParticipantsState({ empty: data.results.length === 0 && (!append || participantsList.children.length === 0), error: false });
        membersPage = data.page;
        if (participantsLoadMore) {
          participantsLoadMore.classList.toggle('d-none', !data.has_next);
          participantsLoadMore.dataset.nextPage = data.page + 1;
          participantsLoadMore.disabled = !data.has_next;
        }
        if (typeof data.total === 'number') updateCounts(data.total);
      } catch (err) {
        if (err.name === 'AbortError') return;
        setParticipantsState({ error: true });
      }
    }

    if (participantsModal) {
      participantsModal.addEventListener('shown.bs.modal', () => {
        membersPage = 1;
        fetchMembers(1, false);
        if (participantsSearch) participantsSearch.focus();
      });
    }

    if (participantsSearch) {
      let debounceTimer;
      participantsSearch.addEventListener('input', () => {
        const value = participantsSearch.value.trim();
        membersQuery = value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => fetchMembers(1, false), 300);
      });
    }

    if (participantsLoadMore) {
      participantsLoadMore.addEventListener('click', () => {
        const next = Number(participantsLoadMore.dataset.nextPage || '2');
        fetchMembers(next, true);
      });
    }

    // Appearance live preview
    const appearancePreview = document.getElementById('communityAppearancePreview');
    if (appearancePreview) {
      const nameInput = document.getElementById('communityNameInput');
      const descriptionInput = document.getElementById('communityDescriptionInput');
      const accentInput = document.getElementById('communityAccentInput');
      const avatarVisual = appearancePreview.querySelector('.appearance-preview__avatar-visual');
      const cover = document.getElementById('appearanceCover');
      const nameTarget = appearancePreview.querySelector('[data-preview-name]');
      const descTarget = appearancePreview.querySelector('[data-preview-description]');
      const initialAvatar = avatarVisual?.querySelector('img')?.src || '';
      const initialCover = cover?.style.backgroundImage || '';
      const fallbackLetter = (nameInput?.value?.trim() || page.dataset.communitySlug || '?')[0].toUpperCase();

      const setAvatar = (src) => {
        if (!avatarVisual) return;
        if (src) {
          avatarVisual.innerHTML = `<img src="${src}" alt="">`;
        } else {
          avatarVisual.innerHTML = `<span>${fallbackLetter}</span>`;
        }
      };

      const setCover = (src) => {
        if (!cover) return;
        cover.style.backgroundImage = src ? `url('${src}')` : initialCover;
      };

      const updateText = () => {
        if (nameTarget && nameInput) nameTarget.textContent = nameInput.value || 'Сообщество';
        if (descTarget && descriptionInput) descTarget.textContent = descriptionInput.value.trim() || 'Добавьте описание';
      };

      const updateAccent = () => {
        if (!appearancePreview || !accentInput) return;
        appearancePreview.style.setProperty('--accent-color', accentInput.value || '#3366ff');
      };

      const handleFilePreview = (input) => {
        if (!input?.files?.length) {
          const type = input?.dataset.previewType;
          if (type === 'icon') setAvatar(initialAvatar);
          if (type === 'cover') setCover(initialCover.replace(/^url\(['"]?(.+?)['"]?\)$/i, '$1'));
          return;
        }
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result;
          if (input.dataset.previewType === 'icon') setAvatar(String(result));
          if (input.dataset.previewType === 'cover') setCover(String(result));
        };
        reader.readAsDataURL(file);
      };

      nameInput?.addEventListener('input', updateText);
      descriptionInput?.addEventListener('input', updateText);
      accentInput?.addEventListener('input', updateAccent);
      document.querySelectorAll('input[data-preview-type]').forEach((input) => {
        input.addEventListener('change', () => handleFilePreview(input));
      });
      document.querySelectorAll('[data-file-trigger]').forEach((btn) => {
        const targetId = btn.dataset.fileTrigger;
        if (!targetId) return;
        const input = document.getElementById(targetId);
        if (!input) return;
        btn.addEventListener('click', () => input.click());
      });
      updateText();
      updateAccent();
    }

    // Settings form
    const settingsForm = document.getElementById('communitySettingsForm');
    if (settingsForm && settingsUrl) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = settingsForm.querySelector('#communitySettingsSave');
        if (saveBtn) saveBtn.disabled = true;
        const formData = new FormData(settingsForm);
        try {
          const resp = await fetch(settingsUrl, {
            method: 'POST',
            headers: { 'X-CSRFToken': getCookie('csrftoken') },
            body: formData,
          });
          if (!resp.ok) throw new Error('fail');
        } catch (err) {
          console.error(err);
        } finally {
          if (saveBtn) saveBtn.disabled = false;
        }
      });
    }

    // Staff role updates and permissions
    const staffList = document.getElementById('staffList');
    const collectPermissions = (item) => {
      const perms = {};
      item.querySelectorAll('.staff-permission').forEach((input) => {
        perms[input.value] = input.checked;
      });
      return perms;
    };

    const updateStaff = async (item, trigger) => {
      if (!staffList) return;
      const userId = item?.dataset.userId;
      const baseUrl = staffList.dataset.roleUrl;
      if (!userId || !baseUrl) return;
      const url = baseUrl.replace('/0/', '/' + userId + '/');
      trigger && (trigger.disabled = true);
      const roleSelect = item.querySelector('.staff-role-select');
      const body = new URLSearchParams();
      if (roleSelect) body.append('role', roleSelect.value);
      body.append('permissions', JSON.stringify(collectPermissions(item)));
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'X-CSRFToken': getCookie('csrftoken'),
            'X-Requested-With': 'XMLHttpRequest',
          },
          body,
        });
      } catch (err) {
        console.error(err);
      } finally {
        trigger && (trigger.disabled = false);
      }
    };

    if (staffList) {
      staffList.addEventListener('change', (e) => {
        const select = e.target.closest('.staff-role-select, .staff-permission');
        if (!select) return;
        const item = select.closest('.staff-item');
        if (!item) return;
        updateStaff(item, select);
      });

      staffList.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.staff-remove');
        if (!removeBtn) return;
        const item = removeBtn.closest('.staff-item');
        if (!item) return;
        const userId = item.dataset.userId;
        const baseUrl = staffList.dataset.removeUrl;
        if (!userId || !baseUrl) return;
        const url = baseUrl.replace('/0/', '/' + userId + '/');
        removeBtn.disabled = true;
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'X-CSRFToken': getCookie('csrftoken'),
              'X-Requested-With': 'XMLHttpRequest',
            },
          });
          const data = await resp.json();
          if (resp.ok) {
            item.remove();
            if (typeof data.members === 'number') updateCounts(data.members);
          }
        } catch (err) {
          console.error(err);
        }
      });
    }

    // Join requests
    const joinRequestsList = document.getElementById('joinRequestsList');
    const loadJoinRequestsBtn = document.getElementById('loadJoinRequests');
    const moderatorRequestsList = document.getElementById('moderatorRequestsList');
    const loadModeratorRequestsBtn = document.getElementById('loadModeratorRequests');
    function attachJoinActions() {
      if (!joinRequestsList) return;
      joinRequestsList.querySelectorAll('button[data-approve],button[data-deny]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const url = btn.dataset.approve || btn.dataset.deny;
          if (!url) return;
          btn.disabled = true;
          try {
            await fetch(url, {
              method: 'POST',
              headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest',
              },
            });
            btn.closest('[data-request-id]')?.remove();
          } catch (err) {
            console.error(err);
          }
        });
      });
    }

    async function loadJoinRequests() {
      if (!joinRequestsUrl || !joinRequestsList) return;
      joinRequestsList.innerHTML = '<div class="text-body-secondary">Загрузка...</div>';
      try {
        const resp = await fetch(joinRequestsUrl);
        if (!resp.ok) throw new Error('fail');
        const data = await resp.json();
        if (!data.results || !data.results.length) {
          joinRequestsList.innerHTML = '<div class="text-body-secondary">Нет активных заявок</div>';
          return;
        }
        const approveUrl = joinRequestsList.dataset.approveUrl;
        const denyUrl = joinRequestsList.dataset.denyUrl;
        joinRequestsList.innerHTML = data.results.map((r) => renderJoinRequest(r, approveUrl, denyUrl)).join('');
        attachJoinActions();
      } catch (err) {
        joinRequestsList.innerHTML = '<div class="text-danger">Не удалось загрузить заявки</div>';
      }
    }

    if (loadJoinRequestsBtn) {
      loadJoinRequestsBtn.addEventListener('click', loadJoinRequests);
    }

    function attachModeratorActions() {
      if (!moderatorRequestsList) return;
      moderatorRequestsList.querySelectorAll('button[data-mod-approve],button[data-mod-deny]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const url = btn.dataset.modApprove || btn.dataset.modDeny;
          if (!url) return;
          btn.disabled = true;
          try {
            const resp = await fetch(url, {
              method: 'POST',
              headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest',
              },
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok) {
              btn.closest('[data-mod-request-id]')?.remove();
              if (typeof data.members === 'number') updateCounts(data.members);
            }
          } catch (err) {
            console.error(err);
          }
        });
      });
    }

    async function loadModeratorRequests() {
      if (!moderatorRequestsUrl || !moderatorRequestsList) return;
      moderatorRequestsList.innerHTML = '<div class="text-body-secondary">Загрузка...</div>';
      try {
        const resp = await fetch(moderatorRequestsUrl);
        if (!resp.ok) throw new Error('fail');
        const data = await resp.json();
        if (!data.results || !data.results.length) {
          moderatorRequestsList.innerHTML = '<div class="text-body-secondary">Нет активных заявок</div>';
          return;
        }
        const baseAction = moderatorRequestsList.dataset.actionUrl || '';
        moderatorRequestsList.innerHTML = data.results.map((item) => renderModeratorRequest(item, baseAction)).join('');
        attachModeratorActions();
      } catch (err) {
        moderatorRequestsList.innerHTML = '<div class="text-danger">Не удалось загрузить заявки</div>';
      }
    }

    if (loadModeratorRequestsBtn) {
      loadModeratorRequestsBtn.addEventListener('click', loadModeratorRequests);
    }

    // Delete community (owner only)
    const deleteForm = document.getElementById('communityDeleteForm');
    if (deleteForm) {
      const deleteBtn = deleteForm.querySelector('[data-delete-community]');
      deleteForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!confirm('Удалить сообщество без возможности восстановления?')) return;
        deleteBtn && (deleteBtn.disabled = true);
        const formData = new FormData(deleteForm);
        try {
          const resp = await fetch(deleteForm.action, {
            method: 'POST',
            headers: {
              'X-CSRFToken': getCookie('csrftoken'),
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: formData,
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok) {
            window.location.href = data.redirect || '/communities/';
            return;
          }
        } catch (err) {
          console.error(err);
        } finally {
          deleteBtn && (deleteBtn.disabled = false);
        }
      });
    }
  });
})();
