import { router } from 'expo-router';

import { PantallaAviso } from '../PantallaAviso';

export default function Aviso() {
  return <PantallaAviso primerUso={false} onListo={() => router.back()} />;
}
