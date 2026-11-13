(() => {
  // Owns shared browser state, navigation, and page-level data loading.
  const apiRoot = '/m01064311';
  const state = { user: null, activeView: 'landing', profileUserId: null };
  const escapeHtml = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character]
    );

  // Keep API calls same-origin so the browser session cookie accompanies each request.
  const request = async (path, options = {}) => {
    const config = { method: options.method || 'GET', credentials: 'same-origin', headers: {} };
    if (options.body instanceof FormData) {
      config.body = options.body;
    } else if (options.body !== undefined) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${apiRoot}${path}`, config);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const toast = (message, kind = '') => {
    const region = document.getElementById('toast-region');
    const item = document.createElement('div');
    item.className = `toast ${kind}`.trim();
    item.textContent = message;
    region.append(item);
    window.setTimeout(() => item.remove(), 4200);
  };

  const closeAccountMenu = () => {
    document.getElementById('account-menu-panel').classList.add('hidden');
    document.getElementById('account-menu-toggle').setAttribute('aria-expanded', 'false');
  };

  const requireUser = () => {
    if (state.user) return true;
    window.Auth.open('login');
    return false;
  };

  const showView = (name) => {
    const protectedViews = ['dashboard', 'feed', 'publish', 'messages', 'ai', 'profile'];
    if (protectedViews.includes(name) && !state.user) {
      window.Auth.open('login');
      return;
    }
    const target = document.getElementById(`view-${name}`);
    if (!target) return;
    closeAccountMenu();
    document.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view === target));
    state.activeView = name;
    document.getElementById('main-nav').classList.remove('open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'explore') {
      window.Ideas.getIdeas();
      window.AI.loadNews('news-list');
      window.AI.loadCurrency();
      window.AI.loadWeather();
      refreshRecommendations();
    } else if (name === 'people') {
      window.Social.loadPeople();
      window.Social.loadRequests();
      window.Social.loadFollowing();
      refreshRecommendations();
    } else if (name === 'feed') {
      window.Ideas.loadFeed();
    } else if (name === 'dashboard') {
      refreshDashboard();
    } else if (name === 'messages') {
      window.Messages.loadConversations();
    } else if (name === 'profile') {
      window.Social.loadProfile(state.profileUserId || state.user.id);
    } else if (name === 'funding') {
      loadFunding();
    }
  };

  const openProfilePage = (userId = state.user?.id) => {
    if (!requireUser() || !userId) return;
    state.profileUserId = userId;
    showView('profile');
  };

  const setUser = async (user) => {
    state.user = user;
    closeAccountMenu();
    document.querySelectorAll('.auth-only').forEach((item) => item.classList.toggle('hidden', !user));
    document.getElementById('login-open').classList.toggle('hidden', Boolean(user));
    document.getElementById('register-open').classList.toggle('hidden', Boolean(user));
    if (user) {
      document.getElementById('account-menu-name').textContent = user.name.split(' ')[0];
      document.querySelector('#account-menu-toggle img').src =
        user.profilePicture || '/frontend/images/default-avatar.svg';
      document
        .getElementById('account-menu-toggle')
        .setAttribute('aria-label', `Open account menu for ${user.name}`);
      document.getElementById('welcome-name').textContent = user.name.split(' ')[0];
      document.getElementById('privacy-toggle').checked = Boolean(user.private);
      document.getElementById('dashboard-stats').innerHTML = `
        <div class="stat-card"><span>People following you</span><strong>${user.followers || 0}</strong></div>
        <div class="stat-card"><span>People you follow</span><strong>${user.following || 0}</strong></div>
        <div class="stat-card"><span>Your role</span><strong>${escapeHtml(user.role || 'Builder')}</strong></div>`;
      await Promise.all([
        window.Social.loadNotifications(),
        window.Social.loadRequests(),
        window.Social.loadFollowing(),
        window.Messages.loadConversations(),
        refreshRecommendations(),
      ]);
      if (state.activeView === 'landing') showView('dashboard');
    } else {
      document.getElementById('notification-dot').classList.add('hidden');
      document.getElementById('dashboard-stats').innerHTML = '';
      if (['dashboard', 'feed', 'publish', 'messages', 'ai', 'profile'].includes(state.activeView))
        showView('landing');
    }
  };

  const refreshDashboard = async () => {
    if (!state.user) return;
    try {
      const current = await request('/login');
      state.user = current.user;
      document.getElementById('welcome-name').textContent = state.user.name.split(' ')[0];
      document.getElementById('privacy-toggle').checked = Boolean(state.user.private);
      document.getElementById('account-menu-name').textContent = state.user.name.split(' ')[0];
      document.querySelector('#account-menu-toggle img').src =
        state.user.profilePicture || '/frontend/images/default-avatar.svg';
      document
        .getElementById('account-menu-toggle')
        .setAttribute('aria-label', `Open account menu for ${state.user.name}`);
      document.getElementById('dashboard-stats').innerHTML = `
        <div class="stat-card"><span>People following you</span><strong>${state.user.followers || 0}</strong></div>
        <div class="stat-card"><span>People you follow</span><strong>${state.user.following || 0}</strong></div>
        <div class="stat-card"><span>Your role</span><strong>${escapeHtml(state.user.role || 'Builder')}</strong></div>`;
      await window.Ideas.loadDashboardIdeas();
      await window.Ideas.loadDashboardNetwork();
      await refreshRecommendations();
      await loadDashboardRequests();
      await window.AI.loadNews('dashboard-news');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const loadDashboardRequests = async () => {
    const target = document.getElementById('dashboard-requests');
    try {
      const requests = await request('/follow-requests/received');
      target.innerHTML = requests.length
        ? requests
            .slice(0, 3)
            .map(
              (item) =>
                `<div class="compact-person"><img src="${escapeHtml(item.sender?.profilePicture || '/frontend/images/default-avatar.svg')}" alt=""><div class="compact-person-info"><b>${escapeHtml(item.sender?.name || 'Member')}</b><span>wants to follow you</span></div><button class="mini-action" data-dashboard-request="${escapeHtml(item.id)}">Review</button></div>`
            )
            .join('')
        : '<p class="muted">No pending requests. Your network is up to date.</p>';
    } catch (error) {
      target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const refreshRecommendations = async () => {
    const peopleTarget = document.getElementById('people-recommendations');
    const dashboardPeopleTarget = document.getElementById('dashboard-recommended-people');
    const ideaTargets = ['dashboard-recommended-ideas', 'explore-recommended-ideas'].map((id) =>
      document.getElementById(id)
    );
    if (!state.user) {
      peopleTarget.innerHTML = '<p class="muted">Log in to get personalized recommendations.</p>';
      dashboardPeopleTarget.innerHTML = '<p class="muted">Log in to meet recommended people.</p>';
      ideaTargets.forEach((target) => {
        target.innerHTML = '<p class="muted">Log in to get personalized recommendations.</p>';
      });
      return;
    }
    peopleTarget.innerHTML = '<div class="loading-card">Finding people you may like…</div>';
    dashboardPeopleTarget.innerHTML = '<p class="muted">Finding people you may like…</p>';
    ideaTargets.forEach((target) => {
      target.innerHTML = '<div class="loading-card">Finding ideas for you…</div>';
    });
    try {
      const recommendations = await request('/recommendations');
      window.Social.renderRecommendations(recommendations.people);
      window.Ideas.renderRecommendations(recommendations.ideas);
    } catch (error) {
      [peopleTarget, dashboardPeopleTarget, ...ideaTargets].forEach((target) => {
        target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
      });
    }
  };

  const openProfileEditor = (accountMenuAction = false) => {
    if (!requireUser()) return;
    if (!accountMenuAction && state.profileUserId && state.profileUserId !== state.user.id) {
      toast('You can only edit your own profile.', 'error');
      return;
    }
    closeAccountMenu();
    const form = document.getElementById('profile-edit-form');
    form.elements.name.value = state.user.name || '';
    form.elements.role.value = state.user.role || '';
    form.elements.interests.value = (state.user.interests || []).join(', ');
    form.elements.bio.value = state.user.bio || '';
    form.elements.profilePicture.value = '';
    ['currentPassword', 'newPassword', 'confirmPassword'].forEach((field) => {
      form.elements[field].value = '';
    });
    document.getElementById('profile-edit-message').className = 'form-message hidden';
    document.getElementById('profile-edit-modal').classList.remove('hidden');
  };

  const setupProfileEditor = () => {
    document.getElementById('profile-edit-open').addEventListener('click', openProfileEditor);
    document.getElementById('profile-edit-page-button').addEventListener('click', openProfileEditor);
    document
      .getElementById('account-update-profile')
      .addEventListener('click', () => openProfileEditor(true));
    document.getElementById('profile-share-idea').addEventListener('click', () => showView('publish'));
    document.getElementById('profile-edit-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!requireUser()) return;
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      const button = form.querySelector('[type="submit"]');
      const message = document.getElementById('profile-edit-message');
      const passwordFields = ['currentPassword', 'newPassword', 'confirmPassword'];
      const passwordChangeRequested = passwordFields.some((field) => values[field]);
      if (passwordChangeRequested && !values.currentPassword) {
        message.textContent = 'Enter your current password to change it.';
        message.className = 'form-message error';
        return;
      }
      if (passwordChangeRequested && (!values.newPassword || values.newPassword.length < 8)) {
        message.textContent = 'Your new password must be at least 8 characters.';
        message.className = 'form-message error';
        return;
      }
      if (passwordChangeRequested && values.newPassword !== values.confirmPassword) {
        message.textContent = 'Your new passwords do not match.';
        message.className = 'form-message error';
        return;
      }
      button.disabled = true;
      message.className = 'form-message hidden';
      try {
        const body = {
          name: values.name,
          role: values.role,
          bio: values.bio,
          interests: values.interests
            .split(',')
            .map((interest) => interest.trim())
            .filter(Boolean),
        };
        if (passwordChangeRequested) {
          body.currentPassword = values.currentPassword;
          body.newPassword = values.newPassword;
          body.confirmPassword = values.confirmPassword;
        }
        const updated = await request('/users/me', {
          method: 'PATCH',
          body,
        });
        passwordFields.forEach((field) => {
          form.elements[field].value = '';
        });
        await setUser(updated.user);
        const picture = form.elements.profilePicture.files[0];
        if (picture) {
          const upload = new FormData();
          upload.append('file', picture);
          upload.append('folder', 'profiles');
          await request('/uploads', { method: 'POST', body: upload });
          const current = await request('/login');
          await setUser(current.user);
        }
        form.reset();
        document.getElementById('profile-edit-modal').classList.add('hidden');
        toast(
          passwordChangeRequested
            ? 'Your profile and password have been updated.'
            : 'Your profile has been updated.',
          'success'
        );
        await refreshRecommendations();
      } catch (error) {
        passwordFields.forEach((field) => {
          form.elements[field].value = '';
        });
        message.textContent = error.message;
        message.className = 'form-message error';
      } finally {
        button.disabled = false;
      }
    });
  };

  const loadFunding = async () => {
    const target = document.getElementById('funding-list');
    target.innerHTML = '<div class="loading-card">Finding opportunities…</div>';
    try {
      const items = await request('/funding');
      target.innerHTML = items.length
        ? items
            .map(
              (item) => `
        <article class="funding-card">
          <span class="funding-card-meta">${escapeHtml(item.stage)} · ${escapeHtml(item.amount)}</span>
          <h3>${escapeHtml(item.purpose)}</h3><p>${escapeHtml(item.description)}</p>
          ${item.partnersWanted ? '<span class="pill">Open to partners</span>' : ''}
          <div class="funding-card-footer"><img src="${escapeHtml(item.founder?.profilePicture || '/frontend/images/default-avatar.svg')}" alt=""><span class="muted">${escapeHtml(item.founder?.name || 'Founder')}</span><button class="button button-outline" data-funding-connect="${escapeHtml(item.id)}">Connect ↗</button></div>
        </article>`
            )
            .join('')
        : '<div class="empty-state">No funding opportunities yet. Be the first to share what you’re building.</div>';
    } catch (error) {
      target.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  };

  const handleFundingConnect = async (event) => {
    const button = event.target.closest('[data-funding-connect]');
    if (!button || !requireUser()) return;
    try {
      const result = await request(`/funding/${encodeURIComponent(button.dataset.fundingConnect)}/connect`, {
        method: 'POST',
        body: {},
      });
      toast(result.message, 'success');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const setupFundingForm = () => {
    document.getElementById('funding-open').addEventListener('click', () => {
      if (requireUser()) document.getElementById('funding-modal').classList.remove('hidden');
    });
    document.getElementById('funding-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      const message = document.getElementById('funding-message');
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await request('/funding', {
          method: 'POST',
          body: { ...data, partnersWanted: form.elements.partnersWanted.checked },
        });
        form.reset();
        document.getElementById('funding-modal').classList.add('hidden');
        toast('Your opportunity is now open to the community.', 'success');
        await loadFunding();
      } catch (error) {
        message.textContent = error.message;
        message.className = 'form-message error';
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById('funding-list').addEventListener('click', handleFundingConnect);
  };

  const setupNavigation = () => {
    document.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        if (button.dataset.view === 'profile' && state.user) state.profileUserId = state.user.id;
        showView(button.dataset.view);
      });
    });
    document.getElementById('menu-toggle').addEventListener('click', () => {
      const nav = document.getElementById('main-nav');
      nav.classList.toggle('open');
      document.getElementById('menu-toggle').setAttribute('aria-expanded', nav.classList.contains('open'));
    });
    const accountMenu = document.getElementById('account-menu');
    const accountMenuToggle = document.getElementById('account-menu-toggle');
    const accountMenuPanel = document.getElementById('account-menu-panel');
    accountMenuToggle.addEventListener('click', () => {
      const opening = accountMenuPanel.classList.contains('hidden');
      accountMenuPanel.classList.toggle('hidden', !opening);
      accountMenuToggle.setAttribute('aria-expanded', String(opening));
    });
    document.addEventListener('click', (event) => {
      if (!accountMenu.contains(event.target)) closeAccountMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !accountMenuPanel.classList.contains('hidden')) {
        closeAccountMenu();
        accountMenuToggle.focus();
      }
    });
    document.querySelectorAll('[data-close-modal]').forEach((button) => {
      button.addEventListener('click', () => button.closest('.modal-backdrop').classList.add('hidden'));
    });
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) backdrop.classList.add('hidden');
      });
    });
    document.getElementById('notifications-button').addEventListener('click', async () => {
      try {
        const notifications = await request('/notifications');
        const unread = notifications.filter((item) => !item.read);
        if (!notifications.length) toast('You’re all caught up.');
        else {
          unread.slice(0, 4).forEach((item) => toast(`${item.sender?.name || 'Someone'} ${item.message}.`));
          await Promise.all(
            unread.map((item) =>
              request(`/notifications/${encodeURIComponent(item.id)}/read`, { method: 'PATCH', body: {} })
            )
          );
          await window.Social.loadNotifications();
        }
      } catch (error) {
        toast(error.message, 'error');
      }
    });
    document.getElementById('dashboard-requests').addEventListener('click', () => showView('people'));
    document.getElementById('privacy-save').addEventListener('click', async () => {
      if (!requireUser()) return;
      const button = document.getElementById('privacy-save');
      button.disabled = true;
      try {
        const result = await request('/users/me/privacy', {
          method: 'PATCH',
          body: { private: document.getElementById('privacy-toggle').checked },
        });
        state.user = result.user;
        toast(
          result.user.private ? 'Your profile is now private.' : 'Your profile is now public.',
          'success'
        );
        await Promise.all([window.Social.loadPeople(), window.Social.loadFollowing()]);
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });
  };

  const init = async () => {
    document.getElementById('footer-year').textContent = new Date().getFullYear();
    window.StartNew = {
      apiRoot,
      state,
      escapeHtml,
      request,
      toast,
      requireUser,
      showView,
      setUser,
      refreshDashboard,
      refreshRecommendations,
      openProfilePage,
    };
    window.Auth.setup();
    window.Ideas.setup();
    window.Social.setup();
    window.Messages.setup();
    window.AI.setup();
    setupNavigation();
    setupFundingForm();
    setupProfileEditor();
    try {
      const result = await request('/login');
      await setUser(result.user);
    } catch (error) {
      if (error.status !== 401) toast(error.message, 'error');
    }
    await window.Ideas.getIdeas();
    await window.AI.loadNews('news-list');
    await window.AI.loadCurrency();
    await window.AI.loadWeather();
    await loadFunding();
  };

  document.addEventListener('DOMContentLoaded', init);
})();
