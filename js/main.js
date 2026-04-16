(function() {
    'use strict';

    const BREAKPOINT = 900;

    function initNav() {
        const navToggle = document.querySelector('.nav-toggle');
        const nav = document.querySelector('.nav');
        const body = document.body;
        let scrollY = 0;

        function closeMenu(restoreScroll) {
            nav?.classList.remove('active');
            navToggle?.classList.remove('active');
            body.classList.remove('menu-open');
            if (restoreScroll !== false && scrollY) {
                window.scrollTo(0, scrollY);
                scrollY = 0;
            }
        }

        function openMenu() {
            scrollY = window.scrollY || window.pageYOffset;
            nav?.classList.add('active');
            navToggle?.classList.add('active');
            body.classList.add('menu-open');
        }

        navToggle?.addEventListener('click', () => {
            nav?.classList.contains('active') ? closeMenu() : openMenu();
        });

        nav?.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link) {
                const href = link.getAttribute('href');
                if (href && href.startsWith('#') && href !== '#') {
                    e.preventDefault();
                    closeMenu(false);
                    const target = document.querySelector(href);
                    if (target) {
                        requestAnimationFrame(() => {
                            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        });
                    }
                } else {
                    closeMenu();
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (nav?.classList.contains('active') && !nav.contains(e.target) && !navToggle?.contains(e.target)) {
                closeMenu();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > BREAKPOINT) closeMenu();
        });

        window.addEventListener('orientationchange', () => {
            if (window.innerWidth > BREAKPOINT) closeMenu();
        });
    }

    function initScroll() {
        const header = document.querySelector('.header');
        const navLinks = document.querySelectorAll('.nav a[href^="#"]');
        const backToTop = document.querySelector('.back-to-top');
        const sections = document.querySelectorAll('section[id]');

        function onScroll() {
            const y = window.scrollY;

            if (y > 20) {
                header?.classList.add('scrolled');
            } else {
                header?.classList.remove('scrolled');
            }

            if (backToTop) {
                if (y > 400) {
                    backToTop.classList.add('visible');
                } else {
                    backToTop.classList.remove('visible');
                }
            }

            let current = '';
            const offset = 150;
            sections.forEach(section => {
                const top = section.offsetTop - offset;
                const height = section.offsetHeight;
                if (y >= top && y < top + height) {
                    current = section.getAttribute('id');
                }
            });

            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.getAttribute('href') === '#' + current) {
                    link.classList.add('active');
                }
            });
        }

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href === '#') return;
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        backToTop?.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    function initScrollReveal() {
        const sections = document.querySelectorAll('.section');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        sections.forEach(section => observer.observe(section));
    }

    function initLightbox() {
        const gallery = document.querySelector('.gallery');
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = lightbox?.querySelector('.lightbox-img');
        const lightboxCounter = lightbox?.querySelector('.lightbox-counter');
        const body = document.body;

        if (!gallery || !lightbox || !lightboxImg) return;

        const images = Array.from(gallery.querySelectorAll('.gallery-img'));
        if (!images.length) return;

        let currentIndex = 0;

        function updateImage() {
            const img = images[currentIndex];
            lightboxImg.src = img.src;
            lightboxImg.alt = img.alt;
            lightboxCounter.textContent = `${currentIndex + 1} / ${images.length}`;
        }

        function open(index) {
            currentIndex = index;
            updateImage();
            lightbox.classList.add('active');
            lightbox.setAttribute('aria-hidden', 'false');
            body.classList.add('lightbox-open');
        }

        function close() {
            lightbox.classList.remove('active');
            lightbox.setAttribute('aria-hidden', 'true');
            body.classList.remove('lightbox-open');
        }

        function prev() {
            currentIndex = (currentIndex - 1 + images.length) % images.length;
            updateImage();
        }

        function next() {
            currentIndex = (currentIndex + 1) % images.length;
            updateImage();
        }

        gallery.addEventListener('click', (e) => {
            const img = e.target.closest('.gallery-img');
            if (img) {
                const index = images.indexOf(img);
                if (index !== -1) open(index);
            }
        });

        lightbox.querySelector('.lightbox-close')?.addEventListener('click', close);
        lightbox.querySelector('.lightbox-prev')?.addEventListener('click', (e) => {
            e.stopPropagation();
            prev();
        });
        lightbox.querySelector('.lightbox-next')?.addEventListener('click', (e) => {
            e.stopPropagation();
            next();
        });

        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) close();
        });

        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'ArrowLeft') prev();
            if (e.key === 'ArrowRight') next();
        });

        let touchStartX = 0;
        lightbox.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });
        lightbox.addEventListener('touchend', (e) => {
            const diff = touchStartX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) diff > 0 ? next() : prev();
        }, { passive: true });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('lightbox')?.classList.contains('active')) {
            document.querySelector('.lightbox-close')?.click();
        } else if (document.querySelector('.nav')?.classList.contains('active')) {
            document.querySelector('.nav-toggle')?.click();
        }
    });

    function initNews() {
        const container = document.getElementById('news-container');
        if (!container) return;
        function render(items) {
            container.innerHTML = '';
            if (!items.length) {
                container.innerHTML = '<p class="news-placeholder">Новостей пока нет.</p>';
                return;
            }
            items.forEach(item => {
                const el = document.createElement('div');
                el.className = 'news-item';
                const link = item.link ? '<a href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener" class="news-vk-link">Читать во ВКонтакте</a>' : '';
                const title = item.title ? '<div class="news-title">' + escapeHtml(item.title) + '</div>' : '';

                const attachments = Array.isArray(item.attachments) ? item.attachments : [];
                const images = attachments.filter(a => (a.type || '').startsWith('image/'));
                const files = attachments.filter(a => !(a.type || '').startsWith('image/'));

                const imagesHtml = images.length
                    ? '<div class="news-images">' + images.map(a => (
                        '<a class="news-image-link" href="' + escapeHtml(a.url) + '" target="_blank" rel="noopener">' +
                        '<img class="news-image" src="' + escapeHtml(a.url) + '" alt="' + escapeHtml(a.name || 'Фото') + '" loading="lazy">' +
                        '</a>'
                    )).join('') + '</div>'
                    : '';

                const filesHtml = files.length
                    ? '<div class="news-files">' + files.map(a => (
                        '<a class="news-file" href="' + escapeHtml(a.url) + '" target="_blank" rel="noopener">' +
                        escapeHtml(a.name || a.url) +
                        '</a>'
                    )).join('') + '</div>'
                    : '';

                el.innerHTML =
                    '<span class="news-date">' + escapeHtml(item.date) + '</span>' +
                    title +
                    '<p>' + escapeHtml(item.content) + '</p>' +
                    imagesHtml +
                    filesHtml +
                    link;
                container.appendChild(el);
            });
        }
        fetch('/api/vk-news')
            .then(r => r.ok ? r.json() : [])
            .then(items => {
                if (items.length >= 3) {
                    render(items);
                } else {
                    return fetch('/api/news').then(r => r.ok ? r.json() : []).then(render);
                }
            })
            .catch(() => fetch('/api/news').then(r => r.ok ? r.json() : []).then(render).catch(() => render([])));
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function initGalleryMore() {
        const gallery = document.getElementById('gallery');
        const btn = document.getElementById('gallery-more');
        if (!gallery || !btn) return;
        const images = gallery.querySelectorAll('.gallery-img');
        if (images.length <= 6) return;
        btn.addEventListener('click', () => {
            const expanded = gallery.classList.toggle('expanded');
            btn.textContent = expanded ? 'Свернуть' : 'Смотреть ещё';
            btn.setAttribute('aria-label', expanded ? 'Скрыть фото' : 'Показать ещё фото');
        });
    }

    function initCopyrightYear() {
        const el = document.getElementById('copyright-year');
        if (el) el.textContent = new Date().getFullYear();
    }

    function initSiteTracking() {
        try {
            const key = 'otechestvo-visitor-id';
            let visitorId = localStorage.getItem(key);
            if (!visitorId) {
                visitorId = (window.crypto && typeof window.crypto.randomUUID === 'function')
                    ? window.crypto.randomUUID()
                    : `v_${Math.random().toString(16).slice(2)}_${Date.now()}`;
                localStorage.setItem(key, visitorId);
            }

            // Tracks “home view” once per visitor per day (server side deduplicates).
            fetch('/api/track/view', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ visitorId, page: 'home' })
            }).catch(() => {});
        } catch {
            // ignore tracking errors
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initCopyrightYear();
        initSiteTracking();
        initNav();
        initScroll();
        initScrollReveal();
        initLightbox();
        initNews();
        initGalleryMore();
    });
})();
