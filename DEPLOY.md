# 源兹生物官网 —— 服务器部署方案

## 环境信息
- 服务器：2核 1GB 内存（纯静态站，资源绰绰有余）
- 系统：Ubuntu / Debian
- Web 服务：Nginx（已安装）
- 访问方式：先用服务器 IP（后续可绑域名）

## 部署清单（12 个文件，约 209KB）

```
index.html              首页
bioinformatics.html     生物信息学
experiments.html        基础实验
omics.html              组学服务
platform.html           技术平台
resources.html          技术资料
news.html               公司动态
careers.html            加入我们
about.html              关于源兹
css/style.css           样式
js/main.js              交互脚本
启动网站.bat            本地预览脚本（不上服务器）
```

> `启动网站.bat` 仅用于本地预览，**无需上传服务器**。

## 部署步骤

### 1. 上传文件到服务器

在本地（本项目目录）执行，把站点文件传到服务器 `/var/www/yzibio`：

```bash
# 方式一：scp（推荐，简单）
scp -r index.html bioinformatics.html experiments.html omics.html \
  platform.html resources.html news.html careers.html about.html \
  css js 用户名@服务器IP:/tmp/yzibio-site/

# 方式二：rsync（可增量同步，大项目推荐）
rsync -av --exclude='启动网站.bat' ./ 用户名@服务器IP:/var/www/yzibio/
```

然后在服务器上移动文件到目标目录：

```bash
sudo mkdir -p /var/www/yzibio
sudo mv /tmp/yzibio-site/* /var/www/yzibio/
sudo chown -R www-data:www-data /var/www/yzibio
sudo chmod -R 755 /var/www/yzibio
```

### 2. 配置 Nginx 站点

创建站点配置文件：

```bash
sudo nano /etc/nginx/sites-available/yzibio
```

写入以下内容（**将 `你的服务器IP` 替换为真实 IP**）：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name 你的服务器IP;

    root /var/www/yzibio;
    index index.html;

    # 静态资源缓存（加速访问）
    location ~* \.(css|js|svg|png|jpg|jpeg|gif|webp|ico)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    # 常规页面
    location / {
        try_files $uri $uri/ =404;
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
```

启用站点并重载：

```bash
sudo ln -s /etc/nginx/sites-available/yzibio /etc/nginx/sites-enabled/
sudo nginx -t          # 检查配置语法
sudo systemctl reload nginx
```

### 3. 防火墙放行（如已启用 UFW）

```bash
sudo ufw allow 80/tcp
sudo ufw reload
```

### 4. 验证

浏览器访问：`http://你的服务器IP`，应显示首页。

服务器本地验证：
```bash
curl -I http://127.0.0.1
# 期望输出：HTTP/1.1 200 OK
```

## HTTPS 说明（后续绑域名时启用）

先用 IP 访问不需要 HTTPS。之后如果绑定域名（如 `www.yzibio.com`），
可以申请 Let's Encrypt 免费证书：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d www.yzibio.com -d yzibio.com
```

certbot 会自动改写 Nginx 配置并启用 HTTPS 跳转。

## 常见问题

| 问题 | 解决 |
|---|---|
| 访问显示 403 | 检查目录权限：`sudo chown -R www-data:www-data /var/www/yzibio` |
| 访问显示 404 | 检查 `root` 路径是否写对，文件是否在 `/var/www/yzibio` 下 |
| 修改后不生效 | `sudo systemctl reload nginx` 或 `sudo nginx -s reload` |
| 端口被占用 | `sudo lsof -i:80` 查看占用进程 |
