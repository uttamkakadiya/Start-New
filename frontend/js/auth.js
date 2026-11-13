(() => {
  // Coordinates account dialogs and the login, registration, and logout flows.
  const modal = () => document.getElementById('auth-modal');
  const showMessage = (id, message, kind = '') => {
    const element = document.getElementById(id);
    element.textContent = message;
    element.className = `form-message ${kind}`.trim();
  };
  const clearMessage = (id) => {
    const element = document.getElementById(id);
    element.textContent = '';
    element.className = 'form-message hidden';
  };

  const open = (tab = 'login') => {
    modal().classList.remove('hidden');
    selectTab(tab);
    const field = modal().querySelector(tab === 'register' ? '[name="name"]' : '[name="identifier"]');
    if (field) field.focus();
  };

  const close = () => modal().classList.add('hidden');

  const selectTab = (tab) => {
    const isRegister = tab === 'register';
    document.querySelectorAll('[data-auth-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.authTab === tab);
    });
    document.getElementById('login-form').classList.toggle('hidden', isRegister);
    document.getElementById('register-form').classList.toggle('hidden', !isRegister);
    document.getElementById('auth-title').textContent = isRegister ? 'Join Start New' : 'Log in to Start New';
    document.getElementById('auth-subtitle').textContent = isRegister
      ? 'Meet the people who will help your idea go further.'
      : 'Your people and ideas are right where you left them.';
    clearMessage('login-message');
    clearMessage('register-message');
  };

  // Restore the original button label after each asynchronous account request.
  const setBusy = (form, busy) => {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = busy;
    button.dataset.originalText ||= button.textContent;
    button.textContent = busy ? 'One moment…' : button.dataset.originalText;
  };

  const setup = () => {
    document.getElementById('login-open').addEventListener('click', () => open('login'));
    document.getElementById('register-open').addEventListener('click', () => open('register'));
    document.getElementById('hero-join').addEventListener('click', () => open('register'));
    document.getElementById('bottom-join').addEventListener('click', () => open('register'));
    document.querySelectorAll('[data-auth-tab]').forEach((button) => {
      button.addEventListener('click', () => selectTab(button.dataset.authTab));
    });

    document.getElementById('login-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      setBusy(form, true);
      clearMessage('login-message');
      try {
        const result = await window.StartNew.request('/login', {
          method: 'POST',
          body: { identifier: values.identifier, password: values.password },
        });
        close();
        form.reset();
        await window.StartNew.setUser(result.user);
        window.StartNew.toast('Welcome back. Let’s keep things moving.', 'success');
      } catch (error) {
        showMessage('login-message', error.message, 'error');
      } finally {
        setBusy(form, false);
      }
    });

    document.getElementById('register-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      setBusy(form, true);
      clearMessage('register-message');
      try {
        if (values.password !== values.passwordConfirm) {
          showMessage('register-message', 'Passwords do not match.', 'error');
          return;
        }
        const profilePicture = form.elements.profilePicture.files[0];
        const result = await window.StartNew.request('/users', {
          method: 'POST',
          body: {
            name: values.name,
            username: values.username,
            email: values.email,
            password: values.password,
            role: values.role,
            bio: values.bio,
            interests: values.interests
              .split(',')
              .map((interest) => interest.trim())
              .filter(Boolean),
            private: form.elements.private.checked,
          },
        });
        close();
        form.reset();
        await window.StartNew.setUser(result.user);
        if (profilePicture) {
          try {
            const upload = new FormData();
            upload.append('file', profilePicture);
            upload.append('folder', 'profiles');
            await window.StartNew.request('/uploads', { method: 'POST', body: upload });
            const current = await window.StartNew.request('/login');
            await window.StartNew.setUser(current.user);
          } catch (error) {
            window.StartNew.toast(
              `Your account was created, but the profile picture could not be uploaded: ${error.message}`,
              'error'
            );
            return;
          }
        }
        window.StartNew.toast('You’re in. Welcome to Start New!', 'success');
      } catch (error) {
        showMessage('register-message', error.message, 'error');
      } finally {
        setBusy(form, false);
      }
    });

    document.getElementById('logout-button').addEventListener('click', async () => {
      try {
        await window.StartNew.request('/login', { method: 'DELETE' });
        await window.StartNew.setUser(null);
        window.StartNew.showView('landing');
        window.StartNew.toast('You have logged out.');
      } catch (error) {
        window.StartNew.toast(error.message, 'error');
      }
    });
  };

  window.Auth = { open, close, selectTab, setup };
})();
