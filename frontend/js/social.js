(() => {
  // Handles people discovery, follow requests, profiles, and notifications.
  let peopleTimer;
  let requestTab = 'received';
  const noPeopleRecommendations = 'No new people to recommend right now. Check back as the community grows.';
  const escapeHtml = (value) => window.StartNew.escapeHtml(value || '');
  const avatar = (user) => user?.profilePicture || '/frontend/images/default-avatar.svg';

  const renderPeople = (users, gridId = 'people-grid', countId = 'people-count') => {
    const grid = document.getElementById(gridId);
    if (countId)
      document.getElementById(countId).textContent =
        `${users.length} ${users.length === 1 ? 'person' : 'people'}`;
    if (!users.length) {
      grid.innerHTML = `<div class="empty-state">${gridId === 'people-grid' ? 'No people found. Try another search.' : noPeopleRecommendations}</div>`;
      return;
    }
    grid.innerHTML = users
      .map((user) => {
        let action = 'follow';
        let label = user.private ? 'Request to follow' : 'Follow';
        let disabled = false;
        if (user.relationship === 'self') {
          action = 'self';
          label = 'That’s you';
          disabled = true;
        } else if (user.relationship === 'following') {
          action = 'unfollow';
          label = 'Following';
        } else if (user.relationship === 'pending') {
          action = 'cancel';
          label = 'Request sent';
        }
        return `<article class="person-card">
        <img src="${escapeHtml(avatar(user))}" alt="">
        <h3><button class="profile-link" data-social-action="profile" data-id="${escapeHtml(user.id)}">${escapeHtml(user.name)}</button></h3><span class="handle">@${escapeHtml(user.username)}</span>
        ${user.role ? `<span class="role">${escapeHtml(user.role)}</span>` : ''}
        <p>${escapeHtml(user.bio || 'Here to meet people and explore new ideas.')}</p>
        ${user.recommendationReason ? `<span class="recommendation-reason">${escapeHtml(user.recommendationReason)}</span>` : ''}
        <div class="person-counts"><b>${user.followers || 0}</b> followers · <b>${user.following || 0}</b> following</div>
        <div class="person-actions"><button class="button ${action === 'follow' ? 'button-primary' : 'button-outline'}" data-social-action="${action}" data-id="${escapeHtml(user.id)}" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>
        ${action === 'self' ? '' : `<button class="button button-outline" data-social-action="message" data-id="${escapeHtml(user.id)}">Message</button>`}</div>
      </article>`;
      })
      .join('');
  };

  const renderRecommendations = (users) => {
    renderPeople(users, 'people-recommendations', null);
    const target = document.getElementById('dashboard-recommended-people');
    target.innerHTML = users.length
      ? users
          .slice(0, 4)
          .map((user) => {
            const action = user.private ? 'Request' : 'Follow';
            return `<div class="compact-person">
        <img src="${escapeHtml(avatar(user))}" alt="">
        <div class="compact-person-info"><b><button class="profile-link" data-social-action="profile" data-id="${escapeHtml(user.id)}">${escapeHtml(user.name)}</button></b><span>${escapeHtml(user.recommendationReason || user.role || 'Community member')}</span></div>
        <button class="mini-action" data-social-action="follow" data-id="${escapeHtml(user.id)}">${action}</button>
      </div>`;
          })
          .join('')
      : `<p class="muted">${noPeopleRecommendations}</p>`;
  };

  const loadPeople = async () => {
    const query = document.getElementById('people-search').value.trim();
    const grid = document.getElementById('people-grid');
    grid.innerHTML = '<div class="loading-card">Finding your people…</div>';
    try {
      const users = await window.StartNew.request(`/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      renderPeople(users);
    } catch (error) {
      grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  };

  const loadRequests = async () => {
    const target = document.getElementById('requests-list');
    if (!window.StartNew.state.user) {
      target.innerHTML = '<p class="muted">Log in to manage follow requests.</p>';
      return;
    }
    try {
      const requests = await window.StartNew.request(`/follow-requests/${requestTab}`);
      if (!requests.length) {
        target.innerHTML = `<p class="muted">No ${requestTab} requests right now.</p>`;
        return;
      }
      target.innerHTML = requests
        .map((request) => {
          const user = requestTab === 'received' ? request.sender : request.recipient;
          const actions =
            requestTab === 'received'
              ? `<span class="request-actions"><button class="mini-action" data-request-action="accept" data-id="${escapeHtml(request.id)}">Accept</button><button class="mini-action" data-request-action="decline" data-id="${escapeHtml(request.id)}">Decline</button></span>`
              : `<button class="mini-action" data-request-action="cancel" data-id="${escapeHtml(request.id)}">Cancel</button>`;
          return `<div class="compact-person"><img src="${escapeHtml(avatar(user))}" alt=""><div class="compact-person-info"><b><button class="profile-link" data-social-action="profile" data-id="${escapeHtml(user?.id || '')}">${escapeHtml(user?.name || 'Member')}</button></b><span>@${escapeHtml(user?.username || '')}</span></div>${actions}</div>`;
        })
        .join('');
    } catch (error) {
      target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const loadConnections = async (type = 'following') => {
    const target = document.getElementById('following-list');
    document.getElementById('connections-title').textContent =
      type === 'followers' ? 'Followers' : 'Following';
    document.querySelectorAll('[data-connection-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.connectionTab === type);
    });
    if (!window.StartNew.state.user) {
      target.innerHTML = '<p class="muted">Log in to see your connections.</p>';
      return;
    }
    try {
      const users = await window.StartNew.request(
        `/users/${encodeURIComponent(window.StartNew.state.user.id)}/${type}`
      );
      target.innerHTML = users.length
        ? users
            .slice(0, 8)
            .map((user) => {
              const action =
                user.relationship === 'following'
                  ? 'unfollow'
                  : user.relationship === 'pending'
                    ? 'cancel'
                    : 'follow';
              const label =
                action === 'unfollow' ? 'Unfollow' : action === 'cancel' ? 'Request sent' : 'Follow';
              return `<div class="compact-person"><img src="${escapeHtml(avatar(user))}" alt=""><div class="compact-person-info"><b><button class="profile-link" data-social-action="profile" data-id="${escapeHtml(user.id)}">${escapeHtml(user.name)}</button></b><span>@${escapeHtml(user.username)}</span></div><button class="mini-action" data-social-action="${action}" data-id="${escapeHtml(user.id)}">${label}</button></div>`;
            })
            .join('')
        : `<p class="muted">${type === 'followers' ? 'Your network will grow as people connect with you.' : 'Follow someone to build your network.'}</p>`;
    } catch (error) {
      target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const loadFollowing = () => loadConnections('following');

  const loadProfileConnections = async (type) => {
    const userId = window.StartNew.state.profileUserId;
    if (!userId) return;
    const modal = document.getElementById('profile-connections-modal');
    const title = document.getElementById('profile-connections-title');
    const description = document.getElementById('profile-connections-description');
    const target = document.getElementById('profile-connections-list');
    const label = type === 'followers' ? 'Followers' : 'Following';
    title.textContent = label;
    description.textContent = `${label} of ${document.getElementById('profile-page-name').textContent}.`;
    target.innerHTML = `<p class="muted">Loading ${label.toLowerCase()}…</p>`;
    modal.classList.remove('hidden');
    try {
      const users = await window.StartNew.request(`/users/${encodeURIComponent(userId)}/${type}`);
      target.innerHTML = users.length
        ? users
            .map(
              (user) => `
        <div class="compact-person">
          <button class="connection-avatar" data-social-action="profile" data-id="${escapeHtml(user.id)}" aria-label="View ${escapeHtml(user.name)}'s profile"><img src="${escapeHtml(avatar(user))}" alt=""></button>
          <div class="compact-person-info"><b><button class="profile-link" data-social-action="profile" data-id="${escapeHtml(user.id)}">${escapeHtml(user.name)}</button></b><span>@${escapeHtml(user.username)}</span></div>
        </div>`
            )
            .join('')
        : `<p class="muted">No ${label.toLowerCase()} yet.</p>`;
    } catch (error) {
      target.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const handleProfileStat = (event) => {
    const button = event.target.closest('[data-profile-stat]');
    if (!button) return;
    if (button.dataset.profileStat === 'ideas') {
      document.querySelector('.profile-ideas-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    loadProfileConnections(button.dataset.profileStat);
  };

  const loadNotifications = async () => {
    if (!window.StartNew.state.user) return;
    try {
      const notifications = await window.StartNew.request('/notifications');
      const user = window.StartNew.state.user;
      if (!user) return notifications;
      const unread = notifications.filter((item) => !item.read).length;
      document.getElementById('notification-dot').classList.toggle('hidden', unread === 0);
      const badge = document.getElementById('account-notification-count');
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.setAttribute('aria-label', `${unread} unread notifications`);
      badge.classList.toggle('hidden', unread === 0);
      document
        .getElementById('account-menu-toggle')
        .setAttribute(
          'aria-label',
          `Open account menu for ${user.name}${unread ? `, ${unread} unread notifications` : ''}`
        );
      return notifications;
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    }
  };

  const loadProfile = async (id) => {
    const ideasTarget = document.getElementById('profile-ideas-grid');
    const activityTarget = document.getElementById('profile-activity-list');
    ideasTarget.innerHTML = '<div class="loading-card">Loading ideas…</div>';
    activityTarget.innerHTML = '<p class="muted">Loading recent updates…</p>';
    try {
      const [user, ideas] = await Promise.all([
        window.StartNew.request(`/users/${encodeURIComponent(id)}`),
        window.StartNew.request(`/users/${encodeURIComponent(id)}/contents`),
      ]);
      window.Ideas.addToCache(ideas);
      document.getElementById('profile-page-avatar').src = avatar(user);
      document.getElementById('profile-page-name').textContent = user.name;
      document.getElementById('profile-page-handle').textContent = `@${user.username}`;
      document.getElementById('profile-page-role').textContent = user.role || 'START NEW MEMBER';
      document.getElementById('profile-page-bio').textContent =
        user.bio || 'Here to meet people and explore new ideas.';
      document.getElementById('profile-page-followers').textContent = user.followers || 0;
      document.getElementById('profile-page-following').textContent = user.following || 0;
      document.getElementById('profile-page-idea-count').textContent = ideas.length;
      document.getElementById('profile-ideas-heading').textContent = `${user.name.split(' ')[0]}'s ideas`;
      document.getElementById('profile-page-interests').innerHTML = (user.interests || []).length
        ? user.interests
            .map((interest) => `<span class="interest-chip">${escapeHtml(interest)}</span>`)
            .join('')
        : '';
      const ownProfile = user.relationship === 'self';
      document.getElementById('profile-edit-page-button').classList.toggle('hidden', !ownProfile);
      document.getElementById('profile-share-idea').classList.toggle('hidden', !ownProfile);
      let action = 'follow';
      let label = user.private ? 'Request to follow' : 'Follow';
      if (user.relationship === 'following') {
        action = 'unfollow';
        label = 'Following';
      } else if (user.relationship === 'pending') {
        action = 'cancel';
        label = 'Request sent';
      }
      document.getElementById('profile-page-actions').innerHTML = ownProfile
        ? ''
        : `
        <button class="button button-primary" data-profile-action="${action}" data-id="${escapeHtml(user.id)}">${label}</button>
        <button class="button button-outline" data-profile-action="message" data-id="${escapeHtml(user.id)}">Message</button>`;
      window.Ideas.renderList(
        ideasTarget,
        ideas,
        user.private && !['self', 'following'].includes(user.relationship)
          ? 'This profile is private. Follow the member to see their ideas.'
          : 'No ideas shared yet. This is a great place for a first idea.'
      );
      if (!ownProfile) {
        activityTarget.innerHTML =
          '<p class="muted">Comment and message updates are private to each member.</p>';
        return;
      }
      const notifications = await window.StartNew.request('/notifications');
      const relevant = notifications
        .filter((item) =>
          [
            'like',
            'comment',
            'save',
            'message',
            'follow',
            'follow_request',
            'request_accepted',
            'funding_interest',
          ].includes(item.type)
        )
        .slice(0, 10);
      activityTarget.innerHTML = relevant.length
        ? relevant
            .map((item) => {
              const activity = {
                like: ['New like', 'liked your idea'],
                comment: ['Comment on your idea', 'left a comment on your idea'],
                save: ['Idea saved', 'saved your idea'],
                message: ['New private message', 'sent you a private message'],
                follow: ['New follower', 'started following you'],
                follow_request: ['Follow request', 'wants to follow you'],
                request_accepted: ['Request accepted', 'accepted your follow request'],
                funding_interest: ['Funding interest', 'is interested in your opportunity'],
              }[item.type] || ['Community update', item.message];
              let link = '';
              if (['like', 'comment', 'save'].includes(item.type)) {
                link = `<button class="activity-link" data-activity-action="idea" data-id="${escapeHtml(item.relatedId)}">View idea →</button>`;
              } else if (item.type === 'message') {
                link = `<button class="activity-link" data-activity-action="message" data-id="${escapeHtml(item.relatedId)}">Open chat →</button>`;
              } else if (item.sender?.id) {
                link = `<button class="activity-link" data-activity-action="profile" data-id="${escapeHtml(item.sender.id)}">View profile →</button>`;
              }
              return `<article class="activity-item ${item.read ? '' : 'unread'}">
          <img src="${escapeHtml(avatar(item.sender))}" alt="">
          <div class="activity-copy"><b>${escapeHtml(activity[0])}</b><p><strong>${escapeHtml(item.sender?.name || 'A community member')}</strong> ${escapeHtml(activity[1])}.</p>
            <time>${new Date(item.createdAt).toLocaleString()}</time>${link}
          </div>
          ${item.read ? '' : '<span class="activity-unread-dot" aria-label="Unread"></span>'}
        </article>`;
            })
            .join('')
        : '<p class="muted">No recent likes, comments, saves, or messages yet. New activity will appear here.</p>';
    } catch (error) {
      ideasTarget.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
      activityTarget.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
    }
  };

  const openProfile = async (id) => {
    window.StartNew.openProfilePage(id);
  };

  const handleProfileAction = async (event) => {
    const button = event.target.closest('[data-profile-action]');
    if (!button) return;
    const { profileAction, id } = button.dataset;
    if (!window.StartNew.requireUser()) return;
    try {
      if (profileAction === 'message') {
        await window.Messages.start(id);
        window.StartNew.showView('messages');
        return;
      }
      if (profileAction === 'follow') {
        const result = await window.StartNew.request('/follow', { method: 'POST', body: { userId: id } });
        window.StartNew.toast(
          result.status === 'pending' ? 'Follow request sent.' : 'You’re connected.',
          'success'
        );
      } else if (profileAction === 'unfollow') {
        await window.StartNew.request('/follow', { method: 'DELETE', body: { userId: id } });
        window.StartNew.toast('You unfollowed this person.');
      } else if (profileAction === 'cancel') {
        const sent = await window.StartNew.request('/follow-requests/sent');
        const request = sent.find((item) => item.recipient?.id === id);
        if (request)
          await window.StartNew.request(`/follow-requests/${encodeURIComponent(request.id)}`, {
            method: 'DELETE',
          });
        window.StartNew.toast('Follow request cancelled.');
      }
      await Promise.all([loadProfile(id), loadPeople(), loadFollowing(), loadRequests()]);
      await window.StartNew.refreshDashboard();
      await window.Ideas.loadFeed();
      await window.StartNew.refreshRecommendations();
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    }
  };

  const handleProfileActivity = async (event) => {
    const button = event.target.closest('[data-activity-action]');
    if (!button) return;
    const { activityAction, id } = button.dataset;
    try {
      if (activityAction === 'message') {
        await window.Messages.openConversation(id);
        window.StartNew.showView('messages');
      } else if (activityAction === 'idea') {
        await window.Ideas.showDetail(id);
      } else if (activityAction === 'profile') {
        await openProfile(id);
      }
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    }
  };

  const handleSocialAction = async (event) => {
    const button = event.target.closest('[data-social-action]');
    if (!button) return;
    const { socialAction, id } = button.dataset;
    if (socialAction === 'self') return;
    if (socialAction === 'profile') {
      try {
        await openProfile(id);
      } catch (error) {
        window.StartNew.toast(error.message, 'error');
      }
      return;
    }
    if (!window.StartNew.requireUser()) return;
    try {
      if (socialAction === 'message') {
        await window.Messages.start(id);
        window.StartNew.showView('messages');
        return;
      }
      if (socialAction === 'follow') {
        const result = await window.StartNew.request('/follow', { method: 'POST', body: { userId: id } });
        window.StartNew.toast(
          result.status === 'pending' ? 'Follow request sent.' : 'You’re connected.',
          'success'
        );
      } else if (socialAction === 'unfollow') {
        await window.StartNew.request('/follow', { method: 'DELETE', body: { userId: id } });
        window.StartNew.toast('You unfollowed this person.');
      } else if (socialAction === 'cancel') {
        const sent = await window.StartNew.request('/follow-requests/sent');
        const request = sent.find((item) => item.recipient?.id === id);
        if (request)
          await window.StartNew.request(`/follow-requests/${encodeURIComponent(request.id)}`, {
            method: 'DELETE',
          });
        window.StartNew.toast('Follow request cancelled.');
      }
      await Promise.all([loadPeople(), loadFollowing(), loadRequests(), loadNotifications()]);
      await window.Ideas.loadFeed();
      await window.StartNew.refreshDashboard();
      if (!document.getElementById('detail-modal').classList.contains('hidden')) await openProfile(id);
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    }
  };

  const handleRequestAction = async (event) => {
    const button = event.target.closest('[data-request-action]');
    if (!button) return;
    const { requestAction, id } = button.dataset;
    try {
      if (requestAction === 'cancel')
        await window.StartNew.request(`/follow-requests/${encodeURIComponent(id)}`, { method: 'DELETE' });
      else
        await window.StartNew.request(`/follow-requests/${encodeURIComponent(id)}/${requestAction}`, {
          method: 'POST',
        });
      const confirmation =
        requestAction === 'accept'
          ? 'Follow request accepted.'
          : requestAction === 'decline'
            ? 'Follow request declined.'
            : 'Follow request cancelled.';
      window.StartNew.toast(confirmation);
      await Promise.all([loadRequests(), loadFollowing(), loadNotifications(), loadPeople()]);
      await window.StartNew.refreshDashboard();
      await window.Ideas.loadFeed();
    } catch (error) {
      window.StartNew.toast(error.message, 'error');
    }
  };

  const setup = () => {
    window.setInterval(() => {
      if (window.StartNew.state.user && document.visibilityState === 'visible') loadNotifications();
    }, 30000);
    document.querySelector('.profile-counts').addEventListener('click', handleProfileStat);
    document.getElementById('profile-connections-modal').addEventListener('click', (event) => {
      if (!event.target.closest('[data-social-action="profile"]')) return;
      document.getElementById('profile-connections-modal').classList.add('hidden');
      handleSocialAction(event);
    });
    document.getElementById('people-search').addEventListener('input', () => {
      clearTimeout(peopleTimer);
      peopleTimer = setTimeout(loadPeople, 250);
    });
    document.getElementById('people-grid').addEventListener('click', handleSocialAction);
    document.getElementById('following-list').addEventListener('click', handleSocialAction);
    document.getElementById('dashboard-recommended-people').addEventListener('click', handleSocialAction);
    document.getElementById('people-recommendations').addEventListener('click', handleSocialAction);
    document.getElementById('requests-list').addEventListener('click', handleRequestAction);
    document.getElementById('requests-list').addEventListener('click', handleSocialAction);
    ['explore-ideas', 'feed-ideas', 'dashboard-ideas', 'dashboard-network', 'profile-ideas-grid'].forEach(
      (id) => document.getElementById(id).addEventListener('click', handleSocialAction)
    );
    ['dashboard-recommended-ideas', 'explore-recommended-ideas'].forEach((id) =>
      document.getElementById(id).addEventListener('click', handleSocialAction)
    );
    document.getElementById('detail-modal').addEventListener('click', (event) => {
      if (event.target.closest('[data-social-action="profile"]')) {
        document.getElementById('detail-modal').classList.add('hidden');
        handleSocialAction(event);
      }
      const idea = event.target.closest('[data-profile-idea]');
      if (idea) window.Ideas.showDetail(idea.dataset.profileIdea);
    });
    document.getElementById('profile-page-actions').addEventListener('click', handleProfileAction);
    document.getElementById('profile-activity-list').addEventListener('click', handleProfileActivity);
    document.querySelectorAll('[data-request-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        requestTab = button.dataset.requestTab;
        document
          .querySelectorAll('[data-request-tab]')
          .forEach((tab) => tab.classList.toggle('active', tab === button));
        loadRequests();
      });
    });
    document.querySelectorAll('[data-connection-tab]').forEach((button) => {
      button.addEventListener('click', () => loadConnections(button.dataset.connectionTab));
    });
  };

  window.Social = {
    setup,
    loadPeople,
    loadRequests,
    loadFollowing,
    loadConnections,
    loadNotifications,
    renderPeople,
    renderRecommendations,
    openProfile,
    loadProfile,
  };
})();
