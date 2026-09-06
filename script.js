// ============================================
// CONFIGURACIÓN TÉCNICA E INGENIERÍA ELÉCTRICA
// ============================================

// NUEVO (AEA 770, pág. 45): valores de la constante "k" para la
// verificación térmica de cortocircuito k²S² ≥ I²t, según el tipo de
// aislación del conductor (conductores de cobre, tabla usual IEC
// 60364-4-43 / 60364-5-54 tabla 43A, valores para "conductor aislado no
// incluido en un cable" temperatura inicial 30°C):
//   PVC (hasta 70°C)         -> k = 115
//   XLPE / EPR (hasta 90°C)  -> k = 143
// Se usa el valor conservador de conductor aislado individual (no cable
// multipolar), que es el caso típico de instalación domiciliaria en
// cañería embutida (IRAM NM 247-3 unipolar).
const K_AISLACION = {
  PVC: 115,
  XLPE: 143
};

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
// CORREGIDO contra la Tabla "Calibre máximo de las protecciones para los
// cables" de la Guía AEA 770 (pág. 40, columna "cable tipo domiciliario
// IRAM NM 247-3 en cañería embutida, 1 circuito por caño"):
//   1,5 mm² -> ≤15 A   2,5 mm² -> ≤20 A   4 mm² -> ≤25 A   6 mm² -> ≤32 A
// Antes el código permitía 4mm²→32A y 6mm²→40A, superando el máximo de
// la tabla: una térmica sobredimensionada para la sección del cable puede
// no cortar antes de que el conductor se recaliente (viola Ib≤In≤Iz,
// 770.15.3). Las secciones mayores a 6mm² no figuran en la tabla de esta
// guía simplificada; se mantienen como estimación a verificar contra la
// tabla completa de AEA 90364-5-52/770-B.
const CONDUCTORES_AEA = [
  { amperios: 10, mm2: 1.5, disyuntor: 10 },
  { amperios: 16, mm2: 2.5, disyuntor: 16 },
  { amperios: 20, mm2: 2.5, disyuntor: 20 },
  { amperios: 25, mm2: 4, disyuntor: 25 },
  { amperios: 32, mm2: 6, disyuntor: 32 },
  { amperios: 50, mm2: 10, disyuntor: 50 },
  { amperios: 63, mm2: 10, disyuntor: 63 },
  { amperios: 80, mm2: 16, disyuntor: 80 },
  { amperios: 100, mm2: 25, disyuntor: 100 },
  { amperios: 125, mm2: 35, disyuntor: 125 },
  { amperios: 160, mm2: 50, disyuntor: 160 },
  { amperios: 200, mm2: 70, disyuntor: 200 }
];

// NUEVO: Tabla "Calibre máximo de las protecciones para los cables" (Guía
// AEA 770, pág. 40) — columna cable domiciliario IRAM NM 247-3 en cañería
// embutida, discriminada por cantidad de circuitos que comparten el mismo
// caño (770.12.II). Antes la app asumía siempre "1 circuito por caño"
// para cualquier instalación, lo cual sobrestima la corriente admisible
// real cuando dos o más circuitos van agrupados en la misma canalización
// (caso muy común en la práctica: por ejemplo, todos los TUG de una
// vivienda saliendo del tablero por el mismo caño).
// Solo cubre 1,5/2,5/4/6 mm² y 1/2/3 circuitos, que es lo único que
// figura como texto en esta guía; para secciones mayores o agrupamientos
// de más de 3 circuitos no hay dato en el documento y se mantiene el
// criterio de 1 circuito por caño con una advertencia.
const CALIBRE_MAX_AGRUPAMIENTO_770 = {
  1.5: { 1: 15, 2: 10, 3: 10 },
  2.5: { 1: 20, 2: 15, 3: 13 },
  4:   { 1: 25, 2: 20, 3: 16 },
  6:   { 1: 32, 2: 25, 3: 25 }
};

// Serie comercial de térmicas IEC 60898 usada en toda la app.
const SERIE_DISYUNTORES = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200];

// Elige la térmica comercial más grande que sea >= corriente de empleo Ib
// y al mismo tiempo <= el máximo admitido por el cable (maxAdmitido, ya
// sea de la tabla de agrupamiento o de la tabla simple).
// CORREGIDO (bug de seguridad detectado en revisión): la versión anterior,
// cuando ninguna térmica comercial cumplía ambas condiciones a la vez
// (por ejemplo Ib=12A con maxAdmitido=15A, donde la serie comercial salta
// de 10A a 16A), elegía la térmica MAYOR que no superara maxAdmitido —en
// ese ejemplo, 10A— devolviendo una térmica por DEBAJO de la corriente de
// diseño (In=10A < Ib=12A). Eso viola la condición básica Ib≤In≤Iz y el
// circuito terminaba mostrado como "cumple" (verde) en la tabla principal,
// porque esa tabla solo valida la caída de tensión, no la coordinación
// cable-térmica. Ahora, si no hay ninguna térmica que cumpla Ib≤In≤maxAdmitido,
// se devuelve null para que el llamador pruebe con la sección de cable
// siguiente en vez de aceptar una térmica subdimensionada.
function elegirDisyuntorComercial(corriente, maxAdmitido, minimoDisyuntor = 0) {
  const candidatos = SERIE_DISYUNTORES.filter(d => d >= corriente && d >= minimoDisyuntor && d <= maxAdmitido);
  return candidatos.length > 0 ? Math.min(...candidatos) : null;
}

// CORREGIDO (bug de seguridad detectado en revisión): antes esta función
// elegía el conductor SOLO en base a la corriente de diseño (Ib) y recién
// después, en aplicarMinimoAEA(), se le imponía por separado el mínimo
// AEA del tipo de circuito con un simple Math.max(mm2, disyuntor) — sin
// volver a comprobar que esa térmica "mínima" siguiera siendo válida
// para el cable ya agrupado con otros circuitos en el mismo caño.
// Ejemplo real que esto dejaba pasar: un circuito Tomacorriente (TUG,
// mínimo AEA 2,5mm²/16A) con corriente de diseño baja y 3 circuitos
// compartiendo el caño: el cable quedaba en 2,5mm² con una térmica de
// 16A, pero a 2,5mm² con 3 circuitos agrupados la tabla de la pág.40
// solo admite 13A — la térmica de 16A no protege ese cable a tiempo
// (viola 770.15.2/770.15.3), y sin embargo el checklist mostraba "cumple".
//
// Ahora el mínimo AEA del tipo de circuito (minimoAEA) se exige DESDE EL
// PRINCIPIO de la búsqueda, sección por sección: se parte de la sección
// mínima normativa del circuito (no de 1,5mm²) y se sube de sección hasta
// encontrar una térmica comercial que cumpla las tres condiciones a la
// vez: Ib ≤ In, In ≥ mínimo AEA del tipo de circuito, e In ≤ Iz del cable
// YA AGRUPADO con la cantidad de circuitos por caño indicada. Si ninguna
// sección de 1,5 a 6mm² lo logra, se sigue probando con las secciones
// mayores (criterio de 1 circuito por caño, única data disponible en la
// guía para esas secciones). Si ni así se encuentra una combinación
// segura, se devuelve un conductor "fuera de tabla" en vez de forzar una
// térmica que no protege al cable.
function encontrarConductorConAgrupamiento(corriente, circuitosPorCano = 1, minimoAEA = null) {
  const minMm2 = minimoAEA ? minimoAEA.mm2 : 0;
  const minDisyuntor = minimoAEA ? minimoAEA.disyuntor : 0;
  const secciones = [1.5, 2.5, 4, 6];

  for (const mm2 of secciones) {
    if (mm2 < minMm2) continue; // no baja de la sección mínima exigida por el tipo de circuito
    const tabla = CALIBRE_MAX_AGRUPAMIENTO_770[mm2];
    const maxAdmitido = tabla[circuitosPorCano] ?? tabla[3]; // >3 circuitos: usar el más restrictivo disponible como piso conservador
    const disyuntor = elegirDisyuntorComercial(corriente, maxAdmitido, minDisyuntor);
    // Si esta sección de cable no tiene ninguna térmica comercial que
    // respete Ib≤In≤maxAdmitido Y además In≥mínimo AEA, se prueba con la
    // sección siguiente (más grande) en vez de aceptar una térmica
    // subdimensionada o una que exceda el Iz agrupado.
    if (disyuntor !== null) {
      return { mm2, disyuntor, amperios: maxAdmitido, agrupamientoVerificado: true };
    }
  }

  // Fuera del rango cubierto por la tabla de agrupamiento (>6mm²), o
  // ninguna sección de esa tabla tenía una combinación válida: se sigue
  // subiendo de sección con el criterio de 1 circuito por caño de
  // CONDUCTORES_AEA (única data disponible para secciones mayores),
  // exigiendo igual el mínimo AEA del tipo de circuito.
  for (const fila of CONDUCTORES_AEA) {
    if (fila.mm2 <= 6 || fila.mm2 < minMm2) continue;
    const disyuntor = elegirDisyuntorComercial(corriente, fila.amperios, minDisyuntor);
    if (disyuntor !== null) {
      return { mm2: fila.mm2, disyuntor, amperios: fila.amperios, agrupamientoVerificado: false };
    }
  }

  // Ninguna sección normalizada admite a la vez la corriente de diseño,
  // el mínimo AEA del tipo de circuito y la cantidad de circuitos
  // agrupados indicada: se marca como fuera de tabla (a verificar por un
  // profesional) en vez de devolver una combinación insegura.
  return { mm2: '>70', disyuntor: '>200', amperios: Infinity, agrupamientoVerificado: false };
}

// CORREGIDO (revisión contra el texto completo de la Guía AEA 770,
// "Clasificación de los circuitos", pág. 22-23): la versión anterior
// modelaba un único circuito "Tomacorriente" con dos variantes de ficha
// (10A común -> 16A / 16A industrial -> 20A). Eso estaba mal: 16A no es
// un valor de TUG en ningún caso (es el calibre máximo de IUG), y TUG
// y TUE son dos TIPOS DE CIRCUITO distintos, no una misma categoría con
// dos fichas posibles. La tabla real es:
//   - IUG (Iluminación de Uso General): calibre máx. 16A, sección mín. 1,5mm².
//   - TUG (Tomacorrientes de Uso General): SIEMPRE con fichas 2P+T IRAM
//     2071 de 10A por definición; calibre máx. 20A (fijo, no depende de
//     ninguna ficha), sección mín. 2,5mm².
//   - TUE (Tomacorrientes de Uso Especial: consumos unitarios de 10 a 20A,
//     ej. aire acondicionado en un dormitorio grande, fichas 2P+T IRAM 2071
//     de 20A o IRAM-IEC 60309 de 16A): calibre máx. 32A, sección mín.
//     2,5mm², corriente máxima admitida por boca = 20A.
// Se agrega TUE como tipo de circuito propio (no como sub-opción de
// "Tomacorriente"), ya que así lo trata la norma.
// IMPORTANTE: estos valores son el PISO mínimo (sección normativa +
// disyuntor de piso, tomado del ejemplo numérico resuelto de la propia
// guía). NO son el techo/máximo admitido por circuito: ese techo
// (16A para IUG, 20A para TUG, 32A para TUE) ya está garantizado por
// separado, porque encontrarConductorConAgrupamiento() nunca elige un
// disyuntor mayor al que admite la sección de cable (Iz, Tabla pág.40).
// - IUG: sección mín. 1,5mm² (770). Piso de disyuntor 10A, igual al
//   ejemplo de la guía (pág.31: Ib=2,73A -> In=10A). El techo de 16A
//   solo se alcanza si la corriente de diseño lo exige.
// - Tomacorriente = TUG: sección mín. 2,5mm² (770). Piso de disyuntor
//   16A, igual al ejemplo de la guía (pág.31: ambos TUG quedan con
//   In=16A pese a que Ib=10A). El techo normativo es 20A.
// - Tomacorriente Especial (TUE): consumos unitarios de 10 a 20A por
//   boca (ej. AC en dormitorio >36m², pág.11), sección mín. 2,5mm²,
//   techo normativo 32A. La guía no da un ejemplo numérico resuelto de
//   TUE, así que el piso de 20A es un criterio conservador propio,
//   no un valor citado textualmente: VERIFICAR caso por caso, en
//   particular que el cable elegido admita (Iz) el disyuntor final
//   (con 2,5mm² el techo de Iz es 20A; para llegar a 32A hace falta
//   subir a 6mm², según la Tabla "calibre máximo de las protecciones
//   para los cables", pág.40).
const MINIMOS_AEA = {
  'Iluminación': { mm2: 1.5, disyuntor: 10 },
  'Tomacorriente': { mm2: 2.5, disyuntor: 16 },
  'Tomacorriente Especial (TUE)': { mm2: 2.5, disyuntor: 20 },
  'Cocina/Comedor': { mm2: 4, disyuntor: 25 },
  'Lavarropas': { mm2: 4, disyuntor: 25 },
  'Aire Acondicionado': { mm2: 4, disyuntor: 25 },
  'Calefactor': { mm2: 4, disyuntor: 25 },
  'Calentador de agua': { mm2: 4, disyuntor: 25 }
};

// NUEVO (bug de validación detectado en revisión): la Guía AEA 770 fija un
// TECHO máximo de corriente/térmica para los circuitos de uso general, que
// es distinto del PISO mínimo de MINIMOS_AEA:
//   - IUG (Iluminación):              techo 16A (pág.22-23)
//   - TUG (Tomacorriente):            techo 20A, fijo — no depende de la
//                                      potencia declarada (pág.22-23)
//   - TUE (Tomacorriente Especial):   techo 32A (pág.22-23)
// Antes esto solo estaba documentado en un comentario (ver más abajo) bajo
// el supuesto de que "ya está garantizado por separado" porque
// encontrarConductorConAgrupamiento() nunca elige una térmica mayor a la
// que admite el cable. Ese supuesto es FALSO en cuanto la corriente de
// diseño (Ib) supera lo que cubre la tabla de agrupamiento de la guía
// (hasta 6mm²/32A): en ese caso la función cae al criterio de "1 circuito
// por caño" de CONDUCTORES_AEA y sigue subiendo de sección sin límite,
// devolviendo por ejemplo un "Tomacorriente" de 10mm²/50A — un circuito que
// no existe en la norma, porque un TUG jamás debería superar 20A (las
// bocas de uso general son de 10A por ficha; una carga tan alta pertenece
// a un circuito TUE, a un circuito dedicado, o hay que repartirla en varios
// TUG). Sin este techo, la app terminaba "resolviendo" con cable y térmica
// una clasificación de circuito que en los hechos es inválida.
const TECHOS_AEA = {
  'Iluminación': 16,
  'Tomacorriente': 20,
  'Tomacorriente Especial (TUE)': 32
  // El resto (Cocina/Comedor, Lavarropas, Aire Acondicionado, Calefactor,
  // Calentador de agua, Otro) son circuitos dedicados a un consumo
  // específico: la guía no les fija un techo de corriente, se dimensionan
  // según la carga real declarada.
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
  'Tomacorriente Especial (TUE)': 0.9,
  'Otro': 0.95
};

// NUEVO: factor de simultaneidad exigido por AEA 90364-7-770, Tabla 770.8.I,
// nota (2): "A la potencia total del circuito IUG debe afectársela por el
// Factor de Simultaneidad 2/3, para los otros circuitos el Factor de
// Simultaneidad se toma igual a 1". Verificado además contra el ejemplo
// numérico de la guía (pág. 27-29): 15 bocas x 60 VA/boca x 2/3 = 600 VA,
// que da exactamente Ib = 600/220 = 2,73 A, el valor que usa la guía.
const FACTOR_SIMULTANEIDAD_IUG = 2 / 3;

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
  'Aire Acondicionado': 5,            // circuito de uso específico que alimenta un motor (compresor)
  'Lavarropas': 5,                    // ídem, motor de lavado/centrifugado
  'Tomacorriente Especial (TUE)': 5   // TUE suele alimentar un único artefacto de mayor consumo unitario (ej. AC), mismo criterio
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
  iccOrigen: null,
  poderCorteTermicas: 6,
  tipoAislacion: 'PVC',
  i2tTermicas: null,
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

// QUITADO (bug de seguridad): esta función forzaba el mínimo AEA con un
// simple Math.max(mm2, disyuntor) DESPUÉS de haber elegido el conductor
// por corriente, sin volver a verificar que la térmica resultante
// siguiera siendo válida para el cable ya agrupado con otros circuitos
// en el mismo caño. Ver el comentario en encontrarConductorConAgrupamiento():
// ahora el mínimo AEA se exige desde el principio de esa búsqueda (recibe
// tipoCircuito y usa MINIMOS_AEA internamente), así que no hace falta un
// paso posterior que corrija el resultado sin re-verificarlo.

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

// NUEVO (AEA 770, pág. 45): energía específica pasante máxima que admite
// un conductor sin dañarse térmicamente ante un cortocircuito adiabático:
//   k²S² ≥ I²t
// donde S es la sección del conductor (mm²) y k depende de su aislación
// (ver K_AISLACION). Devuelve el valor máximo admitido en A²·s.
function calcularEnergiaMaximaConductor(mm2, tipoAislacion) {
  const k = K_AISLACION[tipoAislacion] || K_AISLACION.PVC;
  return Math.pow(k * mm2, 2);
}

// NUEVO (AEA 770, pág. 45, "Verificación de los cables a las
// sobrecorrientes"): "Se debe cumplir PdCcc ≥ I''k", donde I''k es la
// máxima corriente de cortocircuito en el punto donde está instalado el
// dispositivo de protección (dato que debe dar la empresa distribuidora)
// y PdCcc es el poder de corte del interruptor (dato de placa).
function evaluarPoderDeCorte() {
  const contenedor = document.getElementById('resultadoPoderCorte');
  if (!contenedor) return;

  const icc = proyectoActual.iccOrigen;
  const pdc = proyectoActual.poderCorteTermicas;

  if (!icc) {
    contenedor.innerHTML = `
      <span class="invalido">
        ⚠️ Falta el dato de corriente de cortocircuito en el origen (Icc). Sin ese valor,
        provisto por la empresa distribuidora, no se puede verificar que las térmicas elegidas
        soporten el cortocircuito (AEA 770, 770.15, pág. 45: PdCcc ≥ I''k).
      </span>`;
    proyectoActual.estado770 = proyectoActual.estado770 || {};
    proyectoActual.estado770.poderCorteOk = null;
    proyectoActual.estado770.poderCorteFaltaDato = true;
    return;
  }

  const cumple = pdc >= icc;
  contenedor.innerHTML = `
    <span class="${cumple ? 'valido' : 'invalido'}">
      PdCcc (${pdc} kA) ${cumple ? '≥' : '<'} I''k (${icc} kA) —
      ${cumple ? '✓ el poder de corte declarado cubre la Icc informada' : '⚠️ el poder de corte declarado NO alcanza: elegir térmicas de mayor PdCcc'}
    </span>`;

  // NUEVO: estado guardado para el semáforo consolidado.
  proyectoActual.estado770 = proyectoActual.estado770 || {};
  proyectoActual.estado770.poderCorteOk = cumple;
  proyectoActual.estado770.poderCorteFaltaDato = false;
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

  evaluarPoderDeCorte();
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
  const ambiente = document.getElementById('ambiente').value.trim();
  const potenciaCircuito = Number(document.getElementById('potenciaCircuito').value);
  const longitud = Number(document.getElementById('longitud').value);
  const caidaMaxima = Number(document.getElementById('caida').value);
  
  if (!tipoCircuito || !ambiente || !potenciaCircuito || !longitud) {
    alert('⚠️ Completa todos los campos');
    return;
  }

  // CORREGIDO: igual que en configurarSistema(), "!potenciaCircuito" y
  // "!longitud" no detectan valores negativos, que producían corrientes
  // y caídas de tensión negativas sin ningún aviso al usuario.
  if (potenciaCircuito <= 0) {
    alert('⚠️ La potencia del circuito debe ser mayor a 0');
    return;
  }
  if (longitud <= 0) {
    alert('⚠️ La longitud del circuito debe ser mayor a 0');
    return;
  }
  
  // CORREGIDO: usa el cos φ propio del tipo de carga (motores/compresores
  // tienen componente inductiva mayor), tomando el más conservador entre
  // ese valor y el cos φ general configurado por el usuario.
  const cosPhiCircuito = obtenerCosPhiCircuito(tipoCircuito, proyectoActual.factorPotencia);

  // NUEVO (AEA 770, Tabla 770.8.I nota 2): la potencia declarada para un
  // circuito de Iluminación (IUG) se toma como potencia instalada, y a
  // los efectos de dimensionar cable/térmica se le aplica el Factor de
  // Simultaneidad 2/3. Para el resto de los circuitos (TUG, cocina,
  // lavarropas, etc.) el factor es 1 (se usa la potencia declarada tal cual).
  const potenciaDPMS = tipoCircuito === 'Iluminación'
    ? potenciaCircuito * FACTOR_SIMULTANEIDAD_IUG
    : potenciaCircuito;

  const corriente = calcularCorriente(potenciaDPMS, proyectoActual.tipoSistema, cosPhiCircuito);
  const circuitosPorCano = Number(document.getElementById('circuitosPorCano')?.value) || 1;

  // NUEVO: bloquea circuitos IUG/TUG/TUE cuya corriente de diseño supera el
  // techo normativo del tipo (ver TECHOS_AEA). Antes la app permitía, por
  // ejemplo, un "Tomacorriente" de 47,85A y le calzaba un cable/térmica de
  // 10mm²/50A — un circuito que no existe en la norma (TUG topea en 20A).
  // Se corta ACÁ, antes de dimensionar nada, en vez de dejar pasar un
  // circuito mal clasificado con un cable "que le entra".
  const techo = TECHOS_AEA[tipoCircuito];
  if (techo && corriente > techo) {
    alert(
      `⚠️ Corriente de diseño demasiado alta para este tipo de circuito.\n\n` +
      `Ib = ${corriente} A, pero "${tipoCircuito}" tiene un techo normativo de ${techo} A (AEA 770).\n\n` +
      `No se agregó el circuito. Opciones:\n` +
      `• Repartir esta carga en más de un circuito de este tipo.\n` +
      (tipoCircuito === 'Tomacorriente'
        ? `• Si es un consumo puntual de un solo artefacto, cargarlo como "Tomacorriente Especial (TUE)" (techo 32A).\n`
        : '') +
      `• Si es un artefacto fijo de alto consumo, cargarlo como circuito dedicado ("Cocina/Comedor", "Aire Acondicionado", "Otro", etc.).`
    );
    return;
  }

  // El mínimo AEA por tipo de circuito (tomas, cocina, lavarropas, etc.)
  // se exige DESDE el cálculo del conductor, no después: así, si el
  // mínimo normativo obliga a una térmica que el cable no soportaría ya
  // agrupado con otros circuitos en el mismo caño, la función sube de
  // sección hasta encontrar una combinación realmente segura (o marca el
  // circuito como fuera de tabla) en vez de forzarla sin verificar.
  const conductor = encontrarConductorConAgrupamiento(corriente, circuitosPorCano, MINIMOS_AEA[tipoCircuito]);

  // La caída de tensión se recalcula con el conductor definitivo
  // (puede haber cambiado de tamaño al aplicar el mínimo AEA).
  const caidaV = calcularCaidaTension(corriente, longitud, conductor.mm2, proyectoActual.tipoSistema);
  const caidaPorcentaje = calcularPorcentajeCaida(caidaV, proyectoActual.tipoSistema);

  // NUEVO (AEA 90364-5-54): sección del conductor de protección/tierra.
  const seccionPE = conductor.mm2 !== '>70' ? calcularSeccionPE(conductor.mm2) : null;
  
  const circuito = {
    id: Date.now(),
    tipoCircuito,
    ambiente,
    potenciaCircuito,
    potenciaDPMS,
    longitud,
    circuitosPorCano,
    caidaMaxima,
    cosPhiCircuito,
    corriente,
    conductor: conductor.mm2,
    disyuntor: conductor.disyuntor,
    // CORREGIDO (bug de coordinación detectado en revisión): se guarda el Iz
    // (corriente admisible del cable) que efectivamente se usó al ELEGIR
    // este conductor/térmica, en vez de tener que volver a buscarlo después
    // por sección (mm2) solamente. La tabla CONDUCTORES_AEA tiene más de
    // una fila para la misma sección con distinto Iz/térmica (ej. 2,5mm²
    // -> 16A y 20A; 10mm² -> 50A y 63A, según el techo del tipo de
    // circuito). Antes, actualizarResumenAuto77015() recalculaba el Iz con
    // obtenerIzAgrupado(mm2), que con esas secciones duplicadas devolvía
    // SIEMPRE la primera fila (el Iz más bajo) sin importar cuál se usó de
    // verdad — por ejemplo, un circuito de 10mm²/63A terminaba comparado
    // contra un Iz de 50A y se marcaba "no cumple coordinación" (In=63 >
    // Iz=50) aunque el conductor elegido fuera correcto. Ahora se guarda el
    // Iz real acá, en el momento en que se conoce sin ambigüedad.
    iz: conductor.amperios,
    seccionPE,
    caidaV,
    caidaPorcentaje,
    valido: validarCaida(caidaPorcentaje, caidaMaxima),
    // NUEVO: indica si la coordinación cable-térmica de este circuito se
    // verificó contra la tabla real de agrupamiento (secciones ≤6mm², que
    // es la que cubre la Guía AEA 770 pág.40) o si, por tratarse de una
    // sección mayor, se usó el criterio de 1 circuito por caño a falta de
    // datos de agrupamiento para esa sección.
    agrupamientoVerificado: conductor.agrupamientoVerificado !== false
  };
  
  proyectoActual.circuitos.push(circuito);
  guardarProyecto();
  renderTablaCircuitos();
  
  // CORREGIDO: "event" acá es el evento "submit" del formulario, que no
  // tiene clientX/clientY (esas propiedades solo existen en eventos de
  // mouse). Antes esto generaba chispas en una posición inválida
  // (NaN, NaN) cada vez que se agregaba un circuito. Ahora se usa la
  // posición del botón que se tocó/clickeó para agregar el circuito
  // (event.submitter, con buen soporte en navegadores modernos), y si
  // no está disponible simplemente se omite el efecto en vez de generar
  // chispas mal ubicadas.
  const boton = event.submitter;
  if (boton && typeof boton.getBoundingClientRect === 'function') {
    const rect = boton.getBoundingClientRect();
    crearExplosionEnClick(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
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
    calcularSemaforoGeneral(); // NUEVO: limpia el semáforo si no quedan circuitos
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
    // NUEVO: aviso cuando la sección (>6mm²) no tiene datos de agrupamiento
    // en la guía y se usó el criterio de 1 circuito por caño como referencia.
    const avisoAgrupamiento = (!fueraDeTabla && circuito.agrupamientoVerificado === false && (circuito.circuitosPorCano || 1) > 1)
      ? ' <span title="Sección >6mm²: sin datos de agrupamiento en la guía AEA 770; verificado con criterio de 1 circuito por caño">⚠️</span>'
      : '';

    tr.innerHTML = `
      <td>${escaparHTML(circuito.tipoCircuito)}</td>
      <td>${escaparHTML(circuito.ambiente)}</td>
      <td>${circuito.potenciaCircuito}${circuito.tipoCircuito === 'Iluminación' ? ` <span style="opacity:0.65;font-size:11px;">(DPMS ×2/3 = ${circuito.potenciaDPMS.toFixed(2)} kW)</span>` : ''}</td>
      <td>${circuito.corriente}</td>
      <td><strong>${circuito.conductor} mm²</strong>${avisoAgrupamiento}</td>
      <td>${circuito.disyuntor} A</td>
      <td>${circuito.circuitosPorCano || 1}</td>
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

  // NUEVO: cada vez que cambia la lista de circuitos (agregar/borrar), se
  // refresca también el semáforo consolidado, aunque no haya cambiado
  // ningún dato de la sección 770 (Icc, I²t, etc.).
  calcularSemaforoGeneral();
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

// CORREGIDO: "Limpiar Todo" decía borrar "todo el proyecto" pero solo
// eliminaba STORAGE_KEY (sistema + circuitos). El checklist de la Sección
// 770 (CHECKLIST_770_KEY) y los ambientes cargados (AMBIENTES_770_KEY)
// quedaban guardados en localStorage y reaparecían después del reload,
// lo cual no coincide con lo que el botón promete al usuario.
function limpiarTodo() {
  if (confirm('¿Eliminar todo el proyecto (sistema, circuitos, checklist y ambientes)? Esta acción no se puede deshacer.')) {
    proyectoActual = {
      tipoSistema: '', potenciaTotal: 0, factorPotencia: 0.95,
      longitudPrincipal: 20, iccOrigen: null, poderCorteTermicas: 6,
      tipoAislacion: 'PVC', i2tTermicas: null, circuitos: []
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(CHECKLIST_770_KEY);
      localStorage.removeItem(AMBIENTES_770_KEY);
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
  const iccOrigen = Number(document.getElementById('iccOrigen').value) || null;
  const poderCorteTermicas = Number(document.getElementById('poderCorteTermicas').value) || 6;
  const tipoAislacion = document.getElementById('tipoAislacion').value || 'PVC';
  const i2tTermicas = Number(document.getElementById('i2tTermicas').value) || null;

  if (!tipoSistema || !potenciaTotal) {
    alert('⚠️ Completa los datos obligatorios');
    return;
  }

  // CORREGIDO: el chequeo "!potenciaTotal" solo detecta 0/vacío, no
  // valores negativos (-5 es "truthy" en JS). Sin esta validación se
  // podía configurar una potencia negativa y obtener corrientes/cables
  // negativos sin ningún aviso.
  if (potenciaTotal <= 0) {
    alert('⚠️ La potencia total contratada debe ser mayor a 0');
    return;
  }
  if (longitudPrincipal <= 0) {
    alert('⚠️ La longitud de la acometida principal debe ser mayor a 0');
    return;
  }
  if (iccOrigen !== null && iccOrigen <= 0) {
    alert('⚠️ La corriente de cortocircuito (Icc) debe ser mayor a 0, o dejar el campo vacío si no se conoce el dato');
    return;
  }
  if (i2tTermicas !== null && i2tTermicas <= 0) {
    alert('⚠️ La energía específica pasante (I²t) debe ser mayor a 0, o dejar el campo vacío si no se conoce el dato');
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
  proyectoActual.iccOrigen = iccOrigen;
  proyectoActual.poderCorteTermicas = poderCorteTermicas;
  proyectoActual.tipoAislacion = tipoAislacion;
  proyectoActual.i2tTermicas = i2tTermicas;
  
  guardarProyecto();
  renderResumenTablero();
  renderTablaCircuitos();
  evaluarVerificacionTermica770(); // NUEVO: refresca la verificación térmica con los datos recién configurados
  // CORREGIDO (bug de sincronización detectado en revisión): antes, la
  // coordinación cable-protección (estado770.coordinacionOk) solo se
  // actualizaba como efecto secundario del MutationObserver que observa
  // la tabla de circuitos (dispara actualizarResumenAuto77015() cuando
  // renderTablaCircuitos(), llamado arriba, reconstruye el <tbody>). Esa
  // llamada ocurre en un microtask que corre DESPUÉS de que esta función
  // termina, así que el calcularSemaforoGeneral() de más abajo podía leer
  // un estado770.coordinacionOk todavía viejo (o undefined en la primera
  // configuración con circuitos ya cargados desde localStorage), mostrando
  // el semáforo con la información de coordinación desactualizada hasta el
  // próximo cambio en la tabla de circuitos o click en "Actualizar". Ahora
  // se llama explícitamente ANTES del semáforo, sin depender del efecto
  // secundario del observer.
  actualizarResumenAuto77015();
  // NUEVO: se recalcula el semáforo DESPUÉS de evaluarVerificacionTermica770()
  // y actualizarResumenAuto77015(), para que use el estado770 recién actualizado
  // (térmica, coordinación) y no uno desfasado de la configuración anterior.
  calcularSemaforoGeneral();
  alert('✓ Sistema configurado correctamente');
}

function initApp() {
  cargarProyecto();
  if (proyectoActual.tipoSistema) {
    document.getElementById('tipoSistema').value = proyectoActual.tipoSistema;
    document.getElementById('potenciaTotal').value = proyectoActual.potenciaTotal;
    document.getElementById('factorPotencia').value = proyectoActual.factorPotencia;
    document.getElementById('longitudPrincipal').value = proyectoActual.longitudPrincipal;
    if (proyectoActual.iccOrigen) document.getElementById('iccOrigen').value = proyectoActual.iccOrigen;
    if (proyectoActual.poderCorteTermicas) document.getElementById('poderCorteTermicas').value = proyectoActual.poderCorteTermicas;
    if (proyectoActual.tipoAislacion) document.getElementById('tipoAislacion').value = proyectoActual.tipoAislacion;
    if (proyectoActual.i2tTermicas) document.getElementById('i2tTermicas').value = proyectoActual.i2tTermicas;
    renderResumenTablero();
    renderTablaCircuitos();
  }
  
  document.getElementById('btnConfigurar').addEventListener('click', configurarSistema);
  document.getElementById('circuitForm').addEventListener('submit', agregarCircuito);
  document.getElementById('btnLimpiarForm').addEventListener('click', () => {
    document.getElementById('circuitForm').reset();
  });

  document.getElementById('tipoCircuito').addEventListener('change', actualizarCaidaSugerida);
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

// CORREGIDO (bug de seguridad detectado en revisión): esta función
// buscaba el Iz por DISYUNTOR en la tabla de 1 circuito por caño
// (CONDUCTORES_AEA), donde cada fila tiene amperios === disyuntor por
// construcción. Eso la volvía una tautología (Iz siempre resultaba igual
// al propio In que se le pasaba), así que la verificación de coordinación
// del checklist 770.15.1-3 daba "cumple" para CUALQUIER circuito, sin
// importar si el cable estaba agrupado con otros circuitos en el mismo
// caño (donde el Iz real es menor). Ahora se busca el Iz por SECCIÓN de
// cable (mm²) y cantidad de circuitos agrupados, usando la misma tabla de
// la pág.40 (CALIBRE_MAX_AGRUPAMIENTO_770) que se usó para dimensionar el
// circuito, así el checklist verifica el mismo Iz que realmente aplica.
function obtenerIzAgrupado(mm2, circuitosPorCano = 1) {
  const tabla = CALIBRE_MAX_AGRUPAMIENTO_770[mm2];
  if (tabla) return tabla[circuitosPorCano] ?? tabla[3];
  // Secciones fuera de la tabla de agrupamiento (>6mm²): se usa el
  // criterio de 1 circuito por caño de CONDUCTORES_AEA (única data
  // disponible en la guía para esas secciones).
  const fila = CONDUCTORES_AEA.find(c => c.mm2 === mm2);
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
// CORREGIDO (bug de lógica detectado en revisión): cada combinación válida
// de esta tabla exige un mínimo de IUG y de TUG por separado (ninguna
// combinación admite 0 de alguno de los dos), pero antes solo se comparaba
// la SUMA (iug+tug) contra "total". Eso dejaba pasar como "cumple" un caso
// como 3 circuitos "Tomacorriente" y 0 "Iluminación" en grado Medio: la suma
// (3) alcanza el total exigido, pero ninguna combinación real de la norma
// admite 0 IUG. Se agregan minIUG/minTUG (el mínimo de cada tipo que
// aparece en TODAS las combinaciones listadas) para detectar ese caso.
// "Superior" exige además 1 circuito "de libre elección" que esta app no
// modela como tipo propio; minIUG/minTUG cubren el piso de IUG/TUG, pero
// igual hace falta un circuito adicional (de cualquier tipo) para llegar
// al total de 6 — eso lo sigue cubriendo la comparación de "total".
const CIRCUITOS_MINIMOS_770_7 = {
  'Mínimo':   { total: 2, minIUG: 1, minTUG: 1, texto: '1 circuito de Iluminación de uso general (IUG) + 1 de Tomacorrientes de uso general (TUG)' },
  'Medio':    { total: 3, minIUG: 1, minTUG: 1, texto: '3 circuitos de uso general: 2 IUG + 1 TUG, o bien 1 IUG + 2 TUG' },
  'Elevado':  { total: 5, minIUG: 2, minTUG: 2, texto: '5 circuitos de uso general: 2 IUG + 3 TUG, o bien 3 IUG + 2 TUG' },
  'Superior': { total: 6, minIUG: 2, minTUG: 2, texto: '6 circuitos: 2 IUG + 3 TUG + 1 de libre elección, o bien 3 IUG + 2 TUG + 1 de libre elección' }
};

// QUITADO tras revisar el texto completo de la Guía AEA 770: este
// "coeficiente de simultaneidad por grado de electrificación" (antes
// etiquetado como 770.8.2) no aparece en ningún lado de la guía. El
// único factor de simultaneidad que el documento confirma es el 2/3
// fijo para IUG (FACTOR_SIMULTANEIDAD_IUG, ya verificado numéricamente
// contra el ejemplo resuelto de la guía) y el factor 1 para TUG/TUE
// (que ya se toma implícito al no aplicar ninguna reducción). No se usaba
// en ningún cálculo de corriente/sección, solo se mostraba en pantalla,
// pero mostrar un número no verificado como si fuera un dato normativo
// es peor que no mostrar nada. Se elimina hasta poder confirmarlo contra
// una fuente (AEA 90364-7-770 vigente completa, no esta guía simplificada).

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

  // Cuenta, sin modificar la lógica original, los circuitos de uso general
  // (Iluminación / Tomacorriente) que ya se cargaron en el panel de circuitos.
  const iug = proyectoActual.circuitos.filter(c => c.tipoCircuito === 'Iluminación').length;
  const tug = proyectoActual.circuitos.filter(c => c.tipoCircuito === 'Tomacorriente').length;
  const totalGeneral = iug + tug;
  // CORREGIDO: además del total, se exige el mínimo de CADA tipo (ver
  // comentario en CIRCUITOS_MINIMOS_770_7). Antes solo se chequeaba la suma.
  const cumpleTotal = totalGeneral >= minimos.total;
  const cumpleIUG = iug >= minimos.minIUG;
  const cumpleTUG = tug >= minimos.minTUG;
  const cumpleMinimo = cumpleTotal && cumpleIUG && cumpleTUG;

  let detalleFaltante = '';
  if (!cumpleMinimo) {
    const faltantes = [];
    if (!cumpleIUG) faltantes.push(`al menos ${minimos.minIUG} de Iluminación (IUG)`);
    if (!cumpleTUG) faltantes.push(`al menos ${minimos.minTUG} de Tomacorriente (TUG)`);
    if (cumpleIUG && cumpleTUG && !cumpleTotal) faltantes.push(`completar el total de ${minimos.total} circuitos de uso general`);
    detalleFaltante = ` — falta ${faltantes.join(' y ')}`;
  }

  contenedor.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">Superficie límite de aplicación:</span><span class="value">${superficieLimite.toFixed(1)} m²</span></div>
      <div class="stat"><span class="label">Grado de electrificación:</span><span class="value">${grado}</span></div>
    </div>
    <p style="margin:10px 0 4px 0;"><strong>Circuitos mínimos exigidos (770.7.5):</strong> ${minimos.texto}</p>
    <p class="${cumpleMinimo ? 'valido' : 'invalido'}" style="margin:4px 0;">
      Circuitos de uso general ya cargados arriba: ${totalGeneral} (IUG: ${iug} · TUG: ${tug})
      — ${cumpleMinimo ? '✓ cumple la cantidad mínima exigida' : `⚠️ no cumple el mínimo exigido${detalleFaltante}`}
    </p>
    <p style="opacity:0.7; font-size:12px; margin-top:6px;">
      Nota: la cantidad y ubicación de los puntos mínimos de utilización por ambiente (bocas de
      iluminación/tomacorrientes según la Tabla 770.7.III) debe verificarse aparte, ambiente por ambiente.
    </p>
  `;
}

// NUEVO (AEA 770, pág. 45, "Verificación térmica de los cables al
// cortocircuito"): k²S² ≥ I²t. Compara la energía específica pasante que
// admite cada conductor (según su sección y tipo de aislación) contra la
// energía específica pasante (I²t) que deja pasar la térmica instalada,
// dato que debe tomarse de la curva del fabricante A LA MISMA Icc
// declarada en "Corriente de cortocircuito presunta en el origen".
//
// LIMITACIÓN DECLARADA: al igual que la verificación de poder de corte,
// esta app usa un único valor de I²t para toda la instalación (no permite
// declarar un valor distinto por térmica/circuito), y no reduce la Icc
// aguas abajo por la impedancia de cada tramo — usa el valor en el
// origen para todos los conductores, que es la hipótesis más conservadora
// (del lado seguro) pero no calcula la Icc real en cada punto.
function evaluarVerificacionTermica770() {
  const contenedor = document.getElementById('resultadoVerificacionTermica770');
  if (!contenedor) return;

  if (!proyectoActual.tipoSistema) {
    contenedor.innerHTML = 'Configurá el sistema para evaluar este punto.';
    return;
  }

  const i2t = proyectoActual.i2tTermicas;
  if (!i2t) {
    contenedor.innerHTML = `
      <span class="invalido">
        ⚠️ Falta el dato de energía específica pasante (I²t) de las térmicas, tomado de la
        curva del fabricante a la Icc declarada. Sin ese valor no se puede verificar
        k²S² ≥ I²t (AEA 770, 770.15, pág. 45).
      </span>`;
    proyectoActual.estado770 = proyectoActual.estado770 || {};
    proyectoActual.estado770.termicaOk = null; // null = no evaluable (falta dato), distinto de false = incumple
    proyectoActual.estado770.termicaFaltaDato = true;
    return;
  }

  const tipoAislacion = proyectoActual.tipoAislacion || 'PVC';
  let items = '';
  let hayProblemas = false;
  let hayNoVerificables = false;

  // Conductor principal (acometida)
  const corrientePrincipal = calcularCorriente(
    proyectoActual.potenciaTotal, proyectoActual.tipoSistema, proyectoActual.factorPotencia
  );
  const conductorPrincipal = encontrarConductor(corrientePrincipal);
  if (conductorPrincipal.mm2 === '>70') {
    hayNoVerificables = true;
    items += `
      <div class="checklist-result-row">
        Acometida principal: sección fuera de tabla — no verificable con esta app.
      </div>`;
  } else {
    const permitida = calcularEnergiaMaximaConductor(conductorPrincipal.mm2, tipoAislacion);
    const cumple = permitida >= i2t;
    if (!cumple) hayProblemas = true;
    items += `
      <div class="checklist-result-row ${cumple ? 'valido' : 'invalido'}">
        Acometida principal (${conductorPrincipal.mm2} mm² · ${tipoAislacion}):
        k²S² = ${Math.round(permitida).toLocaleString('es-AR')} A²s
        ${cumple ? '≥' : '<'} I²t (${Number(i2t).toLocaleString('es-AR')} A²s)
        ${cumple ? ' ✓' : ' ⚠️ conductor insuficiente para el cortocircuito'}
      </div>`;
  }

  // Cada circuito agregado
  proyectoActual.circuitos.forEach(c => {
    if (c.conductor === '>70') {
      hayNoVerificables = true;
      items += `
        <div class="checklist-result-row">
          ${escaparHTML(c.ambiente)}: sección fuera de tabla — no verificable con esta app.
        </div>`;
      return;
    }
    const permitida = calcularEnergiaMaximaConductor(c.conductor, tipoAislacion);
    const cumple = permitida >= i2t;
    if (!cumple) hayProblemas = true;
    items += `
      <div class="checklist-result-row ${cumple ? 'valido' : 'invalido'}">
        ${escaparHTML(c.ambiente)} (${c.conductor} mm² · ${tipoAislacion}):
        k²S² = ${Math.round(permitida).toLocaleString('es-AR')} A²s
        ${cumple ? '≥' : '<'} I²t (${Number(i2t).toLocaleString('es-AR')} A²s)
        ${cumple ? ' ✓' : ' ⚠️ conductor insuficiente para el cortocircuito'}
      </div>`;
  });

  let resumen;
  if (hayProblemas) {
    resumen = '<div class="invalido" style="margin-top:8px;">⚠️ Hay conductores cuya sección no soporta térmicamente la I²t declarada — aumentar sección o instalar una térmica limitadora.</div>';
  } else {
    resumen = '<div class="valido" style="margin-top:8px;">✓ Todos los conductores verificables cumplen k²S² ≥ I²t.</div>';
  }
  if (hayNoVerificables) {
    resumen += '<div style="opacity:0.7; font-size:12px; margin-top:4px;">Hay conductores fuera de la tabla simplificada de esta app; verificarlos manualmente.</div>';
  }

  // NUEVO: se guarda el resultado como estado (no se vuelve a leer del DOM
  // desde otras funciones), para que el semáforo consolidado no dependa
  // del orden en que se llaman las funciones de renderizado.
  proyectoActual.estado770 = proyectoActual.estado770 || {};
  proyectoActual.estado770.termicaOk = !hayProblemas;
  proyectoActual.estado770.termicaFaltaDato = false;

  contenedor.innerHTML = items + resumen + `
    <p style="opacity:0.7; font-size:12px; margin-top:8px;">
      El valor de I²t debe corresponder a la curva del fabricante A LA MISMA Icc declarada
      en "Corriente de cortocircuito presunta en el origen" (${proyectoActual.iccOrigen ? proyectoActual.iccOrigen + ' kA' : 'sin dato'}).
      Se usa el mismo I²t para toda la instalación y la Icc de origen para todos los tramos
      (hipótesis conservadora, no calcula la Icc real aguas abajo de cada protección).
    </p>`;
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
    const fueraDeTabla = c.conductor === '>70';
    // CORREGIDO: se usa el Iz guardado en el propio circuito (c.iz), que es
    // el que realmente se usó al elegir el conductor/térmica, en vez de
    // volver a derivarlo por sección con obtenerIzAgrupado(mm2) — esa
    // función no distingue entre las dos filas que existen para una misma
    // sección con distinto Iz/técnica (ej. 2,5mm² 16A/20A, 10mm² 50A/63A) y
    // siempre devolvía la primera (la de menor Iz), dando falsos "no
    // cumple" en circuitos bien dimensionados. c.iz puede faltar en
    // proyectos guardados en localStorage ANTES de este fix: para esos
    // casos se mantiene obtenerIzAgrupado() como respaldo, igual que antes.
    const iz = fueraDeTabla ? null : (c.iz ?? obtenerIzAgrupado(c.conductor, c.circuitosPorCano || 1));
    const coordinaOk = !fueraDeTabla && iz !== null && c.corriente <= c.disyuntor && c.disyuntor <= iz;
    if (!coordinaOk) hayProblemas = true;
    items += `
      <div class="checklist-result-row ${coordinaOk ? 'valido' : 'invalido'}">
        ${escaparHTML(c.ambiente)} (${escaparHTML(c.tipoCircuito)}): Ib=${c.corriente}A ·
        In=${fueraDeTabla ? '-' : c.disyuntor + 'A'} ·
        Iz=${iz !== null ? iz + 'A' : '-'} (${c.circuitosPorCano || 1} circuito(s)/caño)
        ${coordinaOk ? ' ✓ Coordinación Ib≤In≤Iz cumplida' : ' ⚠️ Revisar coordinación cable/protección'}
      </div>`;
  });

  contenedor.innerHTML = items + (hayProblemas
    ? '<div class="invalido" style="margin-top:8px;">⚠️ Hay circuitos que no cumplen la coordinación cable-protección exigida por 770.15.2/770.15.3.</div>'
    : '<div class="valido" style="margin-top:8px;">✓ Todos los circuitos cumplen la coordinación cable-protección (770.15.1 a 770.15.3).</div>');

  // NUEVO: estado guardado para el semáforo consolidado.
  proyectoActual.estado770 = proyectoActual.estado770 || {};
  proyectoActual.estado770.coordinacionOk = !hayProblemas;
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

  const icc = proyectoActual.iccOrigen;
  const pdc = proyectoActual.poderCorteTermicas;
  const pdcTexto = !icc
    ? 'Falta dato de Icc'
    : (pdc >= icc ? `OK (${pdc}kA ≥ ${icc}kA)` : `⚠️ Insuficiente (${pdc}kA < ${icc}kA)`);

  // NUEVO: estado resumido de la verificación térmica k²S²≥I²t para el stat general.
  // Se lee de proyectoActual.estado770 (calculado por evaluarVerificacionTermica770),
  // no del DOM, para que no dependa del orden de renderizado.
  const i2t = proyectoActual.i2tTermicas;
  const termicaOkGuardado = proyectoActual.estado770?.termicaOk;
  const termicaTexto = !i2t
    ? 'Falta dato de I²t'
    : (termicaOkGuardado === false ? '⚠️ Revisar sección' : 'OK');

  contenedor.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><span class="label">770.14 verificado:</span><span class="value">${marcados}/${idsBooleanos.length}</span></div>
      <div class="stat"><span class="label">770.15.4 DPS:</span><span class="value">${dps ? 'Instalado' : 'Pendiente'}</span></div>
      <div class="stat"><span class="label">770.15.5 Sobretensión perm.:</span><span class="value">${releSobre ? 'Instalado' : 'Pendiente'}</span></div>
      <div class="stat"><span class="label">770.15 Poder de corte (PdCcc≥I''k):</span><span class="value">${pdcTexto}</span></div>
      <div class="stat"><span class="label">770.15 Verif. térmica (k²S²≥I²t):</span><span class="value">${termicaTexto}</span></div>
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
  evaluarVerificacionTermica770(); // NUEVO: k²S² ≥ I²t junto al resto de 770.15
  actualizarResumenPuntosUtilizacion770(); // NUEVO: refresca el resumen de 770.7.III junto con el resto
  calcularEstadoGeneralChecklist770();
  calcularSemaforoGeneral(); // NUEVO: semáforo consolidado de todo el proyecto
  guardarChecklist770();
}

// NUEVO: semáforo consolidado. Solo LEE resultados ya calculados por las
// funciones de verificación (no recalcula nada), para no duplicar lógica
// ni arriesgar que el semáforo diga algo distinto de las secciones de
// detalle. Estados posibles por chequeo: true (cumple), false (no cumple),
// null/undefined (no evaluable todavía por falta de datos o de circuitos).
function calcularSemaforoGeneral() {
  const contenedor = document.getElementById('semaforoGeneral');
  if (!contenedor) return;

  if (!proyectoActual.tipoSistema || proyectoActual.circuitos.length === 0) {
    contenedor.innerHTML = '';
    contenedor.className = 'semaforo-box';
    return;
  }

  const estado = proyectoActual.estado770 || {};

  // Caída de tensión: se recalcula acá el mismo resumen que usa la tabla de
  // circuitos (circuito.valido), sin volver a calcular ninguna caída.
  const circuitosFueraTabla = proyectoActual.circuitos.filter(c => c.conductor === '>70').length;
  const circuitosCaidaExcesiva = proyectoActual.circuitos.filter(c => c.conductor !== '>70' && !c.valido).length;
  const caidaOk = circuitosFueraTabla === 0 && circuitosCaidaExcesiva === 0;

  // NUEVO: faltaba este chequeo. Es el mismo criterio que ya usa
  // renderTablaCircuitos() para pintar el ⚠️ junto al calibre (avisoAgrupamiento):
  // secciones >6mm² agrupadas con más de 1 circuito por caño, para las que
  // esta app no tiene tabla de agrupamiento y usa el criterio conservador de
  // 1 circuito por caño — no es un incumplimiento confirmado, sino algo que
  // hay que verificar aparte, por eso cuenta como "falta dato", no como rojo.
  const circuitosSinDatosAgrupamiento = proyectoActual.circuitos.filter(c =>
    c.conductor !== '>70' && c.agrupamientoVerificado === false && (c.circuitosPorCano || 1) > 1
  ).length;

  // NUEVO: faltaba este chequeo. Mismo criterio que ya usa renderResumenTotal()
  // para la advertencia "La suma de circuitos supera la potencia contratada" —
  // sin factor de simultaneidad, comparación directa carga instalada vs.
  // potencia contratada (conservadora, puede sobrestimar el problema).
  const totalPotenciaCircuitos = proyectoActual.circuitos.reduce((sum, c) => sum + c.potenciaCircuito, 0);
  const potenciaOk = !(proyectoActual.potenciaTotal > 0 && totalPotenciaCircuitos > proyectoActual.potenciaTotal);

  const chequeos = [
    { label: 'Caída de tensión', ok: caidaOk, faltaDato: false },
    { label: 'Coordinación cable-protección (770.15.1-3)', ok: estado.coordinacionOk, faltaDato: estado.coordinacionOk === undefined },
    { label: 'Verificación térmica k²S²≥I²t (770.15)', ok: estado.termicaOk, faltaDato: !!estado.termicaFaltaDato },
    { label: 'Poder de corte PdCcc≥I\'\'k (770.15)', ok: estado.poderCorteOk, faltaDato: !!estado.poderCorteFaltaDato },
    { label: `Agrupamiento >6mm² sin tabla (${circuitosSinDatosAgrupamiento} circuito(s), verificar manualmente)`, ok: circuitosSinDatosAgrupamiento === 0 ? true : undefined, faltaDato: circuitosSinDatosAgrupamiento > 0 },
    { label: 'Potencia contratada vs. suma de circuitos', ok: potenciaOk, faltaDato: false },
  ];

  const conProblema = chequeos.filter(c => c.ok === false);
  const conFaltante = chequeos.filter(c => c.ok === null || c.ok === undefined || c.faltaDato);

  // CORREGIDO: antes, si había al menos un problema (rojo), el bloque
  // "else if" siguiente ni se evaluaba y los pendientes de verificar
  // (amarillo, ej. agrupamiento >6mm² sin tabla) desaparecían del mensaje
  // por completo aunque existieran. Ahora se arman los dos mensajes por
  // separado y se combinan, así el semáforo nunca oculta información que
  // ya tiene calculada.
  let nivel;
  let mensaje = '';
  if (conProblema.length > 0) {
    nivel = 'rojo';
    mensaje += `⚠️ ${conProblema.length} verificación(es) sin cumplir: ${conProblema.map(c => c.label).join(', ')}.`;
  } else if (conFaltante.length > 0) {
    nivel = 'amarillo';
  } else {
    nivel = 'verde';
    mensaje = '✓ Todas las verificaciones disponibles cumplen la Sección 770.';
  }
  if (conFaltante.length > 0 && nivel !== 'verde') {
    mensaje += `${mensaje ? ' ' : ''}ℹ️ Además, faltan datos o verificación manual para: ${conFaltante.map(c => c.label).join(', ')}.`;
  }

  contenedor.className = `semaforo-box semaforo-${nivel}`;
  contenedor.innerHTML = `
    <div class="semaforo-titulo">Estado general del proyecto</div>
    <div class="semaforo-mensaje">${mensaje}</div>
    <p style="opacity:0.75; font-size:12px; margin-top:6px; margin-bottom:0;">
      Resumen automático de los chequeos de la Sección 770 ya calculados en esta página.
      No reemplaza la verificación final por un instalador electricista matriculado.
    </p>
  `;
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
      evaluarVerificacionTermica770(); // NUEVO: recalcula también al agregar/eliminar circuitos
      // NUEVO: sin esta línea, el semáforo (que ya se dispara antes, de forma
      // síncrona, desde renderResumenTotal) queda un paso desactualizado:
      // usaría el estado de coordinación/térmica del circuito ANTERIOR,
      // porque este observer corre después (como microtask) de que el
      // semáforo ya se pintó por primera vez.
      calcularSemaforoGeneral();
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
