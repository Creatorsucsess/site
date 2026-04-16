# АНО ДОВ ЦДНВ «Отечество»

## Запуск локально

1. `npm install`
2. `npm start`
3. Сайт: http://localhost:3000  
   Админка: http://localhost:3000/admin.html

Пароль: `admin123` (или `ADMIN_PASSWORD=... npm start`)  
Новости из ВК: `VK_ACCESS_TOKEN=... npm start`

---

## Публикация на GitHub

### 1. Создать репозиторий

На github.com → New repository → имя `otechestvo-site`

### 2. Загрузить код

```bash
cd "сайтновый"
git init
git add .
git commit -m "Первый коммит"
git branch -M main
git remote add origin https://github.com/ВАШ_ЛОГИН/otechestvo-site.git
git push -u origin main
```

### 3. Варианты размещения

**GitHub Pages** (только статика, без админки и API):
- Settings → Pages → Source: main, / (root)
- Сайт: `https://ВАШ_ЛОГИН.github.io/otechestvo-site/`

**Render.com** (полный сайт с админкой):
- New → Web Service → подключить репозиторий
- Build: `npm install` | Start: `npm start`
- Добавить переменные: `ADMIN_PASSWORD`, `VK_ACCESS_TOKEN`
