const refs = {
  form: document.getElementById('loginForm'),
  message: document.getElementById('loginMessage'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
};

function setMessage(text, type = '') {
  refs.message.textContent = text;
  refs.message.className = `message ${type}`.trim();
}

async function handleSubmit(event) {
  event.preventDefault();
  setMessage('Signing in...');

  try {
    const data = await window.Auth.apiRequest('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: refs.username.value.trim(),
        password: refs.password.value,
      }),
    });

    const role = data?.user?.role;
    if (role === 'Administrator') {
      window.location.href = '/admin.html';
      return;
    }

    window.location.href = '/user.html';
  } catch (err) {
    setMessage(err.message || 'Login failed.', 'error');
  }
}

async function bootstrap() {
  refs.form.addEventListener('submit', handleSubmit);

  document.getElementById('togglePw')?.addEventListener('click', () => {
    const inp  = document.getElementById('password');
    const icon = document.getElementById('togglePwIcon');
    if (!inp) return;
    if (inp.type === 'password') {
      inp.type = 'text';
      if (icon) icon.className = 'bi bi-eye-slash';
    } else {
      inp.type = 'password';
      if (icon) icon.className = 'bi bi-eye';
    }
  });

  try {
    const current = await window.Auth.getCurrentUser();
    if (!current) return;
    window.location.href = current.role === 'Administrator' ? '/admin.html' : '/user.html';
  } catch (err) {
    setMessage(err.message || 'Unable to validate session.', 'error');
  }
}

bootstrap();
