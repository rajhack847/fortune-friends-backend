import axios from 'axios';

const BASE = process.env.API_BASE || 'http://localhost:5001/api';
const endpoints = {
  draws: `${BASE}/fortune-draw/active`,
  home: `${BASE}/home-settings`
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkOnce() {
  try {
    const res1 = await axios.get(endpoints.draws, { timeout: 5000 });
    const res2 = await axios.get(endpoints.home, { timeout: 5000 });
    const ok1 = res1.status === 200 && res1.data && res1.data.success !== false;
    const ok2 = res2.status === 200 && res2.data && res2.data.success !== false;
    return { ok: ok1 && ok2, res1: res1.data, res2: res2.data };
  } catch (err) {
    return { ok: false, error: err.toString(), detail: err.response ? err.response.data : null };
  }
}

async function poll(maxAttempts = 120, intervalMs = 2000) {
  console.log(`Polling endpoints up to ${maxAttempts} times every ${intervalMs}ms`);
  for (let i = 1; i <= maxAttempts; i++) {
    const result = await checkOnce();
    if (result.ok) {
      console.log(`OK on attempt ${i}`);
      console.log('fortune-draw/active response:', JSON.stringify(result.res1, null, 2));
      console.log('home-settings response:', JSON.stringify(result.res2, null, 2));
      process.exit(0);
    }
    console.log(`Attempt ${i}: not ready - ${result.error || 'no error field'}; detail: ${result.detail ? JSON.stringify(result.detail) : 'n/a'}`);
    await delay(intervalMs);
  }
  console.error('Endpoints did not become healthy within max attempts');
  process.exit(2);
}

poll();
