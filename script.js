// ==========================================
// CONFIGURACIÓN Y BASES DE DATOS (NORMA AEA)
// ==========================================

window.proyectoActual = {
  sistema: "monofasico",
  potenciaTotal: 10,
  cosPhi: 0.95,
  longitudAcometida: 20,
  circuitos: []
};

const TABLA_CABLES = [
  { seccion: 1.5, corrienteMaxMono: 15, corrienteMaxTri: 13, reactancia: 0.111, resistencia: 13.3 },
  { seccion: 2.5, corrienteMaxMono: 21, corrienteMaxTri: 18, reactancia: 0.102, resistencia: 7.98 },
  { seccion: 4,   corrienteMaxMono: 28, corrienteMaxTri: 24, reactancia: 0.093, resistencia: 4.95 },
  { seccion: 6,   corrienteMaxMono: 36, corrienteMaxTri: 31, reactancia: 0.089, resistencia: 3.30 },
  { seccion: 10,  corrienteMaxMono: 50, corrienteMaxTri: 43, reactancia: 0.083, resistencia: 1.91 },
  { seccion: 16,  corrienteMaxMono: 66, corrienteMaxTri: 57, reactancia: 0.081, resistencia: 1.21 },
  { seccion: 25,  corrienteMaxMono: 88, corrienteMaxTri: 75, reactancia: 0.078, resistencia: 0.78 }
];

const TERMICAS_COMERCIALES = [10, 16, 20, 25, 32, 40, 50, 63];

// ==========================================
// LÓGICA DE CÁLCULO PROFESIONAL CORREGIDA
// ==========================================

function calcularCircuitoAAgregar(datos) {
  const tipo = datos.tipoCircuito; 
  const potencia = parseFloat(datos.potenciaCircuito);
  const longitud = parseFloat(datos.longitudCircuito);
  const caidaMaxPermitida = parseFloat(datos.caidaPorcentajeMax);
  
  const cosPhi = proyectoActual.cosPhi;
  const senPhi = Math.sin(Math.acos(cosPhi));
  
  let corriente = 0;
  let voltajeNominal = 220;
  
  if (proyectoActual.sistema === "trifasico") {
    voltajeNominal = 380;
    corriente = (potencia * 1000) / (Math.sqrt(3) * 380 * cosPhi);
  } else {
    corriente = (potencia * 1000) / (220 * cosPhi);
  }

  let seccionMinimaNorma = 1.5; 
  if (tipo !== "Iluminación") {
    seccionMinimaNorma = 2.5;
  }

  let conductorSeleccionado = null;
  let caidaVFinal = 0;
  let caidaPorcentajeFinal = 0;
  let disyuntorTermica = 10;

  for (let i = 0; i < TABLA_CABLES.length; i++) {
    const cable = TABLA_CABLES[i];
    
    if (cable.seccion < seccionMinimaNorma) continue;

    const iz = (proyectoActual.sistema === "trifasico") ? cable.corrienteMaxTri : cable.corrienteMaxMono;
    if (iz < corriente) continue; 

    const factorDistancia = (proyectoActual.sistema === "trifasico") ? Math.sqrt(3) : 2;
    const caidaVCalculada = (factorDistancia * corriente * longitud * (cable.resistencia * cosPhi + cable.reactancia * senPhi)) / 1000;
    const caidaPorcentajeCalculada = (caidaVCalculada / voltajeNominal) * 100;

    if (caidaPorcentajeCalculada <= caidaMaxPermitida) {
      conductorSeleccionado = cable;
      caidaVFinal = caidaVCalculada;
      caidaPorcentajeFinal = caidaPorcentajeCalculada;
      
      let termicaValida = TERMICAS_COMERCIALES.find(inNominal => inNominal >= corriente && inNominal <= iz);
      if (!termicaValida) {
        termicaValida = TERMICAS_COMERCIALES.find(inNominal => inNominal >= corriente) || 10;
      }
      disyuntorTermica = termicaValida;
      break; 
    }
  }

  if (!conductorSeleccionado) {
    conductorSeleccionado = TABLA_CABLES[TABLA_CABLES.length - 1];
    const izMax = (proyectoActual.sistema === "trifasico") ? conductorSeleccionado.corrienteMaxTri : conductorSeleccionado.corrienteMaxMono;
    const factorDistancia = (proyectoActual.sistema === "trifasico") ? Math.sqrt(3) : 2;
    
    caidaVFinal = (factorDistancia * corriente * longitud * (conductorSeleccionado.resistencia * cosPhi + conductorSeleccionado.reactancia * senPhi)) / 1000;
    caidaPorcentajeFinal = (caidaVFinal / voltajeNominal) * 100;
    disyuntorTermica = TERMICAS_COMERCIALES.filter(inNominal => inNominal <= izMax).pop() || 63;
  }

  const izFinal = (proyectoActual.sistema === "trifasico") ? conductorSeleccionado.corrienteMaxTri : conductorSeleccionado.corrienteMaxMono;
  const cumpleCaida = caidaPorcentajeFinal <= caidaMaxPermitida;
  const cumpleCoordinacion = (corriente <= disyuntorTermica) && (disyuntorTermica <= izFinal);
  
  return {
    id: Date.now() + Math.random().toString(36).substr(2, 5),
    tipoCircuito: tipo,
    ambiente: datos.ambiente || "General",
    potenciaCircuito: potencia,
    corriente: parseFloat(corriente.toFixed(2)),
    conductor: conductorSeleccionado.seccion,
    disyuntor: disyuntorTermica,
    caidaV: parseFloat(caidaVFinal.toFixed(2)),
    caidaPorcentaje: parseFloat(caidaPorcentajeFinal.toFixed(2)),
    valido: cumpleCaida && cumpleCoordinacion
  };
}

// ==========================================
// CAPTURA INTERACTIVA BLINDADA
// ==========================================

function initApp() {
  const formCircuito = document.getElementById('formCircuito');
  const btnLimpiarCampos = document.getElementById('btnLimpiarCampos');
  const btnLimpiarTodo = document.getElementById('btnLimpiarTodo');
  const btnExportarPDF = document.getElementById('btnExportarPDF');

  if (formCircuito) {
    formCircuito.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const selectSistema = document.getElementById('sistemaElectrico');
      const inputPotenciaTotal = document.getElementById('potenciaTotal');
      const inputLongitudAcometida = document.getElementById('longitudAcometida');
      
      const selectTipo = document.getElementById('tipoCircuito');
      const inputAmbiente = document.getElementById('ambienteDescripcion');
      const inputPotenciaCircuito = document.getElementById('potenciaCircuito');
      const inputLongitudCircuito = document.getElementById('longitudCircuito');
      const selectCaida = document.getElementById('caidaMaxPermitida');

      if (!selectTipo || !selectTipo.value) {
        alert("Por favor seleccione un tipo de circuito válido.");
        return;
      }

      if (selectSistema) proyectoActual.sistema = selectSistema.value;
      if (inputPotenciaTotal) proyectoActual.potenciaTotal = parseFloat(inputPotenciaTotal.value) || 0;
      if (inputLongitudAcometida) proyectoActual.longitudAcometida = parseFloat(inputLongitudAcometida.value) || 0;

      const datosForm = {
        tipoCircuito: selectTipo.value,
        ambiente: inputAmbiente ? inputAmbiente.value.trim() : "General",
        potenciaCircuito: inputPotenciaCircuito ? parseFloat(inputPotenciaCircuito.value) : 0,
        longitudCircuito: inputLongitudCircuito ? parseFloat(inputLongitudCircuito.value) : 0,
        caidaPorcentajeMax: selectCaida ? parseFloat(selectCaida.value) : 5
      };

      if (datosForm.potenciaCircuito <= 0) {
        alert("Por favor ingrese una potencia válida mayor a 0 kW para el circuito.");
        return;
      }

      const nuevoCircuito = calcularCircuitoAAgregar(datosForm);
      proyectoActual.circuitos.push(nuevoCircuito);
      
      renderTablaCircuitos();
      formCircuito.reset();
    });
  }

  if (btnLimpiarCampos && formCircuito) {
    btnLimpiarCampos.addEventListener('click', () => formCircuito.reset());
  }

  if (btnLimpiarTodo) {
    btnLimpiarTodo.addEventListener('click', () => {
      if (confirm("¿Estás seguro de borrar todos los circuitos del proyecto?")) {
        proyectoActual.circuitos = [];
        renderTablaCircuitos();
      }
    });
  }

  if (btnExportarPDF) {
    btnExportarPDF.addEventListener('click', () => {
      window.print();
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target && (e.target.classList.contains('btn-delete') || e.target.innerText === '🗑')) {
      const idAEliminar = e.target.getAttribute('data-id');
      if (idAEliminar) {
        proyectoActual.circuitos = proyectoActual.circuitos.filter(c => c.id !== idAEliminar);
        renderTablaCircuitos();
      }
    }
  });
}

function renderTablaCircuitos() {
  const tbody = document.querySelector('#circuitsTable tbody');
  const emptyState = document.getElementById('emptyState');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (proyectoActual.circuitos.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    const resumenBox = document.getElementById('resumenCircuitos');
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
      <td>${circuito.potenciaCircuito} kW</td>
      <td>${circuito.corriente} A</td>
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
  
  let advertencias = [];
  if (circuitosValidos < circuitosTotal) {
    advertencias.push('⚠️ ' + (circutosTotal - circuitosValidos) + ' circuito(s) fuera de norma AEA');
  } 
  if (totalPotencia > proyectoActual.potenciaTotal) {
    advertencias.push('⚠️ La suma supera la potencia total contratada!');
  }
  
  let advertencia = advertencias.length > 0 
    ? advertencias.join(' | ') 
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

class ElectricMouse {
  constructor() {
    this.lastSparkTime = 0;
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('click', (e) => this.onMouseClick(e));
  }
  onMouseMove(e) {
    const now = Date.now();
    if (now - this.lastSparkTime > 50) {
      this.crearChispaRayo(e.clientX, e.clientY);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}