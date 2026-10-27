(() => {
  const status = document.getElementById('status');
  const verifyButton = document.getElementById('verify');
  const resourceButton = document.getElementById('resource');
  const retryButton = document.getElementById('retry');
  const resultBox = document.getElementById('result');
  let token = '';
  let widgetId;
  let busy = false;

  function message(text, state = '') {
    status.textContent = text;
    status.className = `status ${state}`;
  }

  async function api(path, options = {}) {
    const response = await fetch(`/turnstile-api/${path}`, {
      credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(15000), ...options,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '请求暂时无法完成，请稍后重试。');
    return data;
  }

  function invalidate(text) {
    token = '';
    verifyButton.disabled = true;
    retryButton.hidden = false;
    if (!busy) message(text, 'error');
  }

  async function loadWidget() {
    try {
      const config = await api('config');
      await new Promise((resolve, reject) => {
        if (window.turnstile) return resolve();
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('验证组件加载失败，请检查网络后重试。'));
        document.head.appendChild(script);
      });
      widgetId = window.turnstile.render('#turnstile-widget', {
        sitekey: config.sitekey, action: config.action, theme: 'dark', size: 'flexible',
        callback(value) {
          token = value;
          verifyButton.disabled = busy;
          retryButton.hidden = true;
          if (!busy) message('检查已完成，请点击“验证并继续”进行确认。');
        },
        'expired-callback': () => invalidate('检查结果已过期，请重新验证。'),
        'error-callback': () => {
          invalidate('验证遇到问题，请检查网络后重试。');
          return true;
        },
      });
      message('请完成上方的检查。');
    } catch (error) {
      invalidate(error.message || '组件加载失败，请稍后重试。');
    }
  }

  verifyButton.addEventListener('click', async () => {
    if (!token || busy) return;
    busy = true;
    verifyButton.disabled = true;
    retryButton.hidden = true;
    message('正在确认验证结果…');
    let verified = false;
    try {
      await api('verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      verified = true;
      message('验证成功！现在可以读取右侧的受保护内容，有效期为 10 分钟。', 'success');
    } catch (error) {
      message(error.message, 'error');
    } finally {
      token = '';
      busy = false;
      verifyButton.disabled = true;
      retryButton.hidden = false;
      retryButton.textContent = verified ? '再次验证' : '重新加载验证';
    }
  });

  retryButton.addEventListener('click', () => {
    token = '';
    verifyButton.disabled = true;
    retryButton.hidden = true;
    message('正在重新加载验证…');
    if (widgetId !== undefined && window.turnstile) window.turnstile.reset(widgetId);
    else location.reload();
  });

  resourceButton.addEventListener('click', async () => {
    resourceButton.disabled = true;
    resultBox.className = 'result';
    resultBox.textContent = '正在请求受保护内容…';
    try {
      const data = await api('resource');
      resultBox.className = 'result success';
      resultBox.textContent = data.message;
      const list = document.createElement('ul');
      for (const item of data.items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }
      resultBox.appendChild(list);
    } catch (error) {
      resultBox.className = 'result error';
      resultBox.textContent = error.message;
    } finally {
      resourceButton.disabled = false;
    }
  });

  loadWidget();
})();
