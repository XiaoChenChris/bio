/* ============================================================
   源兹生物 YZIBIO —— 首页交互脚本
   ============================================================ */

/* ---------- Canvas 粒子背景 ---------- */
(function () {
  var canvas = document.getElementById('particles');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var particles = [];
  var mouse = { x: null, y: null };
  var isReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles = [];
    var count = Math.min(90, Math.floor(window.innerWidth / 16));
    for (var i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.6,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        color: Math.random() > 0.82
          ? 'rgba(245, 199, 106, ALPHA)'   // 金色点缀
          : 'rgba(103, 232, 249, ALPHA)'   // 青色主体
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.y > canvas.height + 10) p.y = -10;

      // 鼠标吸附
      if (mouse.x !== null) {
        var dx = p.x - mouse.x;
        var dy = p.y - mouse.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          p.x += dx * 0.02;
          p.y += dy * 0.02;
        }
      }

      var alpha = 0.25 + 0.55 * Math.abs(Math.sin(p.x * 0.01 + i));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('ALPHA', alpha.toFixed(3));
      ctx.fill();

      // 邻近连线
      for (var j = i + 1; j < particles.length; j++) {
        var q = particles[j];
        var lx = p.x - q.x;
        var ly = p.y - q.y;
        var dist2 = lx * lx + ly * ly;
        if (dist2 < 130 * 130) {
          var lineAlpha = 0.12 * (1 - dist2 / (130 * 130));
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = 'rgba(103, 232, 249,' + lineAlpha.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }

  if (isReduced) {
    // 减少动效：只画静态粒子，不启动动画循环
    resize();
    createParticles();
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('ALPHA', '0.35');
      ctx.fill();
    }
    return;
  }

  resize();
  createParticles();

  window.addEventListener('resize', function () {
    resize();
    createParticles();
  });

  window.addEventListener('mousemove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  draw();
})();

/* ---------- 导航滚动效果 ---------- */
(function () {
  var header = document.getElementById('header');

  function onScroll() {
    if (window.scrollY > 10) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* ---------- 移动端菜单 ---------- */
(function () {
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');

  function closeMenu() {
    nav.classList.remove('open');
    toggle.classList.remove('open');
    toggle.setAttribute('aria-label', '打开菜单');
  }

  toggle.addEventListener('click', function () {
    var isOpen = nav.classList.toggle('open');
    toggle.classList.toggle('open', isOpen);
    toggle.setAttribute('aria-label', isOpen ? '关闭菜单' : '打开菜单');
  });

  nav.querySelectorAll('a').forEach(function (link) {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('click', function (e) {
    if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });
})();

/* ---------- 滚动渐入动画 ---------- */
(function () {
  var targets = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('visible'); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(function (el) {
    observer.observe(el);
  });
})();

/* ---------- 数字滚动动画 ---------- */
(function () {
  var nums = document.querySelectorAll('.stat-num');
  if (!nums.length) return;

  function animateNum(el) {
    var target = parseInt(el.getAttribute('data-target'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    var duration = 1600;
    var start = null;

    function step(timestamp) {
      if (!start) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      // easeOutCubic
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target + suffix;
      }
    }

    requestAnimationFrame(step);
  }

  if (!('IntersectionObserver' in window)) {
    nums.forEach(animateNum);
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        animateNum(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  nums.forEach(function (el) {
    observer.observe(el);
  });
})();

/* ---------- 返回顶部 ---------- */
(function () {
  var backTop = document.getElementById('backTop');

  function toggleBackTop() {
    if (window.scrollY > 480) {
      backTop.classList.add('show');
    } else {
      backTop.classList.remove('show');
    }
  }

  backTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', toggleBackTop, { passive: true });
  toggleBackTop();
})();

/* ---------- 两侧装饰滚动视差 ---------- */
(function () {
  var decors = document.querySelectorAll('.side-decor');
  if (!decors.length) return;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return; // 用户偏好减少动效则禁用视差

  var ticking = false;

  function update() {
    var y = window.scrollY || 0;
    decors.forEach(function (el) {
      var speed = parseFloat(el.getAttribute('data-parallax')) || 0;
      var offset = y * speed;
      el.style.transform = 'translateY(calc(-50% + ' + offset.toFixed(1) + 'px))';
    });
    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  update();
})();

/* ---------- 鼠标跟随微交互 ---------- */
(function () {
  var items = document.querySelectorAll('[data-follow]');
  if (!items.length) return;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return; // 用户偏好减少动效则禁用跟随

  // 每个元素的当前偏移与目标偏移
  var current = [];
  var target = [];
  var strengths = [];

  items.forEach(function (el, i) {
    current.push({ x: 0, y: 0 });
    target.push({ x: 0, y: 0 });
    strengths.push(parseFloat(el.getAttribute('data-follow')) || 0);
  });

  function onMouseMove(e) {
    // 归一化鼠标位置：视口中心为 0，边缘为 ±1
    var nx = (e.clientX / window.innerWidth - 0.5) * 2;
    var ny = (e.clientY / window.innerHeight - 0.5) * 2;

    for (var i = 0; i < items.length; i++) {
      var s = strengths[i];
      target[i].x = nx * s;
      target[i].y = ny * s;
    }
  }

  var running = true;

  function tick() {
    if (!running) return;

    for (var i = 0; i < items.length; i++) {
      // 平滑插值逼近目标
      current[i].x += (target[i].x - current[i].x) * 0.08;
      current[i].y += (target[i].y - current[i].y) * 0.08;

      var el = items[i];
      el.style.setProperty('--mx', current[i].x.toFixed(2) + 'px');
      el.style.setProperty('--my', current[i].y.toFixed(2) + 'px');
    }
    requestAnimationFrame(tick);
  }

  window.addEventListener('mousemove', onMouseMove, { passive: true });
  requestAnimationFrame(tick);
})();

/* ---------- 鼠标靠近放大/发光 ---------- */
(function () {
  var glowables = document.querySelectorAll('[data-glow]');
  if (!glowables.length) return;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return; // 用户偏好减少动效则禁用

  var TRIGGER_RADIUS = 110; // 触发距离（px）

  function onMouseMove(e) {
    for (var i = 0; i < glowables.length; i++) {
      var el = glowables[i];
      var rect = el.getBoundingClientRect();

      // 元素中心点
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;

      var dx = e.clientX - cx;
      var dy = e.clientY - cy;
      var dist = Math.sqrt(dx * dx + dy * dy);

      el.classList.toggle('active', dist < TRIGGER_RADIUS);
    }
  }

  window.addEventListener('mousemove', onMouseMove, { passive: true });

  // 离开页面时清除发光状态
  document.addEventListener('mouseleave', function () {
    glowables.forEach(function (el) { el.classList.remove('active'); });
  });
})();
