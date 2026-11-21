# Fase 1 — La cámara te lleva hasta la pieza (fase C del plan)

> Solo `app/`: módulo nativo `capo-ar` y la pantalla del escáner. No toca `api/`.
> Decisión (2026-11-21): la vibración se hace con el feedback háptico nativo de Android, sin `expo-haptics`. Así no hay dependencia nueva ni permiso. No cubre: si el usuario apagó la vibración al tocar en los ajustes del teléfono, no vibra.

## Done cuando

Con el mapa del motor fijado y una pieza elegida, al girar el teléfono hasta dejar la pieza fuera de cuadro aparece una flecha en el borde de la pantalla que apunta hacia ella. Al volver a encuadrarla se ve la distancia a la pieza, y al dejarla en el centro la app muestra «La encontraste» y el teléfono vibra una vez.

## Contrato [CONGELADO]

### Evento nativo `onGuia`

Lo emite la vista `CapoAr` unas 10 veces por segundo, solo mientras hay una pieza elegida (`selectedPart ≥ 0`) y el mapa de piezas tiene seguimiento.

```ts
type GuiaAR = {
  part: number;      // índice del volumen en el catálogo, el mismo de `selectedPart` y `onPart`
  x: number;         // posición en la vista, 0 = borde izquierdo, 1 = borde derecho
  y: number;         // 0 = borde superior, 1 = borde inferior
  visible: boolean;  // la pieza está delante de la cámara y dentro de la vista
  distance: number;  // metros entre el teléfono y el centro de la pieza
};
```

`x` e `y` pueden salirse de 0–1. Si la pieza queda detrás de la cámara, vienen fuera de rango en la dirección hacia la que hay que girar, nunca reflejadas. El centro de la pieza es el promedio de los vértices de su cara superior.

### Método nativo `pulso()`

`VistaARRef.pulso(): Promise<void>`. Hace vibrar el teléfono una vez.

## Nativo (`app/modules/capo-ar/`)

| Archivo | Cambio |
|---|---|
| `android/…/Guia.kt` (nuevo) | `GuideTarget` y la función pura `guideTarget(clipX, clipY, clipW, distance)` |
| `android/…/EngineMesh.kt` | `center(part)`: centro de la cara superior de un volumen |
| `android/…/CapoArView.kt` | Evento `onGuia`, emitido desde `onDrawFrame` con un tope de 10 Hz, y `pulso()`. La lógica vive en `Guia.kt`; aquí queda solo la llamada |
| `android/…/CapoArModule.kt` | Registra `onGuia` y `pulso`; `selectedPart` también llega a la vista |
| `index.ts` | Tipos `GuiaAR`, `onGuia` y `pulso` |

## App (`app/src/escaner/`)

| Archivo | Cambio |
|---|---|
| `guide.ts` (nuevo) | Funciones puras: dónde va la flecha y hacia dónde apunta, cuándo la pieza cuenta como encontrada, y el texto de la distancia |
| `PartGuide.tsx` (nuevo) | La capa de guiado. Guarda su propio estado y recibe los eventos por una ref, para que `EscanerAR` no se vuelva a dibujar 10 veces por segundo |
| `EscanerAR.tsx` | Conecta `onGuia` con `PartGuide` y le pasa la pieza elegida. Cambio mínimo |

Reglas de `guide.ts`:

- **Flecha:** se muestra cuando `visible` es falso. Va en el punto donde la línea del centro de la vista hacia (`x`, `y`) corta un marco interior, y gira para apuntar en esa dirección. El marco deja libre la barra superior, el banner del chat y el panel inferior: va del 28 % al 60 % del alto de la vista.
- **Encontrada:** la pieza está centrada si es visible y queda a menos de 0,18 del centro en cada eje. Pasa a encontrada con 3 eventos centrados seguidos, y deja de estarlo con 5 seguidos sin centrar. Un cambio de pieza reinicia todo.
- **Distancia:** bajo 1 m, en centímetros redondeados a 5 («45 cm»); desde 1 m, en metros con un decimal y coma («1,2 m»).

Textos: «La encontraste» y la distancia. La flecha no lleva texto.

## Tests (se escriben ANTES)

| # | Caso | Lado | Tipo |
|---|---|---|---|
| 1 | Con la pieza a la derecha fuera de cuadro, la flecha queda en el borde derecho y apunta a la derecha; lo mismo arriba, abajo e izquierda | app | unit |
| 2 | Con una vista más alta que ancha y la pieza en diagonal, la flecha queda dentro del marco y su ángulo usa píxeles, no coordenadas normalizadas | app | unit |
| 3 | 3 eventos centrados seguidos marcan encontrada una sola vez; 2 no | app | unit |
| 4 | Ya encontrada, 4 eventos sin centrar la mantienen y el quinto la suelta | app | unit |
| 5 | Un evento de otra pieza reinicia la racha | app | unit |
| 6 | La distancia se formatea como «45 cm», «95 cm» y «1,2 m» | app | unit |
| 7 | `guideTarget` delante y dentro, delante y fuera, y detrás de la cámara (sin reflejar) | nativo | unit (JUnit) |
| 8 | `npx tsc --noEmit` en `app/`, sin errores | app | typecheck |

Los de la app se corren con `cd app && npx tsx --test src/escaner/*.test.ts`.

## Verificación manual

- **El Kotlin no se compila en las PR**: solo al mergear a `dev`, cuando el CI arma el APK. El test 7 necesita un entorno con Gradle.
- En el teléfono: el recorrido del «Done cuando», y que la flecha no tiemble ni quede tapada por el banner del chat o el panel inferior.

## Fuera de alcance en esta fase

El resaltado de la pieza (fase B), indicaciones por voz (fase I), guiar hacia el vano antes de fijar el mapa, y el escáner sin ARCore.
