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
    const avatar = m.avatar_url
      ? `<img src="${m.avatar_url}" alt="${m.display_name}" class="avatar avatar-sm">`
      : `<div class="avatar avatar-sm avatar-fallback">${(m.display_name || m.username || '?')[0].toUpperCase()}</div>`;
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
    const avatar = item.avatar_url
      ? `<img src="${item.avatar_url}" alt="${item.display_name}" class="avatar avatar-sm">`
      : `<div class="avatar avatar-sm avatar-fallback">${(item.display_name || item.username || '?')[0].toUpperCase()}</div>`;
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

  domReady(function () {
    const page = document.getElementById('communityPage');
    if (!page) return;

    const membersApi = page.dataset.membersApi;
    const joinUrl = page.dataset.joinUrl;
    const leaveUrl = page.dataset.leaveUrl;
    const settingsUrl = page.dataset.settingsUrl;
    const joinRequestsUrl = page.dataset.joinRequestsUrl;
    const membersCountEl = document.getElementById('communityMembersCount');
    const membersBadge = document.getElementById('membersCountBadge');

    function updateCounts(count) {
      if (membersCountEl) membersCountEl.textContent = count;
      if (membersBadge) membersBadge.textContent = count;
      const totalEl = document.getElementById('participantsTotal');
      if (totalEl) totalEl.textContent = count;
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
    const sidebarList = document.getElementById('community-members-list');
    const sidebarSearch = document.getElementById('community-members-search');
    const sidebarMore = document.getElementById('community-members-more');

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

    // Sidebar filtering (client-side) and lazy load
    function filterSidebar() {
      if (!sidebarList || !sidebarSearch) return;
      const q = sidebarSearch.value.trim().toLowerCase();
      const items = sidebarList.querySelectorAll('[data-member-item]');
      let visible = 0;
      items.forEach((el) => {
        const text = (el.dataset.search || '').toLowerCase();
        const match = !q || text.includes(q);
        el.style.display = match ? '' : 'none';
        if (match) visible += 1;
      });
      const empty = document.getElementById('community-members-empty');
      if (empty) empty.style.display = visible ? 'none' : '';
    }

    if (sidebarSearch) {
      sidebarSearch.addEventListener('input', filterSidebar);
    }

    if (sidebarMore) {
      sidebarMore.addEventListener('click', async () => {
        const url = sidebarMore.dataset.url;
        if (!url || !sidebarList) return;
        const offset = Number(sidebarList.dataset.offset || '0');
        const params = new URLSearchParams({ offset: String(offset) });
        sidebarMore.disabled = true;
        try {
          const resp = await fetch(`${url}?${params.toString()}`);
          if (!resp.ok) throw new Error('fail');
          const data = await resp.json();
          sidebarList.insertAdjacentHTML('beforeend', data.html);
          sidebarList.dataset.offset = data.next_offset;
          if (!data.has_more) sidebarMore.remove();
          filterSidebar();
          if (typeof data.total === 'number') updateCounts(data.total);
        } catch (err) {
          console.error(err);
          sidebarMore.disabled = false;
        }
      });
    }

    filterSidebar();

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

    // Staff role updates
    const staffList = document.getElementById('staffList');
    if (staffList) {
      staffList.addEventListener('change', async (e) => {
        const select = e.target.closest('.staff-role-select');
        if (!select) return;
        const item = select.closest('.staff-item');
        if (!item) return;
        const userId = item.dataset.userId;
        const baseUrl = staffList.dataset.roleUrl;
        if (!userId || !baseUrl) return;
        const url = baseUrl.replace('/0/', '/' + userId + '/');
        select.disabled = true;
        try {
          await fetch(url, {
            method: 'POST',
            headers: {
              'X-CSRFToken': getCookie('csrftoken'),
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: new URLSearchParams({ role: select.value }),
          });
        } catch (err) {
          console.error(err);
        } finally {
          select.disabled = false;
        }
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
  });
})();
