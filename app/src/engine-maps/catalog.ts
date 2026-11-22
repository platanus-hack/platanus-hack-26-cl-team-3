import { outbackVolumes } from './outback-volumes';
import type { Vehicle } from '../vehicles';

export const parts = {
  fuses: ["Caja de fusibles del motor","Consulta el plano de la caja y coteja su etiqueta con la del vehículo."],
  washer: ["Sapito","Tapa del depósito del líquido limpiaparabrisas."],
  dipstick: ["Varilla de aceite","Manilla de la varilla que se usa para revisar el nivel de aceite."],
  coolant: ["Depósito de refrigerante","Identifica el depósito y consulta en el manual cómo leer sus marcas de nivel."],
  air_filter: ["Caja del filtro de aire","Carcasa del filtro de aire del motor."],
  oil_cap: ["Tapa de aceite","Punto de llenado de aceite del motor."],
  brake_fluid: ["Depósito de líquido de frenos","Identifica el depósito y consulta en el manual cómo leer sus marcas de nivel."],
  battery: ["Batería","Ubicación de la batería de 12 V."],
  positive: ["Borne positivo","Terminal positivo de la batería."],
  engine_cover: ["Cubierta del motor", "Cubierta central con el emblema Subaru sobre el motor bóxer de seis cilindros."],
  intake_snorkel: ["Toma frontal de aire", "Conducto ancho que lleva aire desde el frente del auto hasta la caja del filtro."],
  intake_hose: ["Manguito de admisión", "Tramo que une la salida de la caja del filtro con la admisión bajo la cubierta."],
  abs_unit: ["Unidad hidráulica ABS", "Bloque hidráulico y bomba a los que llegan las tuberías rígidas de freno."],
  left_strut_mount: ["Copela delantera izquierda", "Soporte superior de la suspensión izquierda del vehículo, junto al depósito de frenos."],
  right_strut_mount: ["Copela delantera derecha", "Soporte superior de la suspensión derecha del vehículo, detrás del módulo ABS."],
  radiator_cap: ["Tapa de presión del radiador", "Tapa metálica con advertencia junto al depósito de expansión. Ábrela solo con el motor completamente frío."],
  upper_hose: ["Manguera superior del radiador", "Tramo visible de la manguera gruesa que llega al radiador por delante del motor."],
  battery_hold_down: ["Abrazadera de la batería", "Barra transversal que sujeta la batería a su bandeja."],
  hood_latch: ["Cierre del capó", "Mecanismo de enganche situado al centro del travesaño delantero."],
  radiator_support: ["Cubierta del soporte del radiador", "Cubierta plástica del travesaño delantero, a un lado del cierre del capó."],
  coolant_cap: ["Tapa del depósito de expansión", "Tapa amarilla del depósito translúcido, junto a la tapa metálica del radiador."],
  brake_cap: ["Tapa del líquido de frenos", "Tapa amarilla del depósito de frenos, cerca del parabrisas."],
  filter_outer_clip: ["Broche exterior del filtro de aire", "Cierre metálico de la carcasa del filtro, junto al guardabarros."],
  filter_inner_clip: ["Broche interior del filtro de aire", "Cierre metálico de la carcasa del filtro más cercano al motor."],
  negative: ["Borne negativo", "Terminal metálico sin cubierta roja, conectado al cable de masa de la batería."],
  metal_pulley: ["Polea metálica de accesorios", "Cara metálica visible bajo el borde frontal de la cubierta, detrás de la manguera."],
  dark_pulley: ["Polea negra de accesorios", "Cara oscura visible bajo la cubierta central, al lado opuesto de la manguera."],
} as const;

export type PartId = keyof typeof parts;
type Point = readonly [number, number];

export type Volume = {
  part: PartId;
  outline: readonly Point[];
  height: number;
  follows?: PartId;
};

export type EngineMap = {
  referenceVariant: string;
  volumes: readonly Volume[];
  fuseUrl?: string;
  partDetails?: Partial<Record<PartId, string>>;
};

// Visible faces use coordinates from 0 to 1 in each reference image axis.
// Android scales approximate extrusion heights by the measured bay width.
export const engineMaps: Record<Vehicle['id'], EngineMap> = {
  outback: {
    referenceVariant: "3.6R Limited · EZ36 · Norteamérica",
    fuseUrl: "https://viewer.joomag.com/subaru-outback-manuals-2016-outback-owners-manual/0118822001437148001/p532",
    partDetails: {
      fuses: "Caja negra detrás de la batería, hacia el parabrisas. El plano del motor muestra el fusible 17 (O2 HTR) de 25 A para el 3.6 L. Coteja posición y amperaje con la etiqueta de la tapa. Manual, págs. 11-38 y 12-12 a 12-13.",
      washer: "Boca de llenado junto a la batería, hacia el costado del conductor en la versión con volante a la izquierda. Agrega líquido limpiaparabrisas hasta la marca FULL. En la foto se reconoce por la tapa amarilla en el borde del vano. Manual, págs. 11-10 y 11-32.",
      dipstick: "Manilla amarilla pequeña junto a la tapa de aceite, hacia el frente. Con el auto nivelado y el motor apagado, espera unos minutos. Saca la varilla, límpiala, insértala hasta el fondo y vuelve a sacarla para leer entre LOW y FULL. Manual, págs. 11-11 y 11-12.",
      coolant: "Depósito translúcido cerca del frente, junto al radiador. Lee LOW y FULL desde afuera con el motor frío. Evita abrir la tapa del radiador con el motor caliente. Manual, págs. 11-10 y 11-14.",
      air_filter: "Carcasa negra conectada al conducto corrugado de admisión, al lado opuesto de la batería. Los broches sujetan la tapa de la carcasa. Manual, págs. 11-15 y 11-16.",
      oil_cap: "Tapa amarilla redonda junto a la manilla de la varilla. Es la boca de llenado del aceite del motor. Manual, págs. 11-11 y 11-12.",
      brake_fluid: "Depósito pequeño y translúcido cerca del parabrisas. En el 3.6 L, lee MIN y MAX desde la cara exterior, hacia el guardabarros. Manual, págs. 11-19 y 11-20.",
      battery: "Batería de 12 V delante de la caja de fusibles y junto a la boca del limpiaparabrisas. Manual, págs. 11-10 y 11-37.",
      positive: "Borne identificado con el símbolo +. En la foto de referencia está bajo la cubierta roja. Consulta el procedimiento de arranque con cables del manual.",
    },
    volumes: outbackVolumes,
  },
  swift: {
    referenceVariant: "1.2 · Vehículo de referencia de 2017",
    volumes: [
      { part: 'brake_fluid', height: 0.052733, outline: [[0.73005, 0.08521], [0.73702, 0.10337], [0.73998, 0.11793], [0.75054, 0.21401], [0.75058, 0.23293], [0.74562, 0.24961], [0.73567, 0.25612], [0.72316, 0.25078], [0.71121, 0.23496], [0.70403, 0.2174], [0.69943, 0.19708], [0.68685, 0.10091], [0.68687, 0.0831], [0.6924, 0.06695], [0.70272, 0.06077], [0.7181, 0.0682]] },
      { part: 'brake_cap', height: 0.034484, outline: [[0.73891, 0.10529], [0.74052, 0.12647], [0.73769, 0.1424], [0.73093, 0.15246], [0.72129, 0.15496], [0.71032, 0.14949], [0.69978, 0.13696], [0.69133, 0.11945], [0.68583, 0.09777], [0.68416, 0.0772], [0.68624, 0.06112], [0.69244, 0.04947], [0.70314, 0.04567], [0.71568, 0.05272], [0.72611, 0.06671], [0.73387, 0.0842]] },
    ],
    partDetails: {
      brake_fluid: "Depósito de líquido de frenos junto a la batería y al parabrisas.",
      brake_cap: "Tapa del depósito de líquido de frenos.",
    },
  },
  onix: {
    referenceVariant: "LTZ · 1.0 turbo · Brasil",
    fuseUrl: "https://www.chevrolet.cl/content/dam/chevrolet/south-america/chile/espanol/index/fichas-tecnicas/manuales/pdf/manual-onix.pdf#page=192",
    volumes: [
      { part: 'washer', outline: [[0.0176,0.5036],[0.0234,0.4893],[0.0381,0.4821],[0.0508,0.4911],[0.0498,0.5071],[0.042,0.5286],[0.0273,0.5375],[0.0176,0.5268]], height: 0.0127 },
      { part: 'coolant', outline: [[0.0605,0.3768],[0.0693,0.3393],[0.0859,0.3179],[0.082,0.2946],[0.0889,0.2696],[0.1104,0.2643],[0.127,0.2732],[0.1318,0.2946],[0.1396,0.3161],[0.1533,0.3304],[0.166,0.3661],[0.1699,0.4071],[0.1572,0.45],[0.1357,0.4732],[0.1084,0.4786],[0.084,0.4643],[0.0654,0.4375]], height: 0.0283 },
      { part: 'oil_cap', outline: [[0.4053,0.4321],[0.4131,0.4179],[0.4326,0.4161],[0.4424,0.425],[0.4434,0.4429],[0.4336,0.4554],[0.416,0.4554],[0.4062,0.4464]], height: 0.0127 },
      { part: 'dipstick', outline: [[0.3652,0.4929],[0.3721,0.4804],[0.3818,0.4804],[0.3887,0.4911],[0.3887,0.5054],[0.3838,0.5196],[0.3721,0.5232],[0.3711,0.5125],[0.3662,0.5071]], height: 0.0146 },
      { part: 'brake_fluid', outline: [[0.6182,0.2304],[0.625,0.2143],[0.6396,0.2089],[0.6543,0.2196],[0.6592,0.2375],[0.6543,0.2643],[0.6445,0.2875],[0.6299,0.2839],[0.6221,0.2643]], height: 0.0166 },
      { part: 'air_filter', outline: [[0.6357,0.575],[0.666,0.5446],[0.6865,0.4929],[0.709,0.4804],[0.7363,0.4946],[0.7656,0.5036],[0.7803,0.5196],[0.7578,0.5571],[0.7295,0.6],[0.6934,0.6321],[0.6562,0.6464]], height: 0.0322 },
      { part: 'battery', outline: [[0.6826,0.3196],[0.6963,0.3018],[0.7344,0.3],[0.7471,0.3196],[0.7676,0.3893],[0.7734,0.4411],[0.7549,0.4661],[0.7109,0.475],[0.6875,0.4518]], height: 0.0322 },
      { part: 'fuses', outline: [[0.8301,0.3125],[0.8506,0.2982],[0.9062,0.3018],[0.9258,0.3375],[0.9531,0.4071],[0.9551,0.4339],[0.9463,0.4607],[0.8613,0.4732],[0.8535,0.4536],[0.8418,0.3821]], height: 0.0332 },
      { part: 'positive', outline: [[0.8037,0.3482],[0.834,0.3446],[0.8418,0.3732],[0.8418,0.3946],[0.8516,0.4411],[0.8496,0.4643],[0.8174,0.4643],[0.8135,0.4286],[0.8047,0.3982]], height: 0.0156 },
    ],
  },
  tracker: {
    referenceVariant: "1.2 turbo · Chile",
    fuseUrl: "https://www.chevrolet.cl/content/dam/chevrolet/south-america/chile/espanol/index/fichas-tecnicas/manuales/pdf/manual-tracker.pdf#page=189",
    volumes: [
      { part: 'fuses', outline: [[0.8277,0.3091],[0.903,0.303],[0.9129,0.3364],[0.9139,0.5394],[0.904,0.5788],[0.8238,0.5788],[0.8238,0.3818]], height: 0.046 },
      { part: 'washer', outline: [[0.1436,0.6273],[0.1574,0.6212],[0.1673,0.6485],[0.1663,0.6879],[0.1574,0.7091],[0.1416,0.7],[0.1366,0.6636]], height: 0.023 },
      { part: 'dipstick', outline: [[0.3842,0.6121],[0.396,0.6121],[0.4,0.6273],[0.396,0.6576],[0.3851,0.6576],[0.3802,0.6424]], height: 0.028 },
      { part: 'coolant', outline: [[0.1069,0.3364],[0.1109,0.2727],[0.1228,0.2485],[0.1426,0.2545],[0.1535,0.2879],[0.1564,0.3333],[0.1723,0.3818],[0.1782,0.4606],[0.1713,0.5273],[0.1554,0.5576],[0.1257,0.5697],[0.101,0.5485],[0.0901,0.5061],[0.0891,0.4333],[0.096,0.3818]], height: 0.054 },
      { part: 'air_filter', outline: [[0.6465,0.6242],[0.6743,0.6091],[0.7168,0.6061],[0.7426,0.6152],[0.7545,0.6394],[0.7416,0.6576],[0.7109,0.6818],[0.6832,0.7303],[0.6525,0.7788],[0.6307,0.7758],[0.6228,0.7394],[0.6327,0.6818]], height: 0.044 },
      { part: 'oil_cap', outline: [[0.4218,0.503],[0.4366,0.497],[0.4475,0.5061],[0.4525,0.5303],[0.4485,0.5545],[0.4366,0.5667],[0.4257,0.5606],[0.4188,0.5424],[0.4188,0.5182]], height: 0.026 },
      { part: 'brake_fluid', outline: [[0.6297,0.1545],[0.6396,0.1424],[0.6505,0.1485],[0.6624,0.1758],[0.6624,0.2182],[0.6535,0.2545],[0.6386,0.2667],[0.6267,0.2455],[0.6218,0.2121],[0.6228,0.1818]], height: 0.035 },
      { part: 'battery', outline: [[0.6752,0.3364],[0.7406,0.3212],[0.7505,0.3485],[0.7535,0.4606],[0.7743,0.4788],[0.7851,0.5242],[0.7822,0.5758],[0.6812,0.5758],[0.6703,0.5455],[0.6703,0.3727]], height: 0.046 },
      { part: 'positive', outline: [[0.7921,0.4061],[0.8129,0.403],[0.8188,0.4333],[0.8198,0.5333],[0.8149,0.5636],[0.7931,0.5636],[0.7881,0.5364],[0.7891,0.4394]], height: 0.026 },
    ],
  },
  rio: {
    referenceVariant: "1.4 MPI · Manual Kia en español",
    fuseUrl: "https://ownersmanual.kia.com/full_webhelp/SC/2023/es_ES/topics/chapter8_16_3.html",
    volumes: [
      { part: 'fuses', outline: [[0.7793,0.3204],[0.7926,0.3028],[0.8593,0.3099],[0.8859,0.3697],[0.8948,0.4437],[0.8815,0.5],[0.8133,0.5],[0.7941,0.4507]], height: 0.026 },
      { part: 'washer', outline: [[0.1763,0.5563],[0.1881,0.5423],[0.2059,0.5423],[0.2148,0.5669],[0.2148,0.6021],[0.203,0.6268],[0.1837,0.6268],[0.1733,0.6021]], height: 0.013 },
      { part: 'dipstick', outline: [[0.3496,0.5528],[0.3585,0.5423],[0.3689,0.5528],[0.3719,0.5739],[0.3644,0.5951],[0.3541,0.5951],[0.3467,0.581]], height: 0.016 },
      { part: 'coolant', outline: [[0.3244,0.743],[0.3333,0.7218],[0.363,0.7218],[0.3778,0.7359],[0.3793,0.7887],[0.363,0.8169],[0.3333,0.8134],[0.323,0.7923]], height: 0.014 },
      { part: 'air_filter', outline: [[0.6785,0.5246],[0.6978,0.4965],[0.7867,0.493],[0.8119,0.5458],[0.8252,0.6232],[0.8104,0.6972],[0.6889,0.7113],[0.6711,0.662]], height: 0.037 },
      { part: 'oil_cap', outline: [[0.3156,0.3451],[0.3274,0.3275],[0.3437,0.331],[0.3511,0.3486],[0.3496,0.3803],[0.3393,0.4014],[0.323,0.3944],[0.3141,0.3697]], height: 0.017 },
      { part: 'brake_fluid', outline: [[0.5956,0.1866],[0.6059,0.169],[0.6281,0.169],[0.6444,0.1901],[0.6459,0.2289],[0.6356,0.257],[0.6074,0.2606],[0.597,0.2359]], height: 0.021 },
      { part: 'battery', outline: [[0.6341,0.3204],[0.7156,0.2958],[0.7689,0.3204],[0.7881,0.3732],[0.7881,0.4331],[0.7674,0.4718],[0.6356,0.4754],[0.6237,0.4261]], height: 0.032 },
      { part: 'positive', outline: [[0.6281,0.2676],[0.643,0.2535],[0.6696,0.2535],[0.6785,0.2711],[0.677,0.3099],[0.6622,0.3345],[0.6385,0.3275],[0.6267,0.3063]], height: 0.013 },
    ],
  },
  tucson: {
    referenceVariant: "Smartstream G2.0 MPi · Volante a la izquierda",
    fuseUrl: "https://ownersmanual.hyundai.com/full_webhelp/NX4/2025/en_GN/id1d31e734941.html",
    volumes: [
      { part: 'fuses', outline: [[0.823,0.272],[0.943,0.287],[0.966,0.343],[0.979,0.46],[0.853,0.498],[0.819,0.404]], height: 0.035 },
      { part: 'washer', outline: [[0.061,0.819],[0.072,0.789],[0.09,0.792],[0.102,0.823],[0.104,0.879],[0.094,0.925],[0.077,0.928],[0.064,0.891]], height: 0.012 },
      { part: 'dipstick', outline: [[0.239,0.679],[0.251,0.649],[0.262,0.672],[0.27,0.717],[0.264,0.785],[0.254,0.811],[0.239,0.781],[0.233,0.732]], height: 0.014 },
      { part: 'coolant', outline: [[0.05,0.328],[0.068,0.264],[0.096,0.242],[0.131,0.272],[0.154,0.336],[0.168,0.419],[0.157,0.509],[0.13,0.555],[0.092,0.566],[0.06,0.532],[0.046,0.453]], height: 0.046 },
      { part: 'air_filter', outline: [[0.731,0.619],[0.805,0.63],[0.839,0.645],[0.856,0.796],[0.837,0.845],[0.738,0.834],[0.73,0.777]], height: 0.036 },
      { part: 'oil_cap', outline: [[0.29,0.468],[0.303,0.434],[0.319,0.438],[0.33,0.483],[0.328,0.521],[0.317,0.562],[0.3,0.566],[0.29,0.528]], height: 0.013 },
      { part: 'brake_fluid', outline: [[0.63,0.068],[0.648,0.049],[0.666,0.06],[0.675,0.113],[0.673,0.185],[0.662,0.249],[0.64,0.223],[0.63,0.151]], height: 0.022 },
      { part: 'battery', outline: [[0.692,0.226],[0.79,0.189],[0.809,0.249],[0.818,0.411],[0.808,0.536],[0.707,0.555],[0.692,0.483]], height: 0.041 },
      { part: 'positive', outline: [[0.753,0.348],[0.795,0.343],[0.807,0.383],[0.766,0.389]], height: 0.056 },
    ],
  },
  ranger: {
    referenceVariant: "2.2 Duratorq TDCi · Chile",
    fuseUrl: "https://www.fordservicecontent.com/Ford_Content/Catalog/owner_information/Manual_de_Propietario_Ranger_MY2022.pdf#page=218",
    volumes: [
      { part: 'fuses', outline: [[0.76,0.27],[0.9,0.26],[0.91,0.43],[0.88,0.46],[0.76,0.46]], height: 0.043 },
      { part: 'washer', outline: [[0.205,0.793],[0.223,0.783],[0.239,0.803],[0.244,0.825],[0.234,0.852],[0.212,0.855],[0.199,0.832]], height: 0.022 },
      { part: 'dipstick', outline: [[0.526,0.351],[0.542,0.342],[0.556,0.362],[0.557,0.398],[0.544,0.416],[0.526,0.404],[0.52,0.378]], height: 0.027 },
      { part: 'coolant', outline: [[0.103,0.161],[0.176,0.148],[0.198,0.19],[0.197,0.245],[0.211,0.273],[0.201,0.335],[0.183,0.36],[0.105,0.349],[0.093,0.315],[0.097,0.211]], height: 0.06 },
      { part: 'air_filter', outline: [[0.105,0.503],[0.124,0.434],[0.156,0.387],[0.205,0.37],[0.247,0.398],[0.272,0.454],[0.281,0.535],[0.266,0.616],[0.235,0.686],[0.189,0.721],[0.146,0.698],[0.114,0.651],[0.103,0.576]], height: 0.066 },
      { part: 'oil_cap', outline: [[0.696,0.366],[0.721,0.357],[0.739,0.377],[0.742,0.412],[0.728,0.439],[0.706,0.438],[0.693,0.414]], height: 0.025 },
      { part: 'brake_fluid', outline: [[0.345,0.208],[0.362,0.203],[0.384,0.218],[0.391,0.254],[0.379,0.278],[0.354,0.278],[0.342,0.249]], height: 0.032 },
      { part: 'battery', outline: [[0.718,0.493],[0.893,0.488],[0.908,0.523],[0.909,0.66],[0.897,0.696],[0.724,0.706],[0.713,0.663]], height: 0.071 },
    ],
  },
  corolla: {
    referenceVariant: "XSE · 2.0 M20A-FKS · EE. UU.",
    fuseUrl: "https://www.startmycar.com/ca/toyota/corolla/info/fusebox/2020/12th-gen-pre-facelift",
    volumes: [
      { part: 'fuses', outline: [[0.81,0.31],[0.9,0.31],[0.93,0.46],[0.84,0.5]], height: 0.025 },
      { part: 'washer', outline: [[0.119,0.39],[0.131,0.37],[0.157,0.37],[0.174,0.39],[0.172,0.43],[0.157,0.45],[0.133,0.45],[0.119,0.43]], height: 0.013 },
      { part: 'dipstick', outline: [[0.456,0.56],[0.468,0.54],[0.489,0.54],[0.502,0.56],[0.5,0.6],[0.485,0.62],[0.467,0.61],[0.456,0.59]], height: 0.013 },
      { part: 'coolant', outline: [[0.184,0.49],[0.254,0.48],[0.277,0.52],[0.283,0.62],[0.247,0.66],[0.194,0.64],[0.175,0.59]], height: 0.05 },
      { part: 'air_filter', outline: [[0.666,0.56],[0.744,0.54],[0.795,0.58],[0.798,0.68],[0.769,0.75],[0.674,0.76],[0.624,0.69],[0.628,0.61]], height: 0.039 },
      { part: 'oil_cap', outline: [[0.528,0.36],[0.545,0.34],[0.574,0.34],[0.593,0.36],[0.594,0.4],[0.574,0.42],[0.545,0.42],[0.527,0.4]], height: 0.014 },
      { part: 'brake_fluid', outline: [[0.668,0.13],[0.709,0.13],[0.727,0.16],[0.722,0.22],[0.689,0.25],[0.661,0.23],[0.655,0.18]], height: 0.026 },
      { part: 'battery', outline: [[0.775,0.48],[0.869,0.46],[0.91,0.59],[0.818,0.65]], height: 0.043 },
      { part: 'positive', outline: [[0.843,0.55],[0.872,0.55],[0.89,0.6],[0.862,0.616]], height: 0.055 },
    ],
  },
  cx5: {
    referenceVariant: "Touring · SKYACTIV-G 2.5 atmosférico · EE. UU.",
    fuseUrl: "https://www.mazdausa.com/static/manuals/2021/cx-5/contents/07031602.html",
    volumes: [
      { part: 'fuses', outline: [[0.7977,0.2409],[0.8336,0.2153],[0.8972,0.2372],[0.9152,0.2847],[0.9233,0.3759],[0.9184,0.4781],[0.8907,0.4635],[0.8548,0.4343],[0.8287,0.4197],[0.8189,0.354]], height: 0.035 },
      { part: 'washer', outline: [[0.0848,0.438],[0.0979,0.427],[0.1175,0.4307],[0.1289,0.4489],[0.1272,0.4744],[0.1109,0.4927],[0.093,0.4854],[0.0848,0.4672]], height: 0.015 },
      { part: 'dipstick', outline: [[0.3344,0.3577],[0.3409,0.3504],[0.3491,0.365],[0.3491,0.3905],[0.3409,0.4015],[0.3344,0.3869]], height: 0.013 },
      { part: 'coolant', outline: [[0.4633,0.6788],[0.4943,0.6606],[0.5889,0.6606],[0.6085,0.6788],[0.6085,0.7299],[0.5922,0.7555],[0.4763,0.7555],[0.4633,0.7336]], height: 0.025 },
      { part: 'air_filter', outline: [[0.7586,0.4453],[0.783,0.427],[0.8809,0.4453],[0.8907,0.4781],[0.907,0.6241],[0.9005,0.6898],[0.8777,0.7299],[0.845,0.7117],[0.8124,0.6423],[0.7439,0.5949],[0.7357,0.5474]], height: 0.045 },
      { part: 'oil_cap', outline: [[0.3915,0.3102],[0.4029,0.2993],[0.4209,0.3029],[0.4274,0.3212],[0.4225,0.3467],[0.398,0.354],[0.3915,0.3394]], height: 0.015 },
      { part: 'brake_fluid', outline: [[0.6166,0.1204],[0.633,0.1131],[0.6476,0.1241],[0.6493,0.1606],[0.6427,0.1934],[0.6199,0.1971],[0.6134,0.1715]], height: 0.023 },
      { part: 'battery', outline: [[0.6688,0.2591],[0.6982,0.2372],[0.7569,0.2591],[0.7896,0.2591],[0.8091,0.3066],[0.8189,0.365],[0.8042,0.4197],[0.7602,0.4161],[0.7357,0.4781],[0.6688,0.4854],[0.664,0.3431]], height: 0.049 },
      { part: 'positive', outline: [[0.6721,0.3066],[0.6933,0.3029],[0.7113,0.3321],[0.7129,0.3832],[0.6966,0.4051],[0.6754,0.3905],[0.6688,0.354]], height: 0.061 },
    ],
  },
};
