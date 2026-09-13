# ⚡ Calculadora Eléctrica Residencial

Herramienta web para dimensionar circuitos eléctricos residenciales: corriente de diseño, breaker recomendado, diferencial (GFCI/ID), calibre de conductor (mm² y AWG), caída de tensión y diagrama unifilar.

Es una app 100% estática (HTML + CSS + JS, sin dependencias ni backend), pensada para funcionar directamente en el navegador.

## 🚀 Ver la app online

Una vez publicada con GitHub Pages (ver más abajo), va a quedar disponible en:

```
https://<tu-usuario>.github.io/<nombre-del-repo>/
```

## 🖥️ Usar en local

No necesita instalación. Alcanza con abrir `index.html` en cualquier navegador:

```bash
git clone https://github.com/<tu-usuario>/<nombre-del-repo>.git
cd <nombre-del-repo>
# abrí index.html con doble clic, o:
open index.html      # macOS
xdg-open index.html  # Linux
start index.html     # Windows
```

## 🌐 Publicar con GitHub Pages

1. En el repositorio de GitHub, andá a **Settings → Pages**.
2. En **Source**, elegí la rama `main` y la carpeta `/ (root)`.
3. Guardá. En 1-2 minutos la app queda publicada en la URL de arriba.

## ✨ Funcionalidad

- Múltiples circuitos (pestañas), cada uno con sus propias cargas.
- Cálculo de potencia total, potencia efectiva (factor de demanda), corriente de diseño y caída de tensión.
- Selección de tipo de circuito (iluminación, tomacorrientes, húmeda, motor) con curva de breaker sugerida y aviso de diferencial GFCI/ID cuando corresponde.
- Diagrama unifilar generado en SVG.
- Resumen general del proyecto y exportación a PDF (impresión del navegador).

## ⚠️ Nota

Los valores calculados son de referencia orientativa y no reemplazan el cálculo de un electricista matriculado. Verificar siempre contra la reglamentación vigente (AEA/IRAM/NEC según el país) antes de instalar.

## 📄 Licencia

MIT — libre para usar, modificar y distribuir.
