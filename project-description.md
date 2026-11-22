# Hoodini

**Abre el capó y ve lo que no ves.** Una app Android que, al apuntar la cámara al motor de tu auto, marca en realidad aumentada dónde está cada pieza que un conductor puede revisar y te guía paso a paso.

## El problema

Mucha gente nunca ha mirado bajo el capó. No sabe cuál es el «sapito», dónde está la varilla del aceite ni cuál es la tapa del refrigerante, y por una revisión básica termina pagándole a un mecánico o buscando en un manual de 500 páginas. Los asistentes de chat explican, pero no te muestran *dónde* está la pieza en *tu* auto.

## Qué hace

- **Reconoce el vano del motor** apuntando la cámara. El reconocimiento corre en el teléfono, sin internet.
- **Lo ancla en el espacio con ARCore** y dibuja sobre el motor real las piezas del auto: un modelo 3D del Subaru Outback 2016 3.6R con 27 piezas, de las cuales 9 son las de mantención básica.
- **Te lleva hasta la pieza:** una flecha cuando está fuera de cuadro, la distancia mientras te acercas y un aviso con vibración cuando la encontraste.
- **Conversa contigo:** un chat y un modo en vivo por voz responden «no sale agua del limpiaparabrisas» con pasos cortos, citan la fuente y abren la cámara directamente en la pieza que toca revisar.
- **Reconoce el auto por su patente chilena** y los **testigos encendidos del tablero** del Outback.

## Cómo está hecho

- **Detector del vano propio:** CLIPSeg (Apache-2.0) con un decodificador que entrenamos con cuadros de video, exportado a ONNX int8 y ejecutado en el teléfono.
- **Realidad aumentada nativa en Kotlin:** ARCore para el seguimiento, la profundidad y el anclaje; un registro por varias vistas que arma el vano aunque no quepa en el cuadro; el modelo 3D se dibuja en OpenGL.
- **App** en Expo y React Native, con módulos nativos propios.
- **Asistente:** Claude Sonnet 5.5 por la API de Anthropic, con herramientas que entregan solo datos citables del auto; dictado con ElevenLabs. Servidor en Node y TypeScript.

## Por qué es Physical World

La entrada es una señal física (la cámara, la profundidad y el movimiento del teléfono) y la salida cae sobre el mundo real: la marca se queda pegada al motor de verdad mientras te mueves. No se simula nada de la percepción.

## Privacidad

El vano se reconoce en el teléfono. Al usar el chat o la voz salen el texto de la pregunta, el recorte del vano y el audio de la pregunta hacia los servicios de IA; no se envían fotos de personas ni de patentes. La patente se lee en el propio teléfono.

## Estado y límites

Es un prototipo de hackathon, validado sobre **un** auto: un Subaru Outback 2016 3.6R.

- La ubicación de las piezas es **aproximada**: sale de una plantilla trazada sobre fotos de referencia, ajustada al vano que ve la cámara. Todavía no medimos su error en centímetros sobre el auto.
- Las fichas de piezas y la tabla de fusibles vienen de fuentes de terceros y deben contrastarse con el manual físico del auto.
- El chat y la voz necesitan conexión al servidor del proyecto.
- Hay 8 modelos de auto en el menú, pero solo el Outback tiene el modelo 3D y las pruebas.

> **Esta app es una guía informativa. No reemplaza el manual del propietario ni a un mecánico. Confirma siempre con el manual de tu vehículo antes de actuar.**

## Descarga

APK de Android: <https://github.com/platanus-hack/platanus-hack-26-cl-team-3/releases/latest>
