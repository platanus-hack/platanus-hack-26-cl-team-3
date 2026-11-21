// Vuelca a texto simple lo que la app le manda a la vista nativa para un vehículo: los volúmenes del catálogo y las
// filas del HUD. Lo usa dibujar.sh.
import { writeFileSync } from 'node:fs';

import { engineMaps } from '../../app/src/engine-maps/catalog';
import { hudPart } from '../../app/src/engine-maps/hud';

const [vehicle, dir] = process.argv.slice(2);
const map = engineMaps[vehicle as keyof typeof engineMaps];
if (!map) throw new Error(`Sin mapa para «${vehicle}». Opciones: ${Object.keys(engineMaps).join(', ')}`);
writeFileSync(`${dir}/volumenes.txt`, map.volumes.map((v) => `${v.height};${v.outline.map((p) => p.join(',')).join(' ')}`).join('\n'));
writeFileSync(`${dir}/filas.tsv`, map.volumes.map((v) => hudPart(v.part).join('\t')).join('\n'));
