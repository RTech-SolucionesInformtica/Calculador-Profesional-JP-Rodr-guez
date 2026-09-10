// ============================================
// CONFIGURACIÓN TÉCNICA E INGENIERÍA ELÉCTRICA
// ============================================

const STORAGE_KEY = 'aea_proyectos_v1';

// TENSIONES CORREGIDAS SEGÚN REGLAMENTACIÓN AEA (ARGENTINA)
const TENSIONES = {
  monofasico: 220,
  bifasico: 220,
  trifasico: 380 // Voltaje de línea real para sistemas 3φ (Fase-Fase)
};

// CORREGIDO: los disyuntores ahora usan la serie normalizada IEC 60898
// (10-16-20-25-32-40-50-63-80-100-125-160-200A). Los valores 15A y 30A
// del original no existen como térmicas comerciales.
const CONDUCTORES_AEA = [
  { amperios: 10, mm2: 1.5, disyuntor: 10 },
  { amperios: 16, mm2: 2.5, disyuntor: 16 },
  { amperios: 20, mm2: 2.5, disyuntor: 20 },
  { amperios: 32, mm2: 4, disyuntor: 32 },
  { amperios: 40, mm2: 6, disyuntor: 40 },
  { amperios: 50, mm2: 10, disyuntor: 50 },
  { amperios: 63, mm2: 10, disyuntor: 63 },
  { amperios: 80, mm2: 16, disyuntor: 80 },
  { amperios: 100, mm2: 25, disyuntor: 100 },
  { amperios: 125, mm2: 35, disyuntor: 125 },
  { amperios: 160, mm2: 50, disyuntor: 160 },
  { amperios: 200, mm2: 70, disyuntor: 200 }
];

// NUEVO: secciones mínimas exigidas por la AEA 90364 según tipo de
// circuito, independientemente de la corriente que dé el cálculo.
// TUG (tomas de uso general): mín. 2.5mm²/20A.
// TUE (circuitos especiales - cocina, lavarropas, calefacción, etc.): mín. 4mm²/25A.
// Verificar siempre contra la tabla AEA vigente según el método de instalación real.
const MINIMOS_AEA = {
  'Iluminación': { mm2: 1.5, disyuntor: 10 },
  'Tomacorriente': { mm2: 2.5, disyuntor: 20 },
  'Cocina/Comedor': { mm2: 4, disyuntor: 25 },
  'Lavarropas': { mm2: 4, disyuntor: 25 },
  'Aire Acondicionado': { mm2: 4, disyuntor: 25 },
  'Calefactor': { mm2: 4, disyuntor: 25 },
  'Calentador de agua': { mm2: 4, disyuntor: 25 }
};

const RHO_COBRE = 0.0175;

let proyectoActual = {
  tipoSistema: '',
  potenciaTotal: 0,
  factorPotencia: 0.95,
  longitudPrincipal: 20,
  circuitos: []
};

function calcularCorriente(potenciaKW, sistema, factorPotencia = 0.95) {
  const P = potenciaKW * 1000;
  const U = TENSIONES[sistema];
  const cosφ = factorPotencia;
  
  let I;
  if (sistema === 'trifasico') {
    I = P / (U * cosφ * Math.sqrt(3)); // Fórmula trifásica balanceada AEA
  } else {
    I = P / (U * cosφ);
  }
  
  return parseFloat(I.toFixed(2));
}

function encontrarConductor(corriente) {
  for (let i = 0; i < CONDUCTORES_AEA.length; i++) {
    if (corriente <= CONDUCTORES_AEA[i].amperios) {
      return {
        mm2: CONDUCTORES_AEA[i].mm2,
        disyuntor: CONDUCTORES_AEA[i].disyuntor,
        amperios: CONDUCTORES_AEA[i].amperios
      };
    }
  }
  return { mm2: '>70', disyuntor: '>200', amperios: Infinity };
}

// NUEVO: fuerza la sección/térmica mínima según el tipo de circuito
// (AEA exige mínimos por tipo, sin importar cuán baja sea la potencia declarada).
function aplicarMinimoAEA(tipoCircuito, conductorCalculado) {
  const minimo = MINIMOS_AEA[tipoCircuito];
  if (!minimo || conductorCalculado.mm2 === '>70') return conductorCalculado;

  return {
    mm2: Math.max(conductorCalculado.mm2, minimo.mm2),
    disyuntor: Math.max(conductorCalculado.disyuntor, minimo.disyuntor),
    amperios: Math.max(conductorCalculado.amperios, minimo.disyuntor)
  };
}

function calcularCaidaTension(corriente, longitud, mm2, sistema) {
  if (mm2 === '>70') return 0;
  
  let caida;
  if (sistema === 'trifasico') {
    caida = (Math.sqrt(3) * RHO_COBRE * longitud * corriente) / mm2;
  } else {
    caida = (2 * RHO_COBRE * longitud * corriente) / mm2;
  }
  
  return parseFloat(caida.toFixed(2));
}

function calcularPorcentajeCaida(caidaV, sistema) {
  const U = TENSIONES[sistema];
  return parseFloat(((caidaV / U) * 100).toFixed(2));
}

function validarCaida(porcentajeCaida, maxPermitido) {
  return porcentajeCaida <= maxPermitido;
}

function guardarProyecto() {
  // En algunos navegadores (ej. Safari con Navegación Privada, o modos
  // restringidos en Android) localStorage puede no estar disponible y
  // tirar una excepción. Sin este try/catch, toda la app dejaba de
  // responder al configurar el sistema o agregar un circuito.
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(proyectoActual));
  } catch (err) {
    console.warn('No se pudo guardar el proyecto (almacenamiento no disponible):', err);
  }
}

function cargarProyecto() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      proyectoActual = JSON.parse(data);
      return true;
    }
  } catch (err) {
    console.warn('No se pudo cargar el proyecto guardado:', err);
  }
  return false;
}

function renderResumenTablero() {
  const panel = document.getElementById('panelTablero');
  const resumen = document.getElementById('resumenTablero');
  
  if (!proyectoActual.tipoSistema) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  
  const corrientePrincipal = calcularCorriente(
    proyectoActual.potenciaTotal,
    proyectoActual.tipoSistema,
    proyectoActual.factorPotencia
  );
  
  const conductor = encontrarConductor(corrientePrincipal);
  const caidaV = calcularCaidaTension(corrientePrincipal, proyectoActual.longitudPrincipal, conductor.mm2, proyectoActual.tipoSistema);
  const caidaPorcentaje = calcularPorcentajeCaida(caidaV, proyectoActual.tipoSistema);
  
  resumen.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">Sistema:</span><span class="value">${proyectoActual.tipoSistema.toUpperCase()}</span></div>
      <div class="stat"><span class="label">Potencia:</span><span class="value">${proyectoActual.potenciaTotal} kW</span></div>
      <div class="stat"><span class="label">Corriente I:</span><span class="value">${corrientePrincipal} A</span></div>
      <div class="stat"><span class="label">Cable:</span><span class="value">${conductor.mm2} mm²</span></div>
      <div class="stat"><span class="label">Térmica:</span><span class="value">${conductor.disyuntor} A</span></div>
      <div class="stat"><span class="label">Caída:</span><span class="value">${caidaV}V (${caidaPorcentaje}%)</span></div>
    </div>
  `;
}

function agregarCircuito(event) {
  event.preventDefault();
  
  if (!proyectoActual.tipoSistema) {
    alert('⚠️ Primero debe configurar el sistema');
    return;
  }
  
  const tipoCircuito = document.getElementById('tipoCircuito').value;
  const ambiente = document.getElementById('ambiente').value.trim();
  const potenciaCircuito = Number(document.getElementById('potenciaCircuito').value);
  const longitud = Number(document.getElementById('longitud').value);
  const caidaMaxima = Number(document.getElementById('caida').value);
  
  if (!tipoCircuito || !ambiente || !potenciaCircuito || !longitud) {
    alert('⚠️ Completa todos los campos');
    return;
  }
  
  // CORREGIDO: usa el factor de potencia configurado por el usuario,
  // antes quedaba fijo en 0.95 sin importar lo que se configurara.
  const corriente = calcularCorriente(potenciaCircuito, proyectoActual.tipoSistema, proyectoActual.factorPotencia);
  let conductor = encontrarConductor(corriente);

  // CORREGIDO: aplica la sección/térmica mínima exigida por AEA según
  // el tipo de circuito (tomas, cocina, lavarropas, etc.), aunque la
  // corriente calculada hubiera alcanzado con un cable más chico.
  conductor = aplicarMinimoAEA(tipoCircuito, conductor);

  // La caída de tensión se recalcula con el conductor definitivo
  // (puede haber cambiado de tamaño al aplicar el mínimo AEA).
  const caidaV = calcularCaidaTension(corriente, longitud, conductor.mm2, proyectoActual.tipoSistema);
  const caidaPorcentaje = calcularPorcentajeCaida(caidaV, proyectoActual.tipoSistema);
  
  const circuito = {
    id: Date.now(),
    tipoCircuito,
    ambiente,
    potenciaCircuito,
    longitud,
    caidaMaxima,
    corriente,
    conductor: conductor.mm2,
    disyuntor: conductor.disyuntor,
    caidaV,
    caidaPorcentaje,
    valido: validarCaida(caidaPorcentaje, caidaMaxima)
  };
  
  proyectoActual.circuitos.push(circuito);
  guardarProyecto();
  renderTablaCircuitos();
  
  crearExplosionEnClick(event.clientX, event.clientY);
  document.getElementById('circuitForm').reset();
}

function eliminarCircuito(id) {
  if (confirm('¿Eliminar este circuito?')) {
    proyectoActual.circuitos = proyectoActual.circuitos.filter(c => c.id !== id);
    guardarProyecto();
    renderTablaCircuitos();
  }
}

function renderTablaCircuitos() {
  const tbody = document.querySelector('#circuitsTable tbody');
  const emptyState = document.getElementById('emptyState');
  const resumenBox = document.getElementById('resumenCircuitos');
  
  tbody.innerHTML = '';
  
  if (proyectoActual.circuitos.length === 0) {
    emptyState.style.display = 'block';
    resumenBox.innerHTML = '<p style="text-align:center;opacity:0.7">Agrega circuitos para ver el resumen</p>';
    return;
  }
  
  emptyState.style.display = 'none';
  
  proyectoActual.circuitos.forEach(circuito => {
    const tr = document.createElement('tr');
    const estadoClass = circuito.valido ? 'valido' : 'invalido';
    
    tr.innerHTML = `
      <td>${circuito.tipoCircuito}</td>
      <td>${circuito.ambiente}</td>
      <td>${circuito.potenciaCircuito}</td>
      <td>${circuito.corriente}</td>
      <td><strong>${circuito.conductor} mm²</strong></td>
      <td>${circuito.disyuntor} A</td>
      <td class="${estadoClass}">${circuito.caidaV}V (${circuito.caidaPorcentaje}%)</td>
      <td>
        <button data-id="${circuito.id}" class="btn-delete" title="Eliminar">🗑</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  renderResumenTotal();
}

function renderResumenTotal() {
  const resumenBox = document.getElementById('resumenCircuitos');
  
  const totalPotencia = proyectoActual.circuitos.reduce((sum, c) => sum + c.potenciaCircuito, 0);
  const totalCorriente = proyectoActual.circuitos.reduce((sum, c) => sum + c.corriente, 0);
  const circuitosValidos = proyectoActual.circuitos.filter(c => c.valido).length;
  const circuitosTotal = proyectoActual.circuitos.length;
  
  const advertencia = circuitosValidos < circuitosTotal 
    ? `⚠️ ${circuitosTotal - circuitosValidos} circuito(s) con caída excesiva` 
    : '✓ Todos los circuitos cumplen normativa AEA';
  
  resumenBox.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">Total Circuitos:</span><span class="value">${circuitosTotal}</span></div>
      <div class="stat"><span class="label">Potencia total:</span><span class="value">${totalPotencia.toFixed(2)} kW</span></div>
      <div class="stat"><span class="label">Corriente Total:</span><span class="value">${totalCorriente.toFixed(2)} A</span></div>
      <div class="stat" style="grid-column: 1/-1;"><span class="label">${advertencia}</span></div>
    </div>
  `;
}

function exportarPDF() { window.print(); }

function limpiarTodo() {
  if (confirm('¿Eliminar todo el proyecto? Esta acción no se puede deshacer.')) {
    proyectoActual = { tipoSistema: '', potenciaTotal: 0, factorPotencia: 0.95, longitudPrincipal: 20, circuitos: [] };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('No se pudo limpiar el almacenamiento:', err);
    }
    location.reload();
  }
}

function configurarSistema() {
  const tipoSistema = document.getElementById('tipoSistema').value;
  const potenciaTotal = Number(document.getElementById('potenciaTotal').value);
  const factorPotencia = Number(document.getElementById('factorPotencia').value);
  const longitudPrincipal = Number(document.getElementById('longitudPrincipal').value) || 20;
  
  if (!tipoSistema || !potenciaTotal) {
    alert('⚠️ Completa los datos obligatorios');
    return;
  }

  // CORREGIDO: un factor de potencia 0, negativo o mayor a 1 rompía
  // el cálculo (corriente infinita o negativa) sin ningún aviso.
  if (!factorPotencia || factorPotencia <= 0 || factorPotencia > 1) {
    alert('⚠️ El factor de potencia (cos φ) debe ser mayor a 0 y menor o igual a 1');
    return;
  }
  
  proyectoActual.tipoSistema = tipoSistema;
  proyectoActual.potenciaTotal = potenciaTotal;
  proyectoActual.factorPotencia = factorPotencia;
  proyectoActual.longitudPrincipal = longitudPrincipal;
  
  guardarProyecto();
  renderResumenTablero();
  alert('✓ Sistema configurado correctamente');
}

function initApp() {
  cargarProyecto();
  if (proyectoActual.tipoSistema) {
    document.getElementById('tipoSistema').value = proyectoActual.tipoSistema;
    document.getElementById('potenciaTotal').value = proyectoActual.potenciaTotal;
    document.getElementById('factorPotencia').value = proyectoActual.factorPotencia;
    document.getElementById('longitudPrincipal').value = proyectoActual.longitudPrincipal;
    renderResumenTablero();
    renderTablaCircuitos();
  }
  
  document.getElementById('btnConfigurar').addEventListener('click', configurarSistema);
  document.getElementById('circuitForm').addEventListener('submit', agregarCircuito);
  document.getElementById('btnLimpiarForm').addEventListener('click', () => document.getElementById('circuitForm').reset());
  document.getElementById('btnExport').addEventListener('click', exportarPDF);
  document.getElementById('btnLimpiarTodo').addEventListener('click', limpiarTodo);
  
  // Borrado tolerante a clicks utilizando .closest() para evitar fallos por emojis internos
  document.addEventListener('click', (e) => {
    const targetBoton = e.target.closest('.btn-delete');
    if (targetBoton) {
      const id = Number(targetBoton.dataset.id);
      eliminarCircuito(id);
    }
  });
}

// ============================================
// SISTEMA DE EFECTOS MOUSE: ARCOS VOLTAICOS AMARILLOS
// ============================================
class ElectricMouse {
  constructor() {
    this.mouseX = 0;
    this.mouseY = 0;
    this.lastSparkTime = 0;
    this.sparkInterval = 40; // ms entre ráfagas
    // Respeta la preferencia de accesibilidad "reducir movimiento" y de
    // paso alivia el rendimiento en celulares de gama baja, donde generar
    // chispas en cada movimiento/click puede sentirse lento o trabado.
    this.motionReducido = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.init();
  }

  init() {
    if (this.motionReducido) return;
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('click', (e) => this.onMouseClick(e));
  }

  onMouseMove(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    
    const now = Date.now();
    if (now - this.lastSparkTime > this.sparkInterval) {
      if (Math.random() > 0.4) {
        this.crearChispaRayo(this.mouseX, this.mouseY);
      }
      this.lastSparkTime = now;
    }
  }

  onMouseClick(e) {
    if (this.motionReducido) return;
    const cantidadChispas = 10;
    for (let i = 0; i < cantidadChispas; i++) {
      this.crearChispaRayo(e.clientX, e.clientY);
    }
  }

  crearChispaRayo(x, y) {
    const spark = document.createElement('div');
    spark.className = 'spark';
    
    const width = Math.random() * 16 + 6;
    const height = Math.random() * 2 + 1;
    spark.style.width = width + 'px';
    spark.style.height = height + 'px';
    
    spark.style.left = x + 'px';
    spark.style.top = y + 'px';
    
    const angulo = Math.random() * Math.PI * 2;
    const distancia = Math.random() * 90 + 40;
    const tx = Math.cos(angulo) * distancia;
    const ty = Math.sin(angulo) * distancia;
    
    // Fijamos las variables que procesará la animación del CSS de forma asíncrona
    spark.style.setProperty('--tx', tx + 'px');
    spark.style.setProperty('--ty', ty + 'px');
    
    // Pasamos la rotación inicial calculada en grados combinada
    const deg = (angulo * 180) / Math.PI;
    spark.style.setProperty('--rot', deg + 'deg');
    spark.style.transform = `rotate(${deg}deg)`;
    
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 400);
  }
}

// Única instancia global activa para toda la sesión de navegación
const electricMouse = new ElectricMouse();

// Solución al desborde de memoria: Reutiliza la instancia existente en lugar de instanciar un bucle
function crearExplosionEnClick(x, y) {
  const fakeClickEvent = { clientX: x, clientY: y };
  electricMouse.onMouseClick(fakeClickEvent);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initApp();
    } catch (err) {
      console.error('Error al iniciar la app:', err);
    }
  });
} else {
  try {
    initApp();
  } catch (err) {
    console.error('Error al iniciar la app:', err);
  }
}
