# Turnstile 独立验证页

访问 `/turnstile.html`，完成 Cloudflare 检查并点击“验证并继续”。后端校验成功后写入 10 分钟的 `Secure`、`HttpOnly`、`SameSite=Strict` 会话 Cookie，随后可读取 `/turnstile-api/resource` 的示例数据。未验证、伪造或过期的会话会收到 403。

此功能只保护示例接口，不限制现有静态页面和 `/crawler-api/`。原有反爬实验后端不属于本仓库。

## Linux 部署

后端只依赖 Python 3.10+ 标准库，无需 pip、Node.js 或 Docker。它仅监听 `127.0.0.1:8790`，由 Nginx 对外代理。

1. 将 `turnstile.html`、`css/turnstile.css`、`js/turnstile.js` 和更新后的 `index.html` 上传到 `/var/www/yzibio/` 对应位置。
2. 将 `backend/turnstile_server.py` 安装为 `/opt/bio-turnstile/turnstile_server.py`，root 所有、644 权限。
3. 复制 `deploy/turnstile.env.example` 为 `/etc/bio-turnstile.env`，填写真实密钥和允许的域名，设置 root 所有、600 权限。**Secret key 不得写入前端、Git 或网站根目录。**
4. 将 `deploy/bio-turnstile.service` 安装到 `/etc/systemd/system/`，执行 `sudo systemctl daemon-reload` 和 `sudo systemctl enable --now bio-turnstile`。
5. 将 `deploy/turnstile-nginx.conf` 安装到 `/etc/nginx/snippets/bio-turnstile.conf`，在现有 `biochris.top` 的 `server {}` 内加入 `include /etc/nginx/snippets/bio-turnstile.conf;`。当前服务器实际加载的是 `/etc/nginx/sites-enabled/yzibio` 普通文件，并非指向 `sites-available` 的软链接；应以 `nginx -T` 输出为准修改生效文件。执行 `sudo nginx -t`，成功后 `sudo systemctl reload nginx`。

部署前备份原始文件和 Nginx 配置。不要用带 `--delete` 的同步覆盖服务器上的 `crawler-lab/`。为 `/turnstile-api/*` 保持缓存绕过；不得使用 Cloudflare Cache Everything 规则缓存这些接口。HTML 更新后可带版本参数检查是否命中旧缓存。

## 验证

```bash
python3 -m unittest discover -s tests -v
curl -i https://biochris.top/turnstile-api/health
curl -i https://biochris.top/turnstile-api/resource  # 未验证应为 403
curl -i https://biochris.top/turnstile-api/verify \
  -H 'Origin: https://biochris.top' -H 'Content-Type: application/json' \
  --data '{"token":"invalid"}'  # 应为 403，且没有 Set-Cookie
```

在真实浏览器完成验证后，受保护请求应返回 200。后端向 Cloudflare Siteverify 发送 token，并同时检查 `success`、`hostname` 和 `action=bio_demo`；服务异常时拒绝放行。每个 Turnstile token 仅能使用一次，失败后应重新生成。测试使用模拟 Siteverify 响应，不会在生产环境启用测试密钥或放行开关。

会话仅保存在后端内存中，服务重启后需重新验证。生产环境不记录 secret、token、Cookie 或 Siteverify 完整响应。若未来扩展到多个进程，应改为共享会话存储。

## 回滚

恢复备份的首页和 Nginx 站点配置，执行 `sudo nginx -t` 并重载，然后停止 `bio-turnstile` 服务。原有静态站和反爬实验文件不依赖这个服务。
