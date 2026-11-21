import type { WarningLight } from './recognize';

export const manualUrl = 'https://autoauxiliary.com/wp-content/uploads/2022/11/2016-subaru-outback-owners-manual.pdf';
export const guide = {
  oilPressure: { title: 'Presión de aceite', page: '3-15 y 3-16', text: 'Si sigue encendido con el motor en marcha, la presión de lubricación podría ser baja. Detente en un lugar seguro y apaga el motor. Revisa el nivel de aceite. Si el nivel es normal o el testigo persiste, solicita asistencia antes de continuar.' },
  charge: { title: 'Sistema de carga', page: '3-15', text: 'Si sigue encendido con el motor en marcha, el sistema de carga podría estar fallando. Detente en un lugar seguro, apaga el motor y solicita asistencia.' },
  fuel: { title: 'Reserva de combustible', page: '3-21', text: 'El nivel de combustible es bajo. Carga combustible cuanto antes.' },
  seatbelt: { title: 'Cinturón de seguridad', page: '3-12 y 3-13', text: 'Comprueba que el conductor y el acompañante tengan abrochados sus cinturones antes de avanzar.' },
} satisfies Record<WarningLight, { title: string; page: string; text: string }>;
