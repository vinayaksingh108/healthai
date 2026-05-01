const API_BASE = 'https://healthai-production-5bd2.up.railway.app';
function getToken() { return localStorage.getItem('healthai_token'); }
function getUser() { return JSON.parse(localStorage.getItem('healthai_user') || 'null'); }
function setAuth(token, user) {
  localStorage.setItem('healthai_token', token);
  localStorage.setItem('healthai_user', JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem('healthai_token');
  localStorage.removeItem('healthai_user');
}
function isLoggedIn() { return !!getToken(); }
function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}
async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Login failed');
  setAuth(data.token, data.user);
  return data;
}
async function register(name, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Registration failed');
  setAuth(data.token, data.user);
  return data;
}
function logout() {
  clearAuth();
  window.location.href = 'login.html';
}