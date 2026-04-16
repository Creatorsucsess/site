(function() {
    'use strict';

    const API = '';

    const loginScreen = document.getElementById('login-screen');
    const adminApp = document.getElementById('admin-app');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');

    const pageTitle = document.getElementById('page-title');
    const addNewsBtn = document.getElementById('add-news-btn');

    const sidebarNavItems = Array.from(document.querySelectorAll('.sidebar-nav .nav-item[data-page]'));
    const pageNews = document.getElementById('page-news');
    const pageStats = document.getElementById('page-stats');

    const newsList = document.getElementById('news-list');
    const newsEmpty = document.getElementById('news-empty');
    const newsSearch = document.getElementById('news-search');
    const newsStatusFilter = document.getElementById('news-status-filter');
    const refreshNewsBtn = document.getElementById('refresh-news-btn');

    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const newsForm = document.getElementById('news-form');
    const newsIdInput = document.getElementById('news-id');
    const newsDateInput = document.getElementById('news-date');
    const newsTitleInput = document.getElementById('news-title');
    const newsStatusInput = document.getElementById('news-status');
    const newsContentInput = document.getElementById('news-content');

    const toast = document.getElementById('toast');

    const statTotalViews = document.getElementById('stat-total-views');
    const statTodayViews = document.getElementById('stat-today-views');
    const statUniqueVisitors = document.getElementById('stat-unique-visitors');

    const statNewsTotal = document.getElementById('stat-news-total');
    const statNewsPublished = document.getElementById('stat-news-published');
    const statNewsDrafts = document.getElementById('stat-news-drafts');

    const viewsChart = document.getElementById('views-chart');
    const newsChart = document.getElementById('news-chart');
    const statsRecentNews = document.getElementById('stats-recent-news');

    let lastStatsLoadAt = 0;
    let newsReloadTimer = null;

    async function api(path, options = {}) {
        const res = await fetch(API + path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'same-origin'
        });
        const data = res.ok ? await res.json().catch(() => ({})) : null;
        if (!res.ok) throw new Error(data?.error || 'Ошибка запроса');
        return data;
    }

    function showToast(msg, type = '') {
        if (!toast) return;
        toast.textContent = msg;
        toast.className = 'toast show ' + type;
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = String(s ?? '');
        return div.innerHTML;
    }

    function formatRuDateToToday() {
        const d = new Date();
        return [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('.');
    }

    function setPage(page) {
        const isNews = page === 'news';
        pageNews?.classList.toggle('hidden', !isNews);
        pageStats?.classList.toggle('hidden', isNews);

        sidebarNavItems.forEach(item => item.classList.toggle('active', item.dataset.page === page));

        if (pageTitle) pageTitle.textContent = isNews ? 'Новости' : 'Статистика';
        if (addNewsBtn) addNewsBtn.classList.toggle('hidden', !isNews);
    }

    async function loadNews() {
        try {
            const items = await api('/api/news?all=1');
            const q = (newsSearch?.value || '').trim().toLowerCase();
            const statusFilter = newsStatusFilter?.value || 'all';

            const filtered = items.filter(item => {
                const title = (item.title || '').toLowerCase();
                const content = (item.content || '').toLowerCase();
                const matchesQuery = !q || title.includes(q) || content.includes(q);
                const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
                return matchesQuery && matchesStatus;
            });

            newsList.innerHTML = '';
            newsEmpty?.classList.toggle('hidden', filtered.length > 0);

            filtered.forEach(item => {
                const status = item.status === 'draft' ? 'draft' : 'published';
                const badgeClass = status === 'draft' ? 'badge-draft' : 'badge-published';
                const badgeText = status === 'draft' ? 'Черновик' : 'Опубликовано';
                const toggleText = status === 'draft' ? 'Опубликовать' : 'В черновик';

                const card = document.createElement('div');
                card.className = 'news-card';
                card.innerHTML = `
                    <div class="news-card-body">
                        <div class="news-card-top">
                            <span class="news-card-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
                        </div>
                        ${item.title ? `<div class="news-card-title">${escapeHtml(item.title)}</div>` : ''}
                        <div class="news-card-date">${escapeHtml(item.date)}</div>
                        <div class="news-card-content">${escapeHtml((item.content || '').slice(0, 900))}</div>
                    </div>
                    <div class="news-card-actions">
                        <button type="button" class="btn btn-secondary publish-btn" data-id="${escapeHtml(item.id)}" data-status="${escapeHtml(status)}">${escapeHtml(toggleText)}</button>
                        <button type="button" class="btn btn-secondary edit-btn" data-id="${escapeHtml(item.id)}">Изменить</button>
                        <button type="button" class="btn btn-danger delete-btn" data-id="${escapeHtml(item.id)}">Удалить</button>
                    </div>
                `;
                newsList.appendChild(card);
            });

            newsList.querySelectorAll('.edit-btn').forEach(btn => {
                btn.addEventListener('click', () => openEdit(btn.dataset.id));
            });
            newsList.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', () => deleteNews(btn.dataset.id));
            });
            newsList.querySelectorAll('.publish-btn').forEach(btn => {
                btn.addEventListener('click', () => togglePublish(btn.dataset.id, btn.dataset.status));
            });
        } catch (err) {
            showToast('Не удалось загрузить новости', 'error');
        }
    }

    function openAddModal() {
        modal.classList.remove('hidden');
        modalTitle.textContent = 'Добавить новость';
        newsIdInput.value = '';
        newsDateInput.value = formatRuDateToToday();
        newsTitleInput.value = '';
        newsStatusInput.value = 'published';
        newsContentInput.value = '';
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    async function openEdit(id) {
        const items = await api('/api/news?all=1');
        const item = items.find(n => n.id === id);
        if (!item) return;

        modalTitle.textContent = 'Редактировать новость';
        newsIdInput.value = item.id;
        newsDateInput.value = item.date;
        newsTitleInput.value = item.title || '';
        newsStatusInput.value = item.status === 'draft' ? 'draft' : 'published';
        newsContentInput.value = item.content || '';

        modal.classList.remove('hidden');
    }

    async function deleteNews(id) {
        if (!confirm('Удалить эту новость?')) return;
        try {
            await api(`/api/news/${id}`, { method: 'DELETE' });
            showToast('Новость удалена', 'success');
            loadNews();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    async function togglePublish(id, currentStatus) {
        try {
            const newStatus = currentStatus === 'draft' ? 'published' : 'draft';
            await api(`/api/news/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus })
            });
            showToast('Статус обновлён', 'success');
            loadNews();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    newsForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = newsIdInput.value;
        const date = newsDateInput.value.trim();
        const title = newsTitleInput.value.trim();
        const status = newsStatusInput.value;
        const content = newsContentInput.value.trim();
        if (!date || !content) return;

        try {
            if (id) {
                await api(`/api/news/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ date, title, content, status })
                });
                showToast('Новость обновлена', 'success');
            } else {
                await api('/api/news', {
                    method: 'POST',
                    body: JSON.stringify({ date, title, content, status })
                });
                showToast('Новость добавлена', 'success');
            }

            closeModal();
            loadNews();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });

    modal?.querySelector('.modal-backdrop')?.addEventListener('click', closeModal);
    modal?.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal?.querySelector('.modal-cancel')?.addEventListener('click', closeModal);

    addNewsBtn?.addEventListener('click', () => openAddModal());

    // Toolbar events
    if (newsSearch) {
        newsSearch.addEventListener('input', () => {
            clearTimeout(newsReloadTimer);
            newsReloadTimer = setTimeout(() => loadNews(), 250);
        });
    }
    newsStatusFilter?.addEventListener('change', () => loadNews());
    refreshNewsBtn?.addEventListener('click', () => loadNews());

    async function loadStats() {
        try {
            const stats = await api('/api/stats');

            statTotalViews.textContent = String(stats.views.totalViews ?? 0);
            statTodayViews.textContent = String(stats.views.todayViews ?? 0);
            statUniqueVisitors.textContent = String(stats.views.uniqueVisitors ?? 0);

            statNewsTotal.textContent = String(stats.news.total ?? 0);
            statNewsPublished.textContent = String(stats.news.published ?? 0);
            statNewsDrafts.textContent = String(stats.news.drafts ?? 0);

            const last7 = stats.views.last7 || [];
            const counts7 = last7.map(d => Number(d.count || 0));
            const max7 = Math.max(...counts7, 1);
            const barMax7 = 80;
            viewsChart.innerHTML = last7.map((d) => {
                const count = Number(d.count || 0);
                const h = Math.max(count === 0 ? 2 : Math.round((count / max7) * barMax7), 2);
                const label = d.date ? d.date.slice(5) : '';
                return `
                    <div class="chart-item" title="${escapeHtml(d.date)}: ${escapeHtml(count)}">
                        <div class="chart-bar" style="height:${h}px"></div>
                        <div class="chart-date">${escapeHtml(label)}</div>
                    </div>
                `;
            }).join('');

            const last14 = stats.news.last14Published || [];
            const counts14 = last14.map(d => Number(d.count || 0));
            const max14 = Math.max(...counts14, 1);
            const barMax14 = 70;
            newsChart.innerHTML = last14.map((d, idx) => {
                const count = Number(d.count || 0);
                const h = Math.max(count === 0 ? 2 : Math.round((count / max14) * barMax14), 2);
                const label = d.date ? d.date.slice(5) : '';
                return `
                    <div class="chart-item" title="${escapeHtml(d.date)}: ${escapeHtml(count)}">
                        <div class="chart-bar" style="height:${h}px"></div>
                        <div class="chart-date">${idx % 2 === 0 ? escapeHtml(label) : ''}</div>
                    </div>
                `;
            }).join('');

            const recent = stats.recentNews || [];
            statsRecentNews.innerHTML = recent.length
                ? recent.map(n => `
                    <div class="recent-news-item">
                        <div class="date">${escapeHtml(n.date)}</div>
                        <div class="title">${escapeHtml(n.title || 'Без заголовка')}</div>
                        <div class="preview">${escapeHtml(n.content || '')}</div>
                    </div>
                `).join('')
                : `<div class="recent-news-item">Нет публикаций.</div>`;

            lastStatsLoadAt = Date.now();
        } catch (err) {
            showToast('Не удалось загрузить статистику', 'error');
        }
    }

    sidebarNavItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page || 'news';
            setPage(page);
            if (page === 'stats') loadStats();
            if (page === 'news') loadNews();
        });
    });

    async function checkAuth() {
        try {
            const { admin } = await api('/api/admin/check');
            if (admin) {
                loginScreen?.classList.add('hidden');
                adminApp?.classList.remove('hidden');
                setPage('news');
                loadNews();
                return;
            }
        } catch {}
        loginScreen?.classList.remove('hidden');
        adminApp?.classList.add('hidden');
    }

    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (loginError) loginError.textContent = '';
        const password = loginForm.password.value;
        try {
            const res = await fetch(API + '/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ password })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка входа');
            loginScreen.classList.add('hidden');
            adminApp.classList.remove('hidden');
            setPage('news');
            loadNews();
        } catch (err) {
            if (loginError) loginError.textContent = err.message;
        }
    });

    logoutBtn?.addEventListener('click', async () => {
        try {
            await api('/api/admin/logout', { method: 'POST' });
            loginScreen?.classList.remove('hidden');
            adminApp?.classList.add('hidden');
        } catch {}
    });

    checkAuth();
})();
