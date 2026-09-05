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
// TUG (tomas de uso general): el mínimo depende del tipo de
// tomacorriente instalado (AEA 90364-7-770):
//   - Tomas comunes 2P+T IRAM 2071 (10A por boca) -> disyuntor máx. 16A
//   - Tomas industriales IRAM IEC 60309 (16A por boca) -> disyuntor máx. 20A
// TUE (circuitos especiales - cocina, lavarropas, calefacción, etc.): mín. 4mm²/25A.
// Verificar siempre contra la tabla AEA vigente según el método de instalación real.
const MINIMOS_AEA = {
  'Iluminación': { mm2: 1.5, disyuntor: 10 },
  'Tomacorriente': {
    '10A': { mm2: 2.5, disyuntor: 16 },
    '16A': { mm2: 2.5, disyuntor: 20 }
  },
  'Cocina/Comedor': { mm2: 4, disyuntor: 25 },
  'Lavarropas': { mm2: 4, disyuntor: 25 },
  'Aire Acondicionado': { mm2: 4, disyuntor: 25 },
  'Calefactor': { mm2: 4, disyuntor: 25 },
  'Calentador de agua': { mm2: 4, disyuntor: 25 }
};

// CORREGIDO: resistividad del cobre a temperatura de SERVICIO (~70-90°C
// según aislación), no en frío a 20°C (0.0175). Usar el valor en frío
// subestima la caída de tensión real en la instalación terminada en un
// ~25-28%. AEA 90364-5-52 recomienda considerar la resistividad a la
// temperatura de trabajo del conductor.
const RHO_COBRE = 0.0225;

// NUEVO: cos φ típico por tipo de carga (AEA 90364-5-52, cargas con
// componente inductiva por motor/compresor tienen cos φ real menor al
// resistivo puro). Se usa el más conservador (el MENOR) entre este valor
// y el cos φ general configurado por el usuario, para no subestimar la
// corriente de diseño.
const COS_PHI_TIPOS = {
  'Aire Acondicionado': 0.85,
  'Lavarropas': 0.85,
  'Calentador de agua': 0.95,
  'Cocina/Comedor': 0.95,
  'Calefactor': 0.95,
  'Iluminación': 0.95,
  'Tomacorriente': 0.95,
  'Otro': 0.95
};

function obtenerCosPhiCircuito(tipoCircuito, cosPhiGeneral) {
  const cosPhiTipo = COS_PHI_TIPOS[tipoCircuito];
  if (cosPhiTipo === undefined) return cosPhiGeneral;
  return Math.min(cosPhiTipo, cosPhiGeneral);
}

// NUEVO (AEA 90364-5-54, tabla internacional habitual): sección mínima
// del conductor de protección (PE) según la sección de fase.
//   Sf ≤ 16mm²      -> Spe = Sf
//   16 < Sf ≤ 35mm²  -> Spe = 16mm²
//   Sf > 35mm²       -> Spe = Sf / 2
// CORREGIDO: la tabla 771.13.I de AEA 90364-7-771 fija además un PISO
// absoluto de 2,50 mm² para el "Conductor de protección", por lo que se
// aplica ese mínimo aunque la fórmula por sección de fase diera menos
// (por ejemplo, un circuito de iluminación con fase de 1,5mm²). NOTA: la
// tabla de AEA no distingue explícitamente si ese piso de 2,5mm² es por
// circuito terminal o solo para la línea principal de PE del tablero —
// convendría que esto lo confirme un profesional matriculado contra la
// edición vigente antes de dar el cálculo por definitivo.
function calcularSeccionPE(faseMm2) {
  if (typeof faseMm2 !== 'number') return null;
  let spe;
  if (faseMm2 <= 16) spe = faseMm2;
  else if (faseMm2 <= 35) spe = 16;
  else spe = faseMm2 / 2;
  return Math.max(spe, 2.5);
}

// CORREGIDO tras verificar contra el texto oficial de AEA 90364-7-771
// (corrigendum 2, cláusula 771.13.b): el 3% aplica a TODOS los circuitos
// terminales de iluminación y tomacorrientes de uso general; el 5% es
// exclusivo de "circuitos de uso específico que alimentan sólo motores"
// (5% en régimen, 15% durante el arranque). Antes el código asumía 5%
// por defecto para todo lo que no fuera iluminación, lo cual permitía
// una caída excesiva en tomacorrientes comunes.
const CAIDA_MAX_TIPOS = {
  'Aire Acondicionado': 5, // circuito de uso específico que alimenta un motor (compresor)
  'Lavarropas': 5          // ídem, motor de lavado/centrifugado
  // todo el resto (iluminación, tomacorriente, cocina, calefactor,
  // calentador de agua) es 3% por defecto según 771.13.b.1
};

// NUEVO: escapa texto de usuario antes de insertarlo vía innerHTML
// (el campo "ambiente" es texto libre).
function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

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
// Para 'Tomacorriente', el mínimo depende además del tipo de toma
// (10A común o 16A industrial), por eso ahí MINIMOS_AEA guarda un
// objeto anidado en vez de { mm2, disyuntor } directo.
function aplicarMinimoAEA(tipoCircuito, conductorCalculado, tipoTomacorriente = '10A') {
  let minimo = MINIMOS_AEA[tipoCircuito];
  if (tipoCircuito === 'Tomacorriente' && minimo) {
    minimo = minimo[tipoTomacorriente] || minimo['10A'];
  }
  if (!minimo || conductorCalculado.mm2 === '>70') return conductorCalculado;

  return {
    mm2: Math.max(conductorCalculado.mm2, minimo.mm2),
    disyuntor: Math.max(conductorCalculado.disyuntor, minimo.disyuntor),
    amperios: Math.max(conductorCalculado.amperios, minimo.disyuntor)
  };
}

// CORREGIDO: cuando la corriente supera la tabla de conductores (>200A,
// mm2 === '>70'), antes se devolvía 0V de caída, lo que hacía que
// validarCaida(0, max) diera "true" y el circuito apareciera como
// CUMPLE en verde — un falso positivo grave, porque en realidad no hay
// cable ni térmica normalizados disponibles para esa corriente. Ahora
// devuelve NaN, que al compararse en validarCaida() da false de forma
// natural (cualquier comparación con NaN es false en JS), marcando el
// circuito como inválido en vez de aprobado por error.
function calcularCaidaTension(corriente, longitud, mm2, sistema) {
  if (mm2 === '>70') return NaN;
  
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
  const seccionPEPrincipal = conductor.mm2 !== '>70' ? calcularSeccionPE(conductor.mm2) : null;
  
  resumen.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">Sistema:</span><span class="value">${proyectoActual.tipoSistema.toUpperCase()}</span></div>
      <div class="stat"><span class="label">Potencia:</span><span class="value">${proyectoActual.potenciaTotal} kW</span></div>
      <div class="stat"><span class="label">Corriente I:</span><span class="value">${corrientePrincipal} A</span></div>
      <div class="stat"><span class="label">Cable:</span><span class="value">${conductor.mm2} mm²</span></div>
      <div class="stat"><span class="label">Térmica:</span><span class="value">${conductor.disyuntor} A</span></div>
      <div class="stat"><span class="label">PE (tierra):</span><span class="value">${seccionPEPrincipal !== null ? seccionPEPrincipal + ' mm²' : '-'}</span></div>
      <div class="stat"><span class="label">Caída:</span><span class="value">${caidaV}V (${caidaPorcentaje}%)</span></div>
    </div>
  `;
}

// NUEVO: muestra el selector de tipo de tomacorriente solo cuando
// el tipo de circuito elegido es "Tomacorriente".
function toggleGrupoTipoTomacorriente() {
  const tipoCircuito = document.getElementById('tipoCircuito').value;
  const grupo = document.getElementById('grupoTipoTomacorriente');
  grupo.style.display = (tipoCircuito === 'Tomacorriente') ? 'block' : 'none';
}

// NUEVO: sugiere automáticamente la caída de tensión máxima admitida según
// el tipo de circuito (AEA es más estricta con iluminación). El usuario
// puede seguir cambiándola si tiene un criterio justificado distinto.
function actualizarCaidaSugerida() {
  const tipoCircuito = document.getElementById('tipoCircuito').value;
  const selectCaida = document.getElementById('caida');
  if (!tipoCircuito) return;
  const sugerido = CAIDA_MAX_TIPOS[tipoCircuito] || 3;
  selectCaida.value = String(sugerido);
}

function agregarCircuito(event) {
  event.preventDefault();
  
  if (!proyectoActual.tipoSistema) {
    alert('⚠️ Primero debe configurar el sistema');
    return;
  }
  
  const tipoCircuito = document.getElementById('tipoCircuito').value;
  const tipoTomacorriente = document.getElementById('tipoTomacorriente').value || '10A';
  const ambiente = document.getElementById('ambiente').value.trim();
  const potenciaCircuito = Number(document.getElementById('potenciaCircuito').value);
  const longitud = Number(document.getElementById('longitud').value);
  const caidaMaxima = Number(document.getElementById('caida').value);
  
  if (!tipoCircuito || !ambiente || !potenciaCircuito || !longitud) {
    alert('⚠️ Completa todos los campos');
    return;
  }
  
  // CORREGIDO: usa el cos φ propio del tipo de carga (motores/compresores
  // tienen componente inductiva mayor), tomando el más conservador entre
  // ese valor y el cos φ general configurado por el usuario.
  const cosPhiCircuito = obtenerCosPhiCircuito(tipoCircuito, proyectoActual.factorPotencia);
  const corriente = calcularCorriente(potenciaCircuito, proyectoActual.tipoSistema, cosPhiCircuito);
  let conductor = encontrarConductor(corriente);

  // CORREGIDO: aplica la sección/térmica mínima exigida por AEA según
  // el tipo de circuito (tomas, cocina, lavarropas, etc.), aunque la
  // corriente calculada hubiera alcanzado con un cable más chico.
  conductor = aplicarMinimoAEA(tipoCircuito, conductor, tipoTomacorriente);

  // La caída de tensión se recalcula con el conductor definitivo
  // (puede haber cambiado de tamaño al aplicar el mínimo AEA).
  const caidaV = calcularCaidaTension(corriente, longitud, conductor.mm2, proyectoActual.tipoSistema);
  const caidaPorcentaje = calcularPorcentajeCaida(caidaV, proyectoActual.tipoSistema);

  // NUEVO (AEA 90364-5-54): sección del conductor de protección/tierra.
  const seccionPE = conductor.mm2 !== '>70' ? calcularSeccionPE(conductor.mm2) : null;
  
  const circuito = {
    id: Date.now(),
    tipoCircuito,
    tipoTomacorriente: tipoCircuito === 'Tomacorriente' ? tipoTomacorriente : null,
    ambiente,
    potenciaCircuito,
    longitud,
    caidaMaxima,
    cosPhiCircuito,
    corriente,
    conductor: conductor.mm2,
    disyuntor: conductor.disyuntor,
    seccionPE,
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
    const fueraDeTabla = circuito.conductor === '>70';
    const estadoClass = fueraDeTabla ? 'invalido' : (circuito.valido ? 'valido' : 'invalido');
    const caidaTexto = fueraDeTabla
      ? '⚠️ Corriente fuera de tabla (>200A) — requiere cálculo especial'
      : `${circuito.caidaV}V (${circuito.caidaPorcentaje}%)`;
    
    tr.innerHTML = `
      <td>${escaparHTML(circuito.tipoCircuito)}</td>
      <td>${circuito.tipoTomacorriente || '-'}</td>
      <td>${escaparHTML(circuito.ambiente)}</td>
      <td>${circuito.potenciaCircuito}</td>
      <td>${circuito.corriente}</td>
      <td><strong>${circuito.conductor} mm²</strong></td>
      <td>${circuito.disyuntor} A</td>
      <td>${circuito.seccionPE !== null ? circuito.seccionPE + ' mm²' : '-'}</td>
      <td class="${estadoClass}">${caidaTexto}</td>
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
  
  const circuitosFueraTabla = proyectoActual.circuitos.filter(c => c.conductor === '>70').length;
  const circuitosCaidaExcesiva = circuitosTotal - circuitosValidos - circuitosFueraTabla;

  let advertenciaCaida = '✓ Todos los circuitos cumplen la caída de tensión admitida';
  if (circuitosFueraTabla > 0 && circuitosCaidaExcesiva > 0) {
    advertenciaCaida = `⚠️ ${circuitosCaidaExcesiva} circuito(s) con caída excesiva, ${circuitosFueraTabla} fuera de tabla (>200A)`;
  } else if (circuitosFueraTabla > 0) {
    advertenciaCaida = `⚠️ ${circuitosFueraTabla} circuito(s) con corriente fuera de tabla (>200A) — requieren cálculo especial de un profesional`;
  } else if (circuitosCaidaExcesiva > 0) {
    advertenciaCaida = `⚠️ ${circuitosCaidaExcesiva} circuito(s) con caída excesiva`;
  }

  // NUEVO: valida que la potencia contratada alcance para la suma de
  // circuitos cargados. No aplica factor de simultaneidad (la app no lo
  // calcula todavía) — es una comparación directa carga instalada vs.
  // potencia contratada, por eso puede ser conservadora.
  let advertenciaPotencia = '';
  if (proyectoActual.potenciaTotal > 0) {
    if (totalPotencia > proyectoActual.potenciaTotal) {
      advertenciaPotencia = `<div class="stat alerta-potencia" style="grid-column: 1/-1;">
        ⚠️ La suma de circuitos (${totalPotencia.toFixed(2)} kW) supera la potencia contratada
        (${proyectoActual.potenciaTotal} kW). Gestionar aumento de potencia o revisar cargas.
      </div>`;
    }
  }
  
  resumenBox.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">Total Circuitos:</span><span class="value">${circuitosTotal}</span></div>
      <div class="stat"><span class="label">Potencia total:</span><span class="value">${totalPotencia.toFixed(2)} kW</span></div>
      <div class="stat"><span class="label">Corriente Total:</span><span class="value">${totalCorriente.toFixed(2)} A</span></div>
      <div class="stat" style="grid-column: 1/-1;"><span class="label">${advertenciaCaida}</span></div>
      ${advertenciaPotencia}
      <div class="stat nota-diferencial" style="grid-column: 1/-1;">
        ℹ️ Todo tablero debe protegerse con interruptor diferencial (ID) de 30mA
        aguas arriba de las térmicas, conforme AEA 90364-4-41. Verificar sensibilidad
        reforzada en ambientes húmedos (baño, exterior).
      </div>
    </div>
  `;
}

// NUEVO: arma el encabezado del informe (fecha + resumen del sistema
// configurado) justo antes de imprimir/exportar, para que el PDF se
// vea como un informe técnico y no como una captura de la web.
function prepararEncabezadoImpresion() {
  const printMeta = document.getElementById('printMeta');
  const fecha = new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  let sistemaHTML = '<span style="opacity:0.6">Sistema no configurado</span>';
  if (proyectoActual.tipoSistema) {
    sistemaHTML = `
      ${proyectoActual.tipoSistema.toUpperCase()} ·
      Potencia contratada: <strong>${proyectoActual.potenciaTotal} kW</strong> ·
      cos φ: <strong>${proyectoActual.factorPotencia}</strong> ·
      Acometida: <strong>${proyectoActual.longitudPrincipal} m</strong>
    `;
  }

  printMeta.innerHTML = `
    <div class="print-meta-row"><strong>Fecha del informe:</strong> ${fecha}</div>
    <div class="print-meta-row"><strong>Configuración del sistema:</strong> ${sistemaHTML}</div>
  `;
}

function exportarPDF() {
  prepararEncabezadoImpresion();
  window.print();
}

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
  document.getElementById('btnLimpiarForm').addEventListener('click', () => {
    document.getElementById('circuitForm').reset();
    toggleGrupoTipoTomacorriente();
  });

  // NUEVO: el selector de tipo de tomacorriente solo tiene sentido
  // cuando el circuito elegido es "Tomacorriente"; se oculta para el resto.
  document.getElementById('tipoCircuito').addEventListener('change', toggleGrupoTipoTomacorriente);
  document.getElementById('tipoCircuito').addEventListener('change', actualizarCaidaSugerida);
  toggleGrupoTipoTomacorriente();
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

// ============================================================
// NUEVO BLOQUE ADITIVO — CHECKLIST NORMATIVO AEA 90364-7-770
// (Sección 770 completa: 770.14 y 770.15).
//
// Este bloque NO modifica ninguna función, variable ni
// configuración existente arriba: solo lee proyectoActual y
// CONDUCTORES_AEA (ya declarados) para evaluar automáticamente
// lo que puede derivarse de los circuitos cargados, y agrega su
// propio listener de inicio en paralelo a initApp(), para que si
// este bloque fallara por algún motivo, el resto de la app
// (configuración, circuitos, exportación, efectos) siga
// funcionando exactamente igual.
//
// Persiste en su propia clave de localStorage, separada de
// STORAGE_KEY ('aea_proyectos_v1'), así que no interfiere con
// guardarProyecto()/cargarProyecto().
// ============================================================
const CHECKLIST_770_KEY = 'aea_checklist770_v1';

const CAMPOS_CHECKLIST_770 = [
  'inputSupCubierta',
  'inputSupSemicubierta',
  'chk770_14_1_diferencial',
  'chk770_14_2_aislacion',
  'chk770_14_2_tomas',
  'chk770_14_3_corte',
  'chk770_14_3_continuidad',
  'selEsquemaTierra',
  'inputResistenciaTierra',
  'chk770_15_4_dps',
  'selTipoDPS',
  'chk770_15_5_relesobre'
];

function guardarChecklist770() {
  const data = {};
  CAMPOS_CHECKLIST_770.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    data[id] = (el.type === 'checkbox') ? el.checked : el.value;
  });
  try {
    localStorage.setItem(CHECKLIST_770_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('No se pudo guardar el checklist 770:', err);
  }
}

function cargarChecklist770() {
  let data = {};
  try {
    const raw = localStorage.getItem(CHECKLIST_770_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (err) {
    console.warn('No se pudo cargar el checklist 770 guardado:', err);
  }
  CAMPOS_CHECKLIST_770.forEach(id => {
    const el = document.getElementById(id);
    if (!el || !(id in data)) return;
    if (el.type === 'checkbox') el.checked = !!data[id];
    else el.value = data[id];
  });
}

// Busca en la tabla de conductores ya existente (CONDUCTORES_AEA) la
// corriente admisible (Iz) que corresponde a la térmica (In) asignada
// al circuito, para verificar la coordinación Ib ≤ In ≤ Iz de 770.15.3.
function obtenerIzParaDisyuntor(disyuntor) {
  const fila = CONDUCTORES_AEA.find(c => c.disyuntor === disyuntor);
  return fila ? fila.amperios : null;
}

function evaluarResistenciaTierra() {
  const contenedor = document.getElementById('resultadoResistenciaTierra');
  if (!contenedor) return;
  const inputEl = document.getElementById('inputResistenciaTierra');
  const resistencia = Number(inputEl ? inputEl.value : NaN);
  if (!resistencia) {
    contenedor.innerHTML = '';
    return;
  }
  // Verificación orientativa Ra × IΔn ≤ 24V (criterio habitual para locales
  // húmedos/exteriores) con el diferencial de 30mA típico. Es un criterio
  // de referencia y no reemplaza el análisis normativo completo de tensión
  // de contacto límite aplicable a cada caso.
  const tensionContacto = resistencia * 0.03;
  const cumple = tensionContacto <= 24;
  contenedor.innerHTML = `
    <span class="${cumple ? 'valido' : 'invalido'}">
      Ra × IΔn ≈ ${tensionContacto.toFixed(1)} V con ID de 30mA
      (${cumple ? 'dentro del límite orientativo de 24V' : 'supera el límite orientativo de 24V — revisar jabalina/electrodo'})
    </span>`;
}

// Tabla 770.7.I - Resumen de los grados de electrificación, según la
// superficie límite de aplicación (superficie cubierta + 50% de la semicubierta).
function calcularSuperficieLimite(cubierta, semicubierta) {
  return cubierta + 0.5 * semicubierta;
}

function determinarGradoElectrificacion(superficieLimite) {
  if (superficieLimite <= 60) return 'Mínimo';
  if (superficieLimite <= 130) return 'Medio';
  if (superficieLimite <= 200) return 'Elevado';
  return 'Superior';
}

// Tabla 770.7.II - Resumen de los números mínimos de circuitos por grado.
const CIRCUITOS_MINIMOS_770_7 = {
  'Mínimo':   { total: 2, texto: '1 circuito de Iluminación de uso general (IUG) + 1 de Tomacorrientes de uso general (TUG)' },
  'Medio':    { total: 3, texto: '3 circuitos de uso general: 2 IUG + 1 TUG, o bien 1 IUG + 2 TUG' },
  'Elevado':  { total: 5, texto: '5 circuitos de uso general: 2 IUG + 3 TUG, o bien 3 IUG + 2 TUG' },
  'Superior': { total: 6, texto: '6 circuitos: 2 IUG + 3 TUG + 1 de libre elección, o bien 3 IUG + 2 TUG + 1 de libre elección' }
};

// Tabla 770.8.II - Coeficientes de simultaneidad según el grado de electrificación.
const COEFICIENTE_SIMULTANEIDAD_770_8 = {
  'Mínimo': 1,
  'Medio': 0.8,
  'Elevado': 0.7,
  'Superior': 0.6
};

// ============================================================
// NUEVO — Tabla 770.7.III: puntos mínimos de utilización por
// ambiente (IUG/TUG). Módulo independiente y aditivo: usa su
// propia clave de localStorage (AMBIENTES_770_KEY) y su propio
// array (ambientesChecklist770), sin tocar proyectoActual ni
// CHECKLIST_770_KEY, para no interferir con nada ya existente.
//
// Solo se calculan automáticamente los casos donde el texto de
// la norma (770.7.1) es puntual y verificable:
//   - Dormitorio, según tramo de superficie (≤10 m² y ≤36 m²).
//   - Kitchinette (770.7.1.o): regla fija, independiente del
//     resto de los mínimos del ambiente donde se ubica.
//   - Estar/Comedor/Escritorio/Estudio/Biblioteca (Tabla 770.7.III,
//     confirmada por el usuario contra el PDF de la guía AEA 770):
//     IUG = 1 boca cada 18 m² o fracción (mínimo 1); TUG = 1 boca
//     cada 6 m² o fracción (mínimo 2); TUE no exigible. Estos
//     valores son iguales para los 4 grados de electrificación.
// Para el resto de los destinos (Cocina, Baño, Lavadero, Pasillo,
// Garage, Otro) la Tabla 770.7.III fija mínimos que no pude
// verificar con certeza completa contra el texto vigente; por eso
// esos casos quedan como carga MANUAL (el profesional los completa
// mirando la tabla), en vez de arriesgar un número mal calculado
// en una herramienta de cumplimiento normativo.
// ============================================================
const AMBIENTES_770_KEY = 'aea_checklist770_ambientes_v1';
let ambientesChecklist770 = [];

const TIPOS_AMBIENTE_AUTOMATICOS_770 = ['Dormitorio', 'Kitchinette', 'Estar/Comedor'];

// Tabla 770.7.III (parcial, casos verificados) - Dormitorio,
// Kitchinette y Estar/Comedor.
function calcularMinimoAmbiente770(tipo, superficie) {
  if (tipo === 'Estar/Comedor') {
    if (!superficie || superficie <= 0) return null;
    const iug = Math.max(Math.ceil(superficie / 18), 1);
    const tug = Math.max(Math.ceil(superficie / 6), 2);
    return {
      iug,
      tug,
      nota: `Estar/Comedor ${superficie} m² — IUG: 1 boca c/18 m² o fracción (mín. 1); TUG: 1 boca c/6 m² o fracción (mín. 2); TUE no exigible. Igual en los 4 grados (770.7.III)`
    };
  }
  if (tipo === 'Dormitorio') {
    if (!superficie || superficie <= 0) return null;
    if (superficie <= 10) {
      return { iug: 1, tug: 2, nota: 'Dormitorio ≤10 m² (770.7.III)' };
    }
    if (superficie <= 36) {
      return { iug: 1, tug: 3, nota: 'Dormitorio >10 m² y ≤36 m² (770.7.III)' };
    }
    return { iug: null, tug: null, nota: '⚠️ Dormitorio >36 m²: tramo no verificado en esta calculadora, cargar manualmente según tabla vigente' };
  }
  if (tipo === 'Kitchinette') {
    return {
      iug: 1,
      tug: 2,
      nota: '770.7.1.o): además, 1 tomacorriente para artefacto de ubicación fija, independiente de los mínimos del ambiente donde se ubica'
    };
  }
  return null;
}

function actualizarCamposAmbiente770() {
  const tipo = document.getElementById('tipoAmbiente770')?.value;
  const campoSuperficie = document.getElementById('campoSuperficieAmbiente770');
  const camposManuales = document.getElementById('camposManualesAmbiente770');
  if (!campoSuperficie || !camposManuales) return;

  const esAutomatico = TIPOS_AMBIENTE_AUTOMATICOS_770.includes(tipo);
  // Dormitorio y Estar/Comedor necesitan el dato de superficie para calcular
  // el mínimo; Kitchinette es un valor fijo que no depende de la superficie.
  const necesitaSuperficie = (tipo === 'Dormitorio' || tipo === 'Estar/Comedor');
  campoSuperficie.style.display = necesitaSuperficie ? '' : 'none';
  camposManuales.style.display = esAutomatico ? 'none' : '';
}

function agregarAmbiente770(event) {
  event.preventDefault();

  const tipo = document.getElementById('tipoAmbiente770').value;
  const nombreInput = document.getElementById('nombreAmbiente770');
  const nombre = nombreInput.value.trim() || tipo;
  const superficie = Number(document.getElementById('superficieAmbiente770').value) || null;

  let iug, tug, nota;

  if (TIPOS_AMBIENTE_AUTOMATICOS_770.includes(tipo)) {
    const necesitaSuperficie = (tipo === 'Dormitorio' || tipo === 'Estar/Comedor');
    if (necesitaSuperficie && !superficie) {
      alert('⚠️ Ingresá la superficie del ambiente para calcular el mínimo (770.7.III)');
      return;
    }
    const minimo = calcularMinimoAmbiente770(tipo, superficie);
    iug = minimo.iug;
    tug = minimo.tug;
    nota = minimo.nota;
  } else {
    const iugManual = document.getElementById('iugManualAmbiente770').value;
    const tugManual = document.getElementById('tugManualAmbiente770').value;
    if (iugManual === '' || tugManual === '') {
      alert('⚠️ Completá los mínimos de IUG y TUG según la Tabla 770.7.III para este ambiente');
      return;
    }
    iug = Number(iugManual);
    tug = Number(tugManual);
    nota = 'Cargado manualmente por el usuario (verificar contra 770.7.III vigente)';
  }

  ambientesChecklist770.push({
    id: Date.now(),
    tipo,
    nombre,
    superficie,
    iug,
    tug,
    nota
  });

  guardarAmbientes770();
  renderAmbientes770();
  event.target.reset();
  actualizarCamposAmbiente770();
}

function eliminarAmbiente770(id) {
  if (!confirm('¿Eliminar este ambiente?')) return;
  ambientesChecklist770 = ambientesChecklist770.filter(a => a.id !== id);
  guardarAmbientes770();
  renderAmbientes770();
}

function renderAmbientes770() {
  const tbody = document.querySelector('#ambientesTable770 tbody');
  const emptyState = document.getElementById('emptyStateAmbientes770');
  if (!tbody || !emptyState) return;

  tbody.innerHTML = '';

  if (ambientesChecklist770.length === 0) {
    emptyState.style.display = 'block';
    actualizarResumenPuntosUtilizacion770();
    return;
  }
  emptyState.style.display = 'none';

  ambientesChecklist770.forEach(a => {
    const tr = document.createElement('tr');
    const pendiente = a.iug === null || a.tug === null;
    tr.innerHTML = `
      <td>${escaparHTML(a.nombre)}</td>
      <td>${escaparHTML(a.tipo)}</td>
      <td>${a.superficie ? a.superficie + ' m²' : '-'}</td>
      <td class="${pendiente ? 'invalido' : ''}">${a.iug === null ? '⚠️' : a.iug}</td>
      <td class="${pendiente ? 'invalido' : ''}">${a.tug === null ? '⚠️' : a.tug}</td>
      <td style="font-size:12px; opacity:0.8;">${escaparHTML(a.nota)}</td>
      <td><button data-id="${a.id}" class="btn-delete" title="Eliminar">🗑</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    // stopPropagation es necesario: el listener global de document (línea ~555)
    // escucha cualquier click en .btn-delete y llama a eliminarCircuito(id).
    // Sin esto, borrar un ambiente también dispararía el confirm() de
    // "¿Eliminar este circuito?" por error, ya que reutilizamos la misma
    // clase visual .btn-delete.
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      eliminarAmbiente770(Number(btn.dataset.id));
    });
  });

  actualizarResumenPuntosUtilizacion770();
}

function actualizarResumenPuntosUtilizacion770() {
  const contenedor = document.getElementById('resultadoPuntosUtilizacion770');
  if (!contenedor) return;

  if (ambientesChecklist770.length === 0) {
    contenedor.innerHTML = 'Agregá ambientes para ver el total de puntos mínimos de utilización exigidos.';
    return;
  }

  const pendientes = ambientesChecklist770.filter(a => a.iug === null || a.tug === null);
  const totalIUG = ambientesChecklist770.reduce((sum, a) => sum + (a.iug || 0), 0);
  const totalTUG = ambientesChecklist770.reduce((sum, a) => sum + (a.tug || 0), 0);

  contenedor.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">Ambientes cargados:</span><span class="value">${ambientesChecklist770.length}</span></div>
      <div class="stat"><span class="label">Total bocas IUG mínimas:</span><span class="value">${totalIUG}${pendientes.length ? '+' : ''}</span></div>
      <div class="stat"><span class="label">Total bocas TUG mínimas:</span><span class="value">${totalTUG}${pendientes.length ? '+' : ''}</span></div>
    </div>
    ${pendientes.length ? `<p class="invalido" style="margin:6px 0;">⚠️ ${pendientes.length} ambiente(s) con mínimo sin verificar — completalo manualmente contra la Tabla 770.7.III vigente.</p>` : ''}
    <p style="opacity:0.7; font-size:12px; margin-top:6px;">
      Esta suma es el mínimo normativo por ambiente. Falta verificar aparte, sobre el plano, que la
      cantidad de bocas realmente instaladas en cada local cumpla estos mínimos.
    </p>
  `;
}

function guardarAmbientes770() {
  try {
    localStorage.setItem(AMBIENTES_770_KEY, JSON.stringify(ambientesChecklist770));
  } catch (err) {
    console.warn('No se pudieron guardar los ambientes (770.7.III):', err);
  }
}

function cargarAmbientes770() {
  try {
    const raw = localStorage.getItem(AMBIENTES_770_KEY);
    ambientesChecklist770 = raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('No se pudieron cargar los ambientes (770.7.III):', err);
    ambientesChecklist770 = [];
  }
}

function actualizarGradoElectrificacion() {
  const contenedor = document.getElementById('resultadoGradoElectrificacion');
  if (!contenedor) return;

  const inputCubierta = document.getElementById('inputSupCubierta');
  const inputSemicubierta = document.getElementById('inputSupSemicubierta');
  const cubierta = Number(inputCubierta ? inputCubierta.value : NaN) || 0;
  const semicubierta = Number(inputSemicubierta ? inputSemicubierta.value : NaN) || 0;

  if (!cubierta) {
    contenedor.innerHTML = 'Ingresá la superficie cubierta para determinar el grado de electrificación (770.7).';
    return;
  }

  const superficieLimite = calcularSuperficieLimite(cubierta, semicubierta);
  const grado = determinarGradoElectrificacion(superficieLimite);
  const minimos = CIRCUITOS_MINIMOS_770_7[grado];
  const coefSimult = COEFICIENTE_SIMULTANEIDAD_770_8[grado];

  // Cuenta, sin modificar la lógica original, los circuitos de uso general
  // (Iluminación / Tomacorriente) que ya se cargaron en el panel de circuitos.
  const iug = proyectoActual.circuitos.filter(c => c.tipoCircuito === 'Iluminación').length;
  const tug = proyectoActual.circuitos.filter(c => c.tipoCircuito === 'Tomacorriente').length;
  const totalGeneral = iug + tug;
  const cumpleMinimo = totalGeneral >= minimos.total;

  contenedor.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">Superficie límite de aplicación:</span><span class="value">${superficieLimite.toFixed(1)} m²</span></div>
      <div class="stat"><span class="label">Grado de electrificación:</span><span class="value">${grado}</span></div>
      <div class="stat"><span class="label">Coef. simultaneidad (770.8.2):</span><span class="value">${coefSimult}</span></div>
    </div>
    <p style="margin:10px 0 4px 0;"><strong>Circuitos mínimos exigidos (770.7.5):</strong> ${minimos.texto}</p>
    <p class="${cumpleMinimo ? 'valido' : 'invalido'}" style="margin:4px 0;">
      Circuitos de uso general ya cargados arriba: ${totalGeneral} (IUG: ${iug} · TUG: ${tug})
      — ${cumpleMinimo ? '✓ cumple la cantidad mínima exigida' : `⚠️ faltan circuitos para llegar al mínimo de ${minimos.total}`}
    </p>
    <p style="opacity:0.7; font-size:12px; margin-top:6px;">
      Nota: la cantidad y ubicación de los puntos mínimos de utilización por ambiente (bocas de
      iluminación/tomacorrientes según la Tabla 770.7.III) debe verificarse aparte, ambiente por ambiente.
    </p>
  `;
}

function actualizarResumenAuto77015() {
  const contenedor = document.getElementById('resultadoAuto77015');
  if (!contenedor) return;

  if (!proyectoActual.tipoSistema || proyectoActual.circuitos.length === 0) {
    contenedor.innerHTML = 'Configurá el sistema y agregá circuitos para evaluar este punto automáticamente.';
    return;
  }

  let items = '';
  let hayProblemas = false;

  proyectoActual.circuitos.forEach(c => {
    const iz = obtenerIzParaDisyuntor(c.disyuntor);
    const fueraDeTabla = c.conductor === '>70';
    const coordinaOk = !fueraDeTabla && iz !== null && c.corriente <= c.disyuntor && c.disyuntor <= iz;
    if (!coordinaOk) hayProblemas = true;
    items += `
      <div class="checklist-result-row ${coordinaOk ? 'valido' : 'invalido'}">
        ${escaparHTML(c.ambiente)} (${escaparHTML(c.tipoCircuito)}): Ib=${c.corriente}A ·
        In=${fueraDeTabla ? '-' : c.disyuntor + 'A'} ·
        Iz=${iz !== null ? iz + 'A' : '-'}
        ${coordinaOk ? ' ✓ Coordinación Ib≤In≤Iz cumplida' : ' ⚠️ Revisar coordinación cable/protección'}
      </div>`;
  });

  contenedor.innerHTML = items + (hayProblemas
    ? '<div class="invalido" style="margin-top:8px;">⚠️ Hay circuitos que no cumplen la coordinación cable-protección exigida por 770.15.2/770.15.3.</div>'
    : '<div class="valido" style="margin-top:8px;">✓ Todos los circuitos cumplen la coordinación cable-protección (770.15.1 a 770.15.3).</div>');
}

function calcularEstadoGeneralChecklist770() {
  const contenedor = document.getElementById('estadoGeneralChecklist770');
  if (!contenedor) return;

  const idsBooleanos = [
    'chk770_14_1_diferencial', 'chk770_14_2_aislacion', 'chk770_14_2_tomas',
    'chk770_14_3_corte', 'chk770_14_3_continuidad'
  ];
  const marcados = idsBooleanos.filter(id => document.getElementById(id)?.checked).length;

  const dps = document.getElementById('chk770_15_4_dps')?.checked;
  const releSobre = document.getElementById('chk770_15_5_relesobre')?.checked;

  contenedor.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">770.14 verificado:</span><span class="value">${marcados}/${idsBooleanos.length}</span></div>
      <div class="stat"><span class="label">770.15.4 DPS:</span><span class="value">${dps ? 'Instalado' : 'Pendiente'}</span></div>
      <div class="stat"><span class="label">770.15.5 Sobretensión perm.:</span><span class="value">${releSobre ? 'Instalado' : 'Pendiente'}</span></div>
    </div>
    <p style="opacity:0.75; font-size:12px; margin-top:10px; margin-bottom:0;">
      Checklist orientativo de cumplimiento de la Sección 770. No reemplaza la verificación
      final por un instalador electricista matriculado conforme a la edición vigente de la AEA 90364.
    </p>
  `;
}

function actualizarChecklist770() {
  actualizarGradoElectrificacion();
  evaluarResistenciaTierra();
  actualizarResumenAuto77015();
  actualizarResumenPuntosUtilizacion770(); // NUEVO: refresca el resumen de 770.7.III junto con el resto
  calcularEstadoGeneralChecklist770();
  guardarChecklist770();
}

function reiniciarChecklist770() {
  if (!confirm('¿Reiniciar el checklist de la Sección 770? Esta acción no se puede deshacer.')) return;
  CAMPOS_CHECKLIST_770.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = false;
    else if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });
  try {
    localStorage.removeItem(CHECKLIST_770_KEY);
  } catch (err) {
    console.warn('No se pudo reiniciar el checklist 770:', err);
  }
  actualizarChecklist770();
}

function initChecklist770() {
  cargarChecklist770();
  actualizarChecklist770();

  const btnActualizar = document.getElementById('btnActualizarChecklist770');
  if (btnActualizar) btnActualizar.addEventListener('click', actualizarChecklist770);

  const btnReiniciar = document.getElementById('btnReiniciarChecklist770');
  if (btnReiniciar) btnReiniciar.addEventListener('click', reiniciarChecklist770);

  const inputResistencia = document.getElementById('inputResistenciaTierra');
  if (inputResistencia) {
    inputResistencia.addEventListener('input', () => {
      evaluarResistenciaTierra();
      guardarChecklist770();
    });
  }

  const inputCubierta = document.getElementById('inputSupCubierta');
  const inputSemicubierta = document.getElementById('inputSupSemicubierta');
  [inputCubierta, inputSemicubierta].forEach(el => {
    if (!el) return;
    el.addEventListener('input', () => {
      actualizarGradoElectrificacion();
      guardarChecklist770();
    });
  });

  // NUEVO: inicialización del módulo 770.7.III (puntos mínimos de
  // utilización por ambiente). Independiente del resto del checklist.
  cargarAmbientes770();
  renderAmbientes770();
  const formAmbiente770 = document.getElementById('formAmbiente770');
  if (formAmbiente770) formAmbiente770.addEventListener('submit', agregarAmbiente770);
  const tipoAmbienteSel770 = document.getElementById('tipoAmbiente770');
  if (tipoAmbienteSel770) {
    tipoAmbienteSel770.addEventListener('change', actualizarCamposAmbiente770);
    actualizarCamposAmbiente770();
  }

  CAMPOS_CHECKLIST_770.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el === inputResistencia || el === inputCubierta || el === inputSemicubierta) return;
    el.addEventListener('change', () => {
      guardarChecklist770();
      calcularEstadoGeneralChecklist770();
    });
  });

  // Observa la tabla de circuitos ya existente para refrescar 770.7 y
  // 770.15.1-3 automáticamente cuando se agrega/elimina un circuito, sin
  // tener que tocar ni envolver las funciones originales
  // agregarCircuito()/renderTablaCircuitos().
  const tbody = document.querySelector('#circuitsTable tbody');
  if (tbody && window.MutationObserver) {
    const observer = new MutationObserver(() => {
      actualizarGradoElectrificacion();
      actualizarResumenAuto77015();
    });
    observer.observe(tbody, { childList: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initChecklist770();
    } catch (err) {
      console.error('Error al iniciar el checklist 770:', err);
    }
  });
} else {
  try {
    initChecklist770();
  } catch (err) {
    console.error('Error al iniciar el checklist 770:', err);
  }
}
