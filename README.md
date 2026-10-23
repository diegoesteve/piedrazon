# Piedrazón · Granizo en Córdoba

Monitor experimental y **no oficial** de granizo para la provincia de Córdoba. Proyecto personal, sin fines comerciales.

Página: https://diegoesteve.github.io/piedrazon/

## Qué hace

- **Ahora (radar):** cada 15 minutos lee los núcleos de tormenta de los radares del
  [Observatorio Hidro-Meteorológico de Córdoba](https://webmet.ohmc.ar/) y marca las localidades con posible granizo.
- **Próximos días (pronóstico):** cada 6 horas mira en [Open-Meteo](https://open-meteo.com) si se juntan los
  ingredientes del granizo en cada municipio y comuna: riesgo *alto*, *moderado* o *bajo*.
- **Alertas del SMN:** muestra las alertas naranjas y rojas por tormentas del Servicio Meteorológico Nacional.

Las reglas son orientativas: un pronóstico de condiciones, no de granizo seguro. No reemplaza los avisos del SMN ni de
Defensa Civil. Emergencias: 103 o 911.

## Este repo

Tiene la página (`docs/`, publicada con GitHub Pages) y los datos que se actualizan solos (`docs/data/`, `data/`).
Los scripts que calculan los datos están en un repo aparte; los workflows de `.github/workflows/` los bajan en cada
corrida con el secreto `CODIGO_TOKEN`.

Cada alarma queda en `data/historial_alarmas.csv` (las del pronóstico, en `data/historial_alarmas_pronostico.csv`). Las
columnas `que_paso` y `fuente_medios` se completan a mano con lo que informaron los medios, para medir aciertos y
falsas alarmas.


## Licencia

Sin fines comerciales: código con licencia [PolyForm Noncommercial 1.0.0](LICENSE) y datos y textos propios con
[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.es). Ver [LICENCIAS.md](LICENCIAS.md). Los datos de
terceros (OHMC, Open-Meteo, SMN, GeoRef, OpenStreetMap) conservan su licencia.
