<p align="center"><img src="project-logo.png" width="140" alt="Hoodini"></p>

# Hoodini

Hoodini is an Android guide for drivers looking under the hood. Ask why the windshield washers have stopped working and the assistant can open the camera at the washer reservoir. An arrow points toward the part when it is outside the frame. As you move closer, the distance indicator and a vibration help you find it without looking away from the engine.

Built for the Platanus Hack *Physical World* track, Hoodini uses the 2016 Subaru Outback 3.6R as its physical reference. Its model contains 27 parts, including nine routine maintenance items. The app lists ten vehicles, each with its own level of coverage. Part positions are approximate, and placement error on the car has yet to be measured in centimeters.

[Download the Android APK](https://github.com/platanus-hack/platanus-hack-26-cl-team-3/releases/latest)

## How a part stays in view

Three distinct problems sit behind a label that appears to stay on the engine as the driver moves.

1. **Find the engine bay.** A CLIPSeg encoder and a decoder trained on engine-bay footage identify the outline between the fenders, windshield and front of the car. A battery and an air box look different across models, but the bay outline gives the scanner a place to start on each vehicle. The quantized ONNX model runs on the phone, so finding the bay works without a connection. [Detector and training notes](herramientas/vano-motor/README.md)
2. **Fit the vehicle map.** For the Outback, DINOv2 turns small image regions into descriptors that can be matched against known landmarks from reference photos. The APK carries the descriptors and the encoder. Reference manifests record which images produced them, so a contributor can rebuild the bank and evaluate it on another Outback of the same variant. An optional server-assisted mode sends a crop of the bay to Claude for a second way to locate visible parts. [Landmark preparation](herramientas/outback-landmarks/README.md) · [Server-assisted locator](api/src/locate/)
3. **Keep the overlay in place.** A native Kotlin module uses ARCore tracking and depth to anchor the bay in space. Observations from several viewpoints help when the whole bay will not fit in one frame. The scanner chooses an observed frame for the initial fit, keeping its image, camera pose and depth together as the phone moves. OpenGL draws the model from the phone’s changing viewpoint. Expo, React Native and Expo Router handle the screens around this loop, including vehicle selection and the handoff from chat to camera. [Android module](app/modules/capo-ar/) · [Scanner](app/src/escaner/)

## How a question reaches the right part

The selected vehicle determines which tools the Node.js and TypeScript API gives Claude. On the Outback, a question about the windshield washer can lead to a reservoir guide or a fuse lookup. Tap the citation for the front washer circuit and Hoodini opens the engine fuse panel at slot 37. If the citation spans several slots, it opens the panel so the driver can see the group. [Vehicle profiles](api/src/vehicles/registry.ts) · [Citation routing](app/src/chat/camera.ts)

**Manual search.** The API can search the 566-page North American Outback manual and read adjacent pages when a procedure continues. A bilingual glossary maps Chilean terms such as *sapito* to English manual vocabulary. Search ranks pages with BM25, and answers can cite the printed page the driver can turn to. The index is prepared separately from a checksum-verified third-party copy. Safety-critical details still need confirmation against the manual for the actual vehicle. [Index preparation and retrieval evaluation](docs/specs/manual/README.md)

**Parts and fuses.** Part cards carry a source and an identifier that the camera guide can highlight. The Outback fuse data covers both the cabin and engine boxes and ties each circuit to a manual page. The dashboard guide also links four supported warning lights to their manual entries. [Part and fuse data](api/src/data/) · [Camera tools](api/src/tools/) · [Dashboard guide](app/src/dashboard/guide.ts)

**Conversation in the scanner.** The driver can start and end a voice conversation from the camera. ElevenLabs transcribes speech, and the server holds the provider credentials. Chat and voice require connectivity. Depending on the feature, the server receives text, audio or an engine-bay crop. Saved conversation history replaces images with a text placeholder. [Scanner](app/src/escaner/) · [Transcription](api/src/transcribe/) · [History storage](api/src/conversations/)

## How the app selects a vehicle

The driver can select a vehicle manually or scan a Chilean license plate. The phone reads the plate locally and sends the normalized text to the API. The driver confirms the returned vehicle. The app keeps the registered year and uses an exact catalog match or an explicit engine-and-year alias to select a map. For example, the 2015 Outback 3.6R can use the 2016 engine-bay layout. [Plate selection](app/src/plates/)

| Selected vehicle | Available guidance |
| --- | --- |
| 2016 Subaru Outback 3.6R | Landmark-registered 3D map, part cards, manual search, fuse diagrams and dashboard indicators. |
| 2017 Suzuki Swift 1.2 | Depth-anchored 3D service parts and assistant tools to look up, highlight and lift supported parts. |
| 2022 RAM 700 Big Horn 1.4 Fire | Depth-anchored 3D service parts. The assistant has no verified RAM manual or parts profile. |
| Other catalog vehicles | Approximate engine-bay templates. A plate outside the catalog retains its registered details even when there is no matching map. |

The app uses these capabilities to choose its screens, and the API selects tools from the vehicle profile. That keeps an Outback fuse rating out of an answer about a Swift. [App capabilities](app/src/capacidades.ts) · [Assistant profiles](api/src/vehicles/registry.ts)

A Python importer turns public Chilean inspection archives into a read-only SQLite snapshot. It verifies the source hashes and database integrity before publishing the snapshot. Keeping that index on the server makes millions of vehicle records searchable without adding them to the APK. Existing host records take precedence when the imported snapshot also has a match. [Data sources and import procedure](scripts/prt/README.md)

## Browser edition

The installable PWA answers a smaller question on devices with a browser camera. Is an open engine bay in view? A worker runs a quantized CLIP encoder with ONNX Runtime Web, leaving the interface free to handle the camera and controls. Frames stay on the device. Once the service worker caches the model and WebAssembly runtime, the detector works offline. The AR part guide is available on Android. [Web client](web/) · [Open-hood detector](herramientas/detector-capo/README.md)

To preview the PWA locally, run these commands from the repository root and open `http://localhost:8080`. A phone accessing the site over the network requires HTTPS for camera access. Allow about 89 MB for the model on the first visit, plus the runtime.

```sh
docker build -t capo-ar .
docker run --rm -p 127.0.0.1:8080:8080 capo-ar
```

## Development and delivery

Hoodini retains its original Android package name, `com.capoar.app`, so existing installations can receive updates. The `capoar` URL scheme and native module names also retain their original identifiers.

| Task | Entry point |
| --- | --- |
| Run the assistant locally | In `api/`, use Node 22.13 or later, run `npm ci` and then `npm start`. The API listens on port 8787. Set `ANTHROPIC_API_KEY` for chat and `ELEVENLABS_API_KEY` for dictation. Set `HISTORIAL_DB` to enable SQLite conversation history and turn logs. |
| Connect an Android build | Set `EXPO_PUBLIC_API_URL` in `app/.env.local` before building. Release APKs require an HTTPS endpoint. |
| Run focused checks | In `api/`, run `npm test`. In `app/`, install dependencies and run `npx tsx --test src/chat/*.test.ts` for the chat client. |
| Build the ARM64 APK | The [Linux packaging script](scripts/compilar-apk.sh) requires the Android SDK and 5 GB of available memory. It prepares the models and writes `dist/capo-ar.apk`. [Android CI](.github/workflows/android.yml) checks the package identity, update code, signing certificate and bundled Outback asset before publication. The public hackathon signing key preserves update compatibility. Use the project release link above for downloads. |
| Inspect the service layout | [Docker Compose](docker-compose.yml) defines the web client, API and vehicle-data seed. Traefik routes the web client and API under one hostname. The API reads the vehicle snapshot and stores conversation history on a separate writable volume. |

## Project conventions

Hoodini is an informational guide. Confirm maintenance instructions in the owner's manual for the exact vehicle and consult a qualified mechanic when needed. Keep the first-use notice accessible in the app. Cite the document, section and page when available. Leave unsupported specifications unanswered and avoid inferring that a hazard is absent.

Check redistribution rights before adding manuals, models, datasets or reference photos. Keep personal information out of the public repository and external service requests, including contributor identities and images of people or license plates. The plate lookup sends the plate text to the project API.

[Team brief](docs/brief.md) · [Development plan](docs/plan.md) · [Engine map authoring guide](docs/engine-map-style.md)
