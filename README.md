# Manusilva PWA

Progressive Web App mobile-first para gestão de empilhadores, manutenção e baterias.

## Estrutura

```
pwa/
├── index.html          Login (Técnico / RH)
├── dashboard.html      Dashboard do técnico (mobile)
├── admin.html          Dashboard RH (desktop)
├── css/app.css         Estilos
├── js/                 Módulos JavaScript (ES modules)
├── manifest.json       PWA manifest
└── sw.js               Service worker
```

## Executar localmente

```bash
cd pwa
python -m http.server 3456
```

Abrir: http://localhost:3456/index.html

## Credenciais demo

| Perfil   | Utilizador | Password   |
|----------|------------|------------|
| Técnico  | `tech`     | `tech123`  |
| RH/Admin | `admin`    | `admin123` |

Os dados são simulados em `localStorage` via `js/mock_data.js`.
