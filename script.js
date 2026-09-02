// ============================================
// CONFIGURACIÓN TÉCNICA E INGENIERÍA ELÉCTRICA
// ============================================

const STORAGE_KEY = 'aea_proyectos_v1';

const TENSIONES = {
  monofasico: 220,
  bifasico: 220,
  trifasico: 380 
};

const CONDUCTORES_AEA = [
  { amperios: 10, mm2: 1.5, disyuntor: 10 },
  { amperios: 15, mm2: 2.5, disyuntor: 15 },
  { amperios: 20, mm2: 2.5, disyuntor: 20 },
  { amperios: 30, mm2: 4, disyuntor: 30 },
  { amperios: 40, mm2: 6, disyuntor: 40 },
  { amperios: 50, mm2: 10, disyuntor: 50 },
  { amperios: 63, mm2: 10, disyuntor: 63 },
  { amperios: 80, mm2: 16, disyuntor: 80 },
  { amperios: 100, mm2: 25, disyuntor: 100 },
  { amperios: 125, mm2: 35, disyuntor: 125 },
  { amperios: 160, mm2: 50, disyuntor: 160 },
  { amperios: 200, mm2: 70, disyuntor: 200 }
];

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
    I = P / (U * cosφ * Math.sqrt(3));
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

function calcularCaidaTension(corriente, longitud, mm2, sistema) {
  if (mm2 === '>70' || !mm2) return 0;
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(proyectoActual));
}

function cargarProyecto() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    proyectoActual = JSON.parse(data);
    return true;
  }
  return false;
}

function renderResumenTablero() {
  const panel = document.getElementById('panelTablero');
  const resumen = document.getElementById('resumenTablero');
  if (!panel || !resumen) return;

  if (!proyectoActual.tipoSistema) {
    panel.style.display = 'none';
    return;
  }
  
  panel.style.display = 'block';
  const corrientePrincipal = calcularCorriente(proyectoActual.potenciaTotal, proyectoActual.tipoSistema, proyectoActual.factorPotencia);
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
  
  const corriente = calcularCorriente(potenciaCircuito, proyectoActual.tipoSistema, 0.95);
  const conductor = encontrarConductor(corriente);
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
  if (!tbody) return;
  
  tbody.innerHTML = '';
  if (proyectoActual.circuitos.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (resumenBox) resumenBox.innerHTML = '<p style="text-align:center;opacity:0.7">Agrega circuitos para ver el resumen</p>';
    return;
  }
  
  if (emptyState) emptyState.style.display = 'none';
  
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
      <td><button data-id="${circuito.id}" class="btn-delete" title="Eliminar">🗑</button></td>
    `;
    tbody.appendChild(tr);
  });
  renderResumenTotal();
}

function renderResumenTotal() {
  const resumenBox = document.getElementById('resumenCircuitos');
  if (!resumenBox) return;

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

function configurarSistema() {
  const tipoSistema = document.getElementById('tipoSistema').value;
  const potenciaTotal = Number(document.getElementById('potenciaTotal').value);
  const factorPotencia = Number(document.getElementById('factorPotencia').value);
  const longitudPrincipal = Number(document.getElementById('longitudPrincipal').value) || 20;
  
  if (!tipoSistema || !potenciaTotal) {
    alert('⚠️ Completa los datos obligatorios');
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
    if(document.getElementById('tipoSistema')) document.getElementById('tipoSistema').value = proyectoActual.tipoSistema;
    if(document.getElementById('potenciaTotal')) document.getElementById('potenciaTotal').value = proyectoActual.potenciaTotal;
    if(document.getElementById('factorPotencia')) document.getElementById('factorPotencia').value = proyectoActual.factorPotencia;
    if(document.getElementById('longitudPrincipal')) document.getElementById('longitudPrincipal').value = proyectoActual.longitudPrincipal;
    renderResumenTablero();
    renderTablaCircuitos();
  }
  
  document.getElementById('btnConfigurar')?.addEventListener('click', configurarSistema);
  document.getElementById('circuitForm')?.addEventListener('submit', agregarCircuito);
  document.getElementById('btnLimpiarForm')?.addEventListener('click', () => document.getElementById('circuitForm').reset());
  document.getElementById('btnExport')?.addEventListener('click', () => window.print());
  document.getElementById('btnLimpiarTodo')?.addEventListener('click', () => {
    if (confirm('¿Eliminar todo el proyecto?')) {
      proyectoActual = { tipoSistema: '', potenciaTotal: 0, factorPotencia: 0.95, longitudPrincipal: 20, circuitos: [] };
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    }
  });
  
  document.addEventListener('click', (e) => {
    const targetBoton = e.target.closest('.btn-delete');
    if (targetBoton) {
      eliminarCircuito(Number(targetBoton.dataset.id));
    }
  });
}

// ============================================
// EFECTOS MOUSE: ARCOS VOLTAICOS AMARILLOS
// ============================================
class ElectricMouse {
  constructor() {
    this.mouseX = 0;
    this.mouseY = 0;
    this.lastSparkTime = 0;
    this.sparkInterval = 40;
    this.init();
  }
  init() {
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('click', (e) => this.onMouseClick(e));
  }
  onMouseMove(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    const now = Date.now();
    if (now - this.lastSparkTime > this.sparkInterval) {
      if (Math.random() > 0.4) this.crearChispaRayo(this.mouseX, this.mouseY);
      this.lastSparkTime = now;
    }
  }
  onMouseClick(e) {
    for (let i = 0; i < 10; i++) this.crearChispaRayo(e.clientX, e.clientY);
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
    
    spark.style.setProperty('--tx', tx + 'px');
    spark.style.setProperty('--ty', ty + 'px');
    const deg = (angulo * 180) / Math.PI;
    spark.style.setProperty('--rot', deg + 'deg');
    spark.style.transform = `rotate(${deg}deg)`;
    
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 400);
  }
}

const electricMouse = new ElectricMouse();
function crearExplosionEnClick(x, y) {
  electricMouse.onMouseClick({ clientX: x, clientY: y });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}