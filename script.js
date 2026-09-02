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
    
    // CONCATENACIÓN ESTÁNDAR COMPATIBLE: Elimina el texto plano en el PDF y en pantalla
    tr.innerHTML = 
      '<td>' + circuito.tipoCircuito + '</td>' +
      '<td>' + circuito.ambiente + '</td>' +
      '<td>' + circuito.potenciaCircuito + ' kW</td>' +
      '<td>' + circuito.corriente + ' A</td>' +
      '<td><strong>' + circuito.conductor + ' mm²</strong></td>' +
      '<td>' + circuito.disyuntor + ' A</td>' +
      '<td class="' + estadoClass + '">' + circuito.caidaV + 'V (' + circuito.caidaPorcentaje + '%)</td>' +
      '<td><button data-id="' + circuito.id + '" class="btn-delete" title="Eliminar">🗑</button></td>';
      
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
  
  let advertencia = '✓ Todos los circuitos cumplen normativa AEA';
  if (circuitosValidos < circuitosTotal) {
    advertencia = '⚠️ ' + (circuitosTotal - circuitosValidos) + ' circuito(s) con caída excesiva o fuera de norma';
  } else if (totalPotencia > proyectoActual.potenciaTotal) {
    advertencia = '⚠️ Alerta: ¡La suma de los circuitos supera la potencia total configurada!';
  }
  
  resumenBox.innerHTML = 
    '<div class="stats-grid">' +
      '<div class="stat"><span class="label">Total Circuitos:</span><span class="value">' + circuitosTotal + '</span></div>' +
      '<div class="stat"><span class="label">Potencia total:</span><span class="value">' + totalPotencia.toFixed(2) + ' kW</span></div>' +
      '<div class="stat"><span class="label">Corriente Total:</span><span class="value">' + totalCorriente.toFixed(2) + ' A</span></div>' +
      '<div class="stat" style="grid-column: 1/-1;"><span class="label">' + advertencia + '</span></div>' +
    '</div>';
}

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
    spark.style.transform = `rotate(\${deg}deg)`;
    
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
