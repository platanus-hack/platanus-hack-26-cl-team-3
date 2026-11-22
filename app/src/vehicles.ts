export const vehicles = [
  { id: 'outback', name: 'Subaru Outback', year: 2016, engine: '3.6R (EZ36)' },
  { id: 'swift', name: 'Suzuki Swift', year: 2017, engine: '1.2' },
  { id: 'onix', name: 'Chevrolet Onix Plus LTZ', year: 2023, engine: '1.0 turbo' },
  { id: 'tracker', name: 'Chevrolet Tracker', year: 2023, engine: '1.2 turbo' },
  { id: 'rio', name: 'Kia Rio', year: 2023, engine: '1.4 MPI' },
  { id: 'tucson', name: 'Hyundai Tucson', year: 2025, engine: 'Smartstream G2.0 MPI' },
  { id: 'ranger', name: 'Ford Ranger', year: 2022, engine: '2.2 TDCi diésel' },
  { id: 'corolla', name: 'Toyota Corolla Sedán XSE', year: 2020, engine: '2.0 (M20A-FKS)' },
  { id: 'cx5', name: 'Mazda CX-5 Touring', year: 2021, engine: '2.5 Skyactiv-G' },
] as const;

export type Vehicle = (typeof vehicles)[number];
