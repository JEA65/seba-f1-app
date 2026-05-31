import { useEffect, useMemo, useState } from "react";

const GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyfAvVyrZkK5ql7tFrCvAlphdqgLalrCWpNdM3syU3yXsAkrWKBLkOkNNV1dn-17-C5aw/exec";

const STORAGE_GUARDADOS = "aforos_seba_f1";
const STORAGE_PENDIENTES = "aforos_seba_f1_pendientes";

function num(valor) {
  if (valor === "" || valor === null || valor === undefined) return null;
  const n = Number(String(valor).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function fmt(valor, dec = 3) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return valor.toFixed(dec).replace(".", ",");
}

function calcularVelocidad(pulsos, segundos) {
  const p = num(pulsos);
  const s = num(segundos);

  if (p === null || s === null || s <= 0) {
    return { n: null, v: null, aviso: "" };
  }

  const n = p / s;
  let v = null;
  let aviso = "";

  if (n <= 0) {
    aviso = "n debe ser mayor que 0";
  } else if (n < 1.98) {
    v = 0.0193 + 0.3117 * n;
  } else if (n < 10.27) {
    v = 0.0019 + 0.3205 * n;
  } else if (n < 15) {
    v = -0.1409 + 0.3344 * n;
  } else {
    aviso = "n fuera del rango de calibración: 0 < n < 15";
  }

  return { n, v, aviso };
}

function calcularVertical(v, anterior) {
  const distancia = num(v.distancia);
  const profundidad = num(v.profundidad);

  const v02 = calcularVelocidad(v.p02, v.s02);
  const v06 = calcularVelocidad(v.p06, v.s06);
  const v08 = calcularVelocidad(v.p08, v.s08);

  let vm = null;

  if (v.tipo === "MI" || v.tipo === "MD") {
    vm = 0;
  } else if (v.metodo === "1") {
    vm = v06.v;
  } else if (v.metodo === "2") {
    if (v02.v !== null && v08.v !== null) {
      vm = (v02.v + v08.v) / 2;
    }
  } else if (v.metodo === "3") {
    if (v02.v !== null && v06.v !== null && v08.v !== null) {
      vm = (v02.v + 2 * v06.v + v08.v) / 4;
    }
  }

  let bi = null;
  let ai = null;
  let qi = null;
  let vTramo = null;
  let profundidadMediaTramo = null;

  if (distancia !== null && anterior && anterior.distanciaCalc !== null) {
    bi = distancia - anterior.distanciaCalc;
  }

  if (
    bi !== null &&
    profundidad !== null &&
    anterior &&
    anterior.profundidadCalc !== null
  ) {
    profundidadMediaTramo = (anterior.profundidadCalc + profundidad) / 2;
    ai = bi * profundidadMediaTramo;
  }

  if (ai !== null && vm !== null && anterior && anterior.vm !== null) {
    vTramo = (anterior.vm + vm) / 2;
    qi = ai * vTramo;
  }

  const avisos = [];

  if (distancia === null) avisos.push("Falta distancia.");
  if (profundidad === null) avisos.push("Falta profundidad.");
  if (profundidad !== null && profundidad < 0) {
    avisos.push("La profundidad no puede ser negativa.");
  }

  if (v.tipo === "MI" && distancia !== 0) {
    avisos.push("MI debe tener distancia 0 m.");
  }

  if (bi !== null && bi < 0) {
    avisos.push("La distancia acumulada es menor que la del punto anterior.");
  }

  if (bi !== null && bi === 0 && anterior) {
    avisos.push("El ancho parcial es 0. Revisar distancia acumulada.");
  }

  if (
    v.tipo === "normal" &&
    profundidad !== null &&
    profundidad > 0.8 &&
    v.metodo === "1"
  ) {
    avisos.push("Profundidad mayor a 0,80 m: considerar método de 2 puntos.");
  }

  [v02, v06, v08].forEach((vel) => {
    if (vel.aviso) avisos.push(vel.aviso);
  });

  return {
    ...v,
    distanciaCalc: distancia,
    profundidadCalc: profundidad,
    v02,
    v06,
    v08,
    vm,
    vTramo,
    profundidadMediaTramo,
    bi,
    ai,
    qi,
    avisos,
  };
}

function crearMI() {
  return {
    id: crypto.randomUUID(),
    nombre: "MI",
    tipo: "MI",
    distancia: "0",
    profundidad: "",
    metodo: "margen",
    p02: "",
    s02: "60",
    p06: "",
    s06: "60",
    p08: "",
    s08: "60",
  };
}

function crearMD() {
  return {
    id: crypto.randomUUID(),
    nombre: "MD",
    tipo: "MD",
    distancia: "",
    profundidad: "",
    metodo: "margen",
    p02: "",
    s02: "60",
    p06: "",
    s06: "60",
    p08: "",
    s08: "60",
  };
}

function crearVertical(numero) {
  return {
    id: crypto.randomUUID(),
    nombre: `V${numero}`,
    tipo: "normal",
    distancia: "",
    profundidad: "",
    metodo: "1",
    p02: "",
    s02: "60",
    p06: "",
    s06: "60",
    p08: "",
    s08: "60",
  };
}

export default function App() {
  const [datos, setDatos] = useState({
    estacion: "",
    codigo: "",
    curso: "",
    lugar: "",
    fecha: new Date().toISOString().slice(0, 10),
    operador: "",
    hg: "",
    he: "",
    observaciones: "",
  });

  const [verticales, setVerticales] = useState([crearMI(), crearMD()]);
  const [estadoSync, setEstadoSync] = useState("");
  const [mostrarAyuda, setMostrarAyuda] = useState(true);

  const calculadas = useMemo(() => {
    const salida = [];

    for (const v of verticales) {
      const anterior = salida.length > 0 ? salida[salida.length - 1] : null;
      salida.push(calcularVertical(v, anterior));
    }

    return salida;
  }, [verticales]);

  const resumen = useMemo(() => {
    const area = calculadas.reduce((s, v) => s + (v.ai || 0), 0);
    const caudal = calculadas.reduce((s, v) => s + (v.qi || 0), 0);

    const distancias = calculadas
      .map((v) => v.distanciaCalc)
      .filter((v) => v !== null);

    const ancho =
      distancias.length > 0
        ? Math.max(...distancias) - Math.min(...distancias)
        : 0;

    const velocidadMedia = area > 0 ? caudal / area : null;
    const profundidadMedia = ancho > 0 ? area / ancho : null;

    return { area, caudal, ancho, velocidadMedia, profundidadMedia };
  }, [calculadas]);

  useEffect(() => {
    sincronizarPendientes();

    window.addEventListener("online", sincronizarPendientes);

    return () => {
      window.removeEventListener("online", sincronizarPendientes);
    };
  }, []);

  function actualizarDato(campo, valor) {
    setDatos({ ...datos, [campo]: valor });
  }

  function actualizarVertical(id, campo, valor) {
    setVerticales(
      verticales.map((v) => (v.id === id ? { ...v, [campo]: valor } : v))
    );
  }

  function agregarVerticalDebajo(idReferencia) {
    const cantidad = verticales.filter((v) => v.tipo === "normal").length;
    const nueva = crearVertical(cantidad + 1);
    const indice = verticales.findIndex((v) => v.id === idReferencia);

    if (indice === -1) return;

    const nuevasVerticales = [...verticales];
    nuevasVerticales.splice(indice + 1, 0, nueva);

    setVerticales(nuevasVerticales);
  }

  function eliminarVertical(id) {
    setVerticales(verticales.filter((v) => v.id !== id || v.tipo !== "normal"));
  }

  function generarIdAforo() {
    const codigoLimpio =
      datos.codigo.trim().replaceAll(" ", "_").replaceAll("/", "-") || "SIN_CODIGO";

    const fechaHora = new Date()
      .toISOString()
      .replaceAll("-", "")
      .replaceAll(":", "")
      .replace("T", "_")
      .slice(0, 15);

    return `${codigoLimpio}_${fechaHora}`;
  }

  function armarPayload(idAforo) {
    return {
      aforo: {
        id_aforo: idAforo,
        fecha_aforo: datos.fecha,
        estacion: datos.estacion,
        codigo: datos.codigo,
        curso: datos.curso,
        lugar: datos.lugar,
        operador: datos.operador,
        hg: num(datos.hg),
        he: num(datos.he),
        metodo_integracion: "trapecios",
        area_total_m2: resumen.area,
        velocidad_media_ms: resumen.velocidadMedia,
        caudal_total_m3s: resumen.caudal,
        profundidad_media_m: resumen.profundidadMedia,
        ancho_m: resumen.ancho,
        observaciones: datos.observaciones,
      },

      verticales: calculadas.map((v, index) => ({
        orden: index + 1,
        nombre_vertical: v.nombre,
        tipo: v.tipo,
        distancia_m: v.distanciaCalc,
        profundidad_m: v.profundidadCalc,
        metodo: v.metodo,
        pulsos_02: num(v.p02),
        segundos_02: num(v.s02),
        n_02: v.v02.n,
        v_02: v.v02.v,
        pulsos_06: num(v.p06),
        segundos_06: num(v.s06),
        n_06: v.v06.n,
        v_06: v.v06.v,
        pulsos_08: num(v.p08),
        segundos_08: num(v.s08),
        n_08: v.v08.n,
        v_08: v.v08.v,
        vm_vertical: v.vm,
        v_tramo: v.vTramo,
        profundidad_media_tramo: v.profundidadMediaTramo,
        bi_m: v.bi,
        ai_m2: v.ai,
        qi_m3s: v.qi,
        avisos: v.avisos.join(" | "),
      })),
    };
  }

  async function enviarAGoogleSheets(payload) {
    const respuesta = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const texto = await respuesta.text();
    const data = JSON.parse(texto);

    if (!data.ok) {
      throw new Error(data.error || "No se pudo guardar en Google Sheets.");
    }

    return data;
  }

  function guardarEnLocal(aforo) {
    const guardados = JSON.parse(localStorage.getItem(STORAGE_GUARDADOS) || "[]");
    guardados.push(aforo);
    localStorage.setItem(STORAGE_GUARDADOS, JSON.stringify(guardados));
  }

  function agregarPendiente(payload) {
    const pendientes = JSON.parse(localStorage.getItem(STORAGE_PENDIENTES) || "[]");
    pendientes.push(payload);
    localStorage.setItem(STORAGE_PENDIENTES, JSON.stringify(pendientes));
  }

  async function guardarLocal() {
    const idAforo = generarIdAforo();
    const payload = armarPayload(idAforo);

    try {
      await enviarAGoogleSheets(payload);

      guardarEnLocal({
        id: idAforo,
        fechaGuardado: new Date().toISOString(),
        datos,
        verticales,
        resumen,
        sincronizado: true,
      });

      setEstadoSync("Aforo guardado y sincronizado en Google Sheets.");
      alert("Aforo guardado y sincronizado en Google Sheets.");
    } catch (error) {
      guardarEnLocal({
        id: idAforo,
        fechaGuardado: new Date().toISOString(),
        datos,
        verticales,
        resumen,
        sincronizado: false,
      });

      agregarPendiente(payload);

      setEstadoSync(
        "Aforo guardado localmente. Queda pendiente para sincronizar cuando vuelva internet."
      );

      alert(
        "Aforo guardado en este dispositivo. No se pudo sincronizar ahora, pero queda pendiente para subir cuando vuelva internet."
      );
    }
  }

  async function sincronizarPendientes() {
    const pendientes = JSON.parse(localStorage.getItem(STORAGE_PENDIENTES) || "[]");

    if (pendientes.length === 0) return;

    const noSincronizados = [];

    for (const payload of pendientes) {
      try {
        await enviarAGoogleSheets(payload);
      } catch (error) {
        noSincronizados.push(payload);
      }
    }

    localStorage.setItem(STORAGE_PENDIENTES, JSON.stringify(noSincronizados));

    if (pendientes.length > noSincronizados.length) {
      setEstadoSync("Se sincronizaron aforos pendientes.");
    }
  }

  function exportarCSV() {
    const encabezado = [
      "nombre",
      "tipo",
      "distancia_m",
      "profundidad_m",
      "metodo",
      "n_02",
      "v_02",
      "n_06",
      "v_06",
      "n_08",
      "v_08",
      "vm_vertical",
      "v_tramo",
      "profundidad_media_tramo",
      "bi",
      "ai_trapecio",
      "qi",
    ];

    const filas = calculadas.map((v) => [
      v.nombre,
      v.tipo,
      fmt(v.distanciaCalc),
      fmt(v.profundidadCalc),
      v.metodo,
      fmt(v.v02.n),
      fmt(v.v02.v),
      fmt(v.v06.n),
      fmt(v.v06.v),
      fmt(v.v08.n),
      fmt(v.v08.v),
      fmt(v.vm),
      fmt(v.vTramo),
      fmt(v.profundidadMediaTramo),
      fmt(v.bi),
      fmt(v.ai),
      fmt(v.qi, 4),
    ]);

    const resumenCSV = [
      [],
      ["metodo_integracion", "trapecios"],
      ["Q_total_m3s", fmt(resumen.caudal, 4)],
      ["Area_total_m2", fmt(resumen.area)],
      ["Velocidad_media_ms", fmt(resumen.velocidadMedia)],
      ["Profundidad_media_m", fmt(resumen.profundidadMedia)],
      ["Ancho_m", fmt(resumen.ancho)],
      ["Hg", fmt(num(datos.hg))],
      ["He", fmt(num(datos.he))],
    ];

    const csv = [encabezado, ...filas, ...resumenCSV]
      .map((fila) => fila.join(";"))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `aforo_seba_${datos.codigo || "sin_codigo"}_${datos.fecha}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function limpiar() {
    const ok = confirm("¿Seguro que querés limpiar el aforo actual?");
    if (!ok) return;

    setDatos({
      estacion: "",
      codigo: "",
      curso: "",
      lugar: "",
      fecha: new Date().toISOString().slice(0, 10),
      operador: "",
      hg: "",
      he: "",
      observaciones: "",
    });

    setVerticales([crearMI(), crearMD()]);
    setEstadoSync("");
  }

  const puedeCargar = datos.estacion.trim() !== "" && datos.codigo.trim() !== "";

  return (
    <>
      <style>{css}</style>

      <div className="page">
        <div className="container">
          <header className="header">
            <div>
              <p className="small-title">
                Prototipo offline / online - para completar en campo
              </p>
              <h1>Aforo con molinete SEBA F1</h1>
              <p className="subtitle">
                Carga guiada de margen izquierda, verticales y margen derecha.
                Calcula n, velocidad media, áreas por trapecios y caudal.
              </p>
            </div>

            <ActionButtons
              guardarLocal={guardarLocal}
              exportarCSV={exportarCSV}
              limpiar={limpiar}
            />
          </header>

          {estadoSync && <section className="sync-box">{estadoSync}</section>}

          <section className="card">
            <h2>1. Datos iniciales</h2>

            <div className="form-grid">
              <Campo
                label="Nombre de estación *"
                value={datos.estacion}
                onChange={(v) => actualizarDato("estacion", v)}
              />
              <Campo
                label="Código *"
                value={datos.codigo}
                onChange={(v) => actualizarDato("codigo", v)}
              />
              <Campo
                label="Curso de agua"
                value={datos.curso}
                onChange={(v) => actualizarDato("curso", v)}
              />
              <Campo
                label="Lugar / partido"
                value={datos.lugar}
                onChange={(v) => actualizarDato("lugar", v)}
              />
              <Campo
                label="Fecha"
                type="date"
                value={datos.fecha}
                onChange={(v) => actualizarDato("fecha", v)}
              />
              <Campo
                label="Operador"
                value={datos.operador}
                onChange={(v) => actualizarDato("operador", v)}
              />
              <Campo
                label="Hg"
                value={datos.hg}
                onChange={(v) => actualizarDato("hg", v)}
              />
              <Campo
                label="He"
                value={datos.he}
                onChange={(v) => actualizarDato("he", v)}
              />
            </div>

            <label className="label">Observaciones</label>
            <textarea
              className="textarea"
              value={datos.observaciones}
              onChange={(e) => actualizarDato("observaciones", e.target.value)}
              placeholder="Condiciones del sitio, vegetación, remanso, lluvia, seguridad, etc."
            />
          </section>

          {!puedeCargar && (
            <section className="warning">
              Para comenzar, cargá al menos el nombre de la estación y el código.
            </section>
          )}

          {puedeCargar && (
            <>
              <section className="card">
                <div className="section-title">
                  <div>
                    <h2>2. Criterio de carga y cálculo</h2>
                    <p className="subtitle">
                      Ayuda rápida para evitar errores de carga en campo.
                    </p>
                  </div>

                  <button
                    className="btn secondary"
                    onClick={() => setMostrarAyuda(!mostrarAyuda)}
                  >
                    {mostrarAyuda ? "Ocultar ayuda" : "Ver ayuda"}
                  </button>
                </div>

                {mostrarAyuda && (
                  <div className="help-box">
                    <p>
                      La sección se calcula desde <strong>MI</strong> hasta{" "}
                      <strong>MD</strong>. MI corresponde a la margen izquierda y
                      MD a la margen derecha, definidas mirando el curso de agua en
                      el sentido del escurrimiento. Ambos puntos deben representar
                      los bordes del área mojada.
                    </p>

                    <p>
                      Las distancias deben cargarse como{" "}
                      <strong>progresivas acumuladas desde MI</strong>. Por ejemplo:
                      MI = 0, V1 = 1,50 m, V2 = 3,00 m, V3 = 4,50 m y MD = 6,00 m.
                      No deben cargarse como anchos parciales.
                    </p>

                    <p>
                      La profundidad de MI y MD puede ser 0 o mayor que 0, según la
                      condición real del borde mojado. Para el cálculo del caudal, la
                      velocidad en MI y MD se considera nula.
                    </p>

                    <p>
                      El área parcial se calcula por trapecios entre puntos
                      consecutivos y el caudal parcial se obtiene con la velocidad
                      media del tramo. El caudal total resulta de la suma de los
                      caudales parciales.
                    </p>
                  </div>
                )}
              </section>

              <section className="card">
                <div className="section-title">
                  <div>
                    <h2>3. Carga de márgenes y verticales</h2>
                    <p className="subtitle">
                      En cada vertical seleccioná método de 1, 2 o 3 puntos.
                    </p>
                  </div>
                </div>

                {calculadas.map((v) => (
                  <div key={v.id} className="vertical-card">
                    <div className="vertical-grid">
                      <Campo
                        label="Nombre"
                        value={v.nombre}
                        disabled={v.tipo !== "normal"}
                        onChange={(val) => actualizarVertical(v.id, "nombre", val)}
                      />

                      <Campo
                        label="Tipo"
                        value={
                          v.tipo === "MI"
                            ? "Margen izquierda"
                            : v.tipo === "MD"
                            ? "Margen derecha"
                            : "Vertical"
                        }
                        disabled
                      />

                      <Campo
                        label="Distancia acumulada desde MI [m]"
                        value={v.distancia}
                        onChange={(val) => actualizarVertical(v.id, "distancia", val)}
                      />

                      <Campo
                        label="Profundidad [m]"
                        value={v.profundidad}
                        onChange={(val) =>
                          actualizarVertical(v.id, "profundidad", val)
                        }
                      />

                      <div>
                        <label className="label">Método</label>
                        <select
                          className="input"
                          value={v.metodo}
                          disabled={v.tipo !== "normal"}
                          onChange={(e) =>
                            actualizarVertical(v.id, "metodo", e.target.value)
                          }
                        >
                          <option value="margen">Margen</option>
                          <option value="1">1 punto: 0,6 h</option>
                          <option value="2">2 puntos: 0,2 / 0,8 h</option>
                          <option value="3">3 puntos: 0,2 / 0,6 / 0,8 h</option>
                        </select>
                      </div>

                      {v.tipo === "normal" && (
                        <button
                          className="btn danger small"
                          onClick={() => eliminarVertical(v.id)}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>

                    {v.tipo === "normal" && (
                      <div className="puntos-grid">
                        {(v.metodo === "2" || v.metodo === "3") && (
                          <Punto
                            titulo="0,2 h"
                            pulsos={v.p02}
                            segundos={v.s02}
                            n={v.v02.n}
                            vel={v.v02.v}
                            onP={(val) => actualizarVertical(v.id, "p02", val)}
                            onS={(val) => actualizarVertical(v.id, "s02", val)}
                          />
                        )}

                        {(v.metodo === "1" || v.metodo === "3") && (
                          <Punto
                            titulo="0,6 h"
                            pulsos={v.p06}
                            segundos={v.s06}
                            n={v.v06.n}
                            vel={v.v06.v}
                            onP={(val) => actualizarVertical(v.id, "p06", val)}
                            onS={(val) => actualizarVertical(v.id, "s06", val)}
                          />
                        )}

                        {(v.metodo === "2" || v.metodo === "3") && (
                          <Punto
                            titulo="0,8 h"
                            pulsos={v.p08}
                            segundos={v.s08}
                            n={v.v08.n}
                            vel={v.v08.v}
                            onP={(val) => actualizarVertical(v.id, "p08", val)}
                            onS={(val) => actualizarVertical(v.id, "s08", val)}
                          />
                        )}
                      </div>
                    )}

                    <div className="result-grid">
                      <Resultado label="Vm vertical" value={`${fmt(v.vm)} m/s`} />
                      <Resultado label="V tramo" value={`${fmt(v.vTramo)} m/s`} />
                      <Resultado label="Bi" value={`${fmt(v.bi)} m`} />
                      <Resultado
                        label="Ai trapecio"
                        value={`${fmt(v.ai)} m²`}
                      />
                      <Resultado label="qi" value={`${fmt(v.qi, 4)} m³/s`} />
                    </div>

                    {v.avisos.length > 0 && (
                      <div className="warning-small">
                        {v.avisos.map((a, i) => (
                          <div key={i}>• {a}</div>
                        ))}
                      </div>
                    )}

                    {v.tipo !== "MD" && (
                      <div className="add-below">
                        <button
                          className="btn primary full-mobile"
                          onClick={() => agregarVerticalDebajo(v.id)}
                        >
                          Agregar vertical debajo
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </section>

              <section className="resultado-final">
                <h2>Resultado del aforo</h2>

                <div className="final-grid">
                  <ResultadoFinal
                    label="Caudal total"
                    value={`${fmt(resumen.caudal, 4)} m³/s`}
                  />
                  <ResultadoFinal
                    label="Área total"
                    value={`${fmt(resumen.area)} m²`}
                  />
                  <ResultadoFinal
                    label="Velocidad media"
                    value={`${fmt(resumen.velocidadMedia)} m/s`}
                  />
                  <ResultadoFinal
                    label="Profundidad media"
                    value={`${fmt(resumen.profundidadMedia)} m`}
                  />
                  <ResultadoFinal label="Ancho" value={`${fmt(resumen.ancho)} m`} />
                  <ResultadoFinal label="Hg" value={`${fmt(num(datos.hg))} m`} />
                  <ResultadoFinal label="He" value={`${fmt(num(datos.he))} m`} />
                  <ResultadoFinal label="Método" value="Trapecios" />
                </div>

                <div className="bottom-actions">
                  <ActionButtons
                    guardarLocal={guardarLocal}
                    exportarCSV={exportarCSV}
                    limpiar={limpiar}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ActionButtons({ guardarLocal, exportarCSV, limpiar }) {
  return (
    <div className="button-row">
      <button className="btn primary" onClick={guardarLocal}>
        Guardar
      </button>
      <button className="btn secondary" onClick={exportarCSV}>
        Exportar CSV
      </button>
      <button className="btn danger" onClick={limpiar}>
        Limpiar
      </button>
    </div>
  );
}

function Campo({ label, value, onChange, type = "text", disabled = false }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

function Punto({ titulo, pulsos, segundos, n, vel, onP, onS }) {
  return (
    <div className="punto">
      <strong>{titulo}</strong>

      <div className="two-cols">
        <Campo label="Pulsos" value={pulsos} onChange={onP} />
        <Campo label="Segundos" value={segundos} onChange={onS} />
      </div>

      <p className="calculo-linea">
        n = {fmt(n)} · V = {fmt(vel)} m/s
      </p>
    </div>
  );
}

function Resultado({ label, value }) {
  return (
    <div className="result-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultadoFinal({ label, value }) {
  return (
    <div className="final-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const css = `
* {
  box-sizing: border-box;
}

html, body, #root {
  margin: 0;
  min-height: 100%;
}

body {
  background: #071923;
}

.page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(34, 211, 238, 0.16), transparent 35%),
    linear-gradient(180deg, #071923 0%, #041018 100%);
  padding: 24px;
  font-family: Arial, sans-serif;
  color: #e6f7ff;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  background: rgba(11, 42, 56, 0.96);
  border: 1px solid #1e6f8f;
  border-radius: 22px;
  padding: 24px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  box-shadow: 0 4px 22px rgba(0, 0, 0, 0.4);
}

.small-title {
  margin: 0;
  color: #67e8f9;
  font-weight: bold;
  text-transform: uppercase;
  font-size: 13px;
}

h1 {
  margin: 6px 0;
  font-size: 32px;
  color: #ffffff;
}

h2 {
  margin-top: 0;
  color: #ffffff;
}

p {
  line-height: 1.45;
}

.subtitle {
  color: #b6dce8;
  margin: 6px 0;
}

.button-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  border: none;
  border-radius: 12px;
  padding: 11px 15px;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
}

.btn.primary {
  background: #00a6c8;
  color: #ffffff;
}

.btn.secondary {
  background: #dff8ff;
  color: #064e63;
}

.btn.danger {
  background: #7f1d1d;
  color: #ffffff;
  border: 1px solid #fecaca;
}

.btn.small {
  height: 42px;
  align-self: end;
}

.card {
  background: rgba(15, 52, 68, 0.97);
  border: 1px solid #1e6f8f;
  border-radius: 22px;
  padding: 22px;
  margin-bottom: 20px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.vertical-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
  gap: 12px;
  align-items: end;
}

.label {
  display: block;
  font-size: 13px;
  font-weight: bold;
  color: #b6f3ff;
  margin-bottom: 5px;
}

.input,
.textarea,
select {
  width: 100%;
  border: 1px solid #38bdf8;
  border-radius: 12px;
  padding: 11px;
  font-size: 15px;
  background: #ffffff;
  color: #0f172a;
  -webkit-text-fill-color: #0f172a;
  caret-color: #0f172a;
}

.input:disabled,
select:disabled {
  background: #dbeafe;
  color: #334155;
  -webkit-text-fill-color: #334155;
}

.textarea {
  min-height: 84px;
  resize: vertical;
}

.warning {
  background: #fef3c7;
  color: #78350f;
  border-radius: 18px;
  padding: 18px;
  margin-bottom: 20px;
  font-weight: bold;
}

.warning-small {
  background: #fef3c7;
  color: #78350f;
  border-radius: 14px;
  padding: 10px;
  margin-top: 12px;
  font-size: 14px;
}

.sync-box {
  background: #cffafe;
  color: #164e63;
  border-radius: 18px;
  padding: 14px 18px;
  margin-bottom: 20px;
  font-weight: bold;
}

.help-box {
  background: rgba(2, 19, 29, 0.56);
  border: 1px solid #38bdf8;
  border-radius: 18px;
  padding: 16px;
  margin-top: 14px;
  color: #e6f7ff;
}

.help-box p {
  margin-top: 0;
}

.help-box p:last-child {
  margin-bottom: 0;
}

.section-title {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: center;
}

.vertical-card {
  border: 1px solid #38bdf8;
  border-radius: 20px;
  padding: 16px;
  margin-top: 16px;
  background: rgba(9, 34, 49, 0.98);
}

.puntos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.punto {
  background: #0f3444;
  border: 1px solid #38bdf8;
  border-radius: 16px;
  padding: 12px;
}

.two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 10px;
}

.calculo-linea {
  font-size: 13px;
  color: #d4f7ff;
  margin-bottom: 0;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.result-box {
  background: #dff8ff;
  color: #082f49;
  border-radius: 14px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.result-box span,
.final-box span {
  font-size: 13px;
  opacity: 0.85;
}

.add-below {
  margin-top: 14px;
}

.resultado-final {
  background: rgba(2, 19, 29, 0.98);
  color: white;
  border: 1px solid #38bdf8;
  border-radius: 22px;
  padding: 24px;
  margin-bottom: 40px;
  box-shadow: 0 4px 22px rgba(0, 0, 0, 0.44);
}

.final-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.final-box {
  background: #0ea5c6;
  color: #ffffff;
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.final-box strong {
  font-size: 20px;
}

.bottom-actions {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid rgba(56, 189, 248, 0.35);
}

@media (max-width: 720px) {
  .page {
    padding: 10px;
  }

  .header,
  .card,
  .resultado-final {
    border-radius: 16px;
    padding: 15px;
  }

  h1 {
    font-size: 24px;
  }

  h2 {
    font-size: 19px;
  }

  .button-row {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
  }

  .btn {
    width: 100%;
    padding: 13px 14px;
    font-size: 15px;
  }

  .form-grid,
  .vertical-grid,
  .puntos-grid,
  .result-grid,
  .final-grid {
    grid-template-columns: 1fr;
  }

  .two-cols {
    grid-template-columns: 1fr 1fr;
  }

  .input,
  .textarea,
  select {
    font-size: 16px;
    padding: 13px;
  }

  .vertical-card {
    padding: 13px;
  }

  .full-mobile {
    width: 100%;
  }

  .final-box strong {
    font-size: 22px;
  }

  .small-title {
    font-size: 12px;
  }
}
`;