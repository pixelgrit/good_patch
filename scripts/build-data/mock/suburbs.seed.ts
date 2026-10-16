/**
 * Seed list for the mock dataset. Centroids are approximate; prices are
 * illustrative ballparks in $k, not real medians. Codes follow the SAL
 * pattern but are placeholders — the ABS SAL adapter replaces them.
 *
 * density: 0 = detached-house suburb … 3 = high-rise apartments.
 */
export interface SeedSuburb {
  name: string;
  postcode: string;
  lga: string;
  lng: number;
  lat: number;
  house: number | null;
  unit: number;
  density: 0 | 1 | 2 | 3;
  seifa: number;
  heritage?: boolean;
  flood?: boolean;
  bushfire?: boolean;
}

export const SEED: SeedSuburb[] = [
  { name: 'Fitzroy', postcode: '3065', lga: 'Yarra', lng: 144.978, lat: -37.799, house: 1550, unit: 640, density: 2, seifa: 9, heritage: true },
  { name: 'Collingwood', postcode: '3066', lga: 'Yarra', lng: 144.988, lat: -37.802, house: 1350, unit: 600, density: 2, seifa: 8, heritage: true },
  { name: 'Abbotsford', postcode: '3067', lga: 'Yarra', lng: 145.0, lat: -37.804, house: 1300, unit: 560, density: 2, seifa: 8, flood: true },
  { name: 'Richmond', postcode: '3121', lga: 'Yarra', lng: 144.999, lat: -37.819, house: 1450, unit: 590, density: 2, seifa: 9, heritage: true },
  { name: 'Clifton Hill', postcode: '3068', lga: 'Yarra', lng: 144.995, lat: -37.789, house: 1600, unit: 620, density: 1, seifa: 10, heritage: true },
  { name: 'Fitzroy North', postcode: '3068', lga: 'Yarra', lng: 144.985, lat: -37.783, house: 1700, unit: 610, density: 1, seifa: 10, heritage: true },
  { name: 'Carlton', postcode: '3053', lga: 'Melbourne', lng: 144.967, lat: -37.8, house: 1400, unit: 430, density: 3, seifa: 6, heritage: true },
  { name: 'Carlton North', postcode: '3054', lga: 'Yarra', lng: 144.972, lat: -37.785, house: 1650, unit: 640, density: 1, seifa: 10, heritage: true },
  { name: 'Parkville', postcode: '3052', lga: 'Melbourne', lng: 144.951, lat: -37.787, house: 1800, unit: 480, density: 2, seifa: 8, heritage: true },
  { name: 'North Melbourne', postcode: '3051', lga: 'Melbourne', lng: 144.945, lat: -37.799, house: 1200, unit: 480, density: 2, seifa: 6, heritage: true },
  { name: 'West Melbourne', postcode: '3003', lga: 'Melbourne', lng: 144.938, lat: -37.81, house: 1200, unit: 520, density: 3, seifa: 7 },
  { name: 'East Melbourne', postcode: '3002', lga: 'Melbourne', lng: 144.985, lat: -37.813, house: 2600, unit: 720, density: 2, seifa: 10, heritage: true },
  { name: 'Docklands', postcode: '3008', lga: 'Melbourne', lng: 144.942, lat: -37.818, house: null, unit: 520, density: 3, seifa: 6, flood: true },
  { name: 'Southbank', postcode: '3006', lga: 'Melbourne', lng: 144.962, lat: -37.826, house: null, unit: 480, density: 3, seifa: 6 },
  { name: 'Northcote', postcode: '3070', lga: 'Darebin', lng: 145.0, lat: -37.77, house: 1550, unit: 610, density: 1, seifa: 9 },
  { name: 'Thornbury', postcode: '3071', lga: 'Darebin', lng: 145.004, lat: -37.756, house: 1350, unit: 560, density: 1, seifa: 8 },
  { name: 'Preston', postcode: '3072', lga: 'Darebin', lng: 145.007, lat: -37.741, house: 1100, unit: 540, density: 1, seifa: 6 },
  { name: 'Reservoir', postcode: '3073', lga: 'Darebin', lng: 145.007, lat: -37.716, house: 860, unit: 520, density: 0, seifa: 4 },
  { name: 'Fairfield', postcode: '3078', lga: 'Darebin', lng: 145.017, lat: -37.778, house: 1600, unit: 580, density: 1, seifa: 9, flood: true },
  { name: 'Alphington', postcode: '3078', lga: 'Darebin', lng: 145.031, lat: -37.781, house: 1800, unit: 640, density: 1, seifa: 10, flood: true },
  { name: 'Ivanhoe', postcode: '3079', lga: 'Banyule', lng: 145.045, lat: -37.769, house: 1700, unit: 700, density: 0, seifa: 9, flood: true },
  { name: 'Heidelberg', postcode: '3084', lga: 'Banyule', lng: 145.066, lat: -37.755, house: 1300, unit: 650, density: 0, seifa: 8 },
  { name: 'Brunswick', postcode: '3056', lga: 'Merri-bek', lng: 144.96, lat: -37.767, house: 1250, unit: 520, density: 2, seifa: 8 },
  { name: 'Brunswick East', postcode: '3057', lga: 'Merri-bek', lng: 144.977, lat: -37.771, house: 1300, unit: 540, density: 2, seifa: 9 },
  { name: 'Brunswick West', postcode: '3055', lga: 'Merri-bek', lng: 144.943, lat: -37.764, house: 1100, unit: 500, density: 1, seifa: 7 },
  { name: 'Coburg', postcode: '3058', lga: 'Merri-bek', lng: 144.966, lat: -37.744, house: 1100, unit: 560, density: 1, seifa: 7 },
  { name: 'Pascoe Vale', postcode: '3044', lga: 'Merri-bek', lng: 144.938, lat: -37.727, house: 980, unit: 560, density: 0, seifa: 6 },
  { name: 'Essendon', postcode: '3040', lga: 'Moonee Valley', lng: 144.915, lat: -37.752, house: 1450, unit: 560, density: 0, seifa: 9 },
  { name: 'Moonee Ponds', postcode: '3039', lga: 'Moonee Valley', lng: 144.92, lat: -37.766, house: 1400, unit: 520, density: 2, seifa: 9 },
  { name: 'Ascot Vale', postcode: '3032', lga: 'Moonee Valley', lng: 144.91, lat: -37.778, house: 1350, unit: 480, density: 1, seifa: 7, flood: true },
  { name: 'Flemington', postcode: '3031', lga: 'Moonee Valley', lng: 144.93, lat: -37.787, house: 1100, unit: 420, density: 2, seifa: 4 },
  { name: 'Kensington', postcode: '3031', lga: 'Melbourne', lng: 144.926, lat: -37.796, house: 1150, unit: 500, density: 1, seifa: 7, flood: true },
  { name: 'Footscray', postcode: '3011', lga: 'Maribyrnong', lng: 144.9, lat: -37.8, house: 980, unit: 430, density: 2, seifa: 5, flood: true },
  { name: 'Seddon', postcode: '3011', lga: 'Maribyrnong', lng: 144.889, lat: -37.808, house: 1100, unit: 560, density: 0, seifa: 8, heritage: true },
  { name: 'Yarraville', postcode: '3013', lga: 'Maribyrnong', lng: 144.888, lat: -37.818, house: 1200, unit: 600, density: 0, seifa: 8, heritage: true },
  { name: 'Maidstone', postcode: '3012', lga: 'Maribyrnong', lng: 144.873, lat: -37.781, house: 950, unit: 560, density: 0, seifa: 5 },
  { name: 'Sunshine', postcode: '3020', lga: 'Brimbank', lng: 144.833, lat: -37.787, house: 820, unit: 470, density: 1, seifa: 3 },
  { name: 'Williamstown', postcode: '3016', lga: 'Hobsons Bay', lng: 144.895, lat: -37.858, house: 1450, unit: 720, density: 0, seifa: 9, heritage: true, flood: true },
  { name: 'Port Melbourne', postcode: '3207', lga: 'Port Phillip', lng: 144.937, lat: -37.834, house: 1600, unit: 700, density: 2, seifa: 9, flood: true },
  { name: 'South Melbourne', postcode: '3205', lga: 'Port Phillip', lng: 144.958, lat: -37.834, house: 1550, unit: 590, density: 2, seifa: 9, heritage: true },
  { name: 'Albert Park', postcode: '3206', lga: 'Port Phillip', lng: 144.953, lat: -37.844, house: 2300, unit: 760, density: 1, seifa: 10, heritage: true },
  { name: 'St Kilda', postcode: '3182', lga: 'Port Phillip', lng: 144.979, lat: -37.864, house: 1600, unit: 500, density: 3, seifa: 7, heritage: true },
  { name: 'St Kilda East', postcode: '3183', lga: 'Port Phillip', lng: 145.003, lat: -37.866, house: 1600, unit: 520, density: 2, seifa: 8 },
  { name: 'Balaclava', postcode: '3183', lga: 'Port Phillip', lng: 144.993, lat: -37.871, house: 1400, unit: 500, density: 2, seifa: 8 },
  { name: 'Elwood', postcode: '3184', lga: 'Port Phillip', lng: 144.987, lat: -37.882, house: 1900, unit: 620, density: 2, seifa: 9, flood: true },
  { name: 'Prahran', postcode: '3181', lga: 'Stonnington', lng: 144.995, lat: -37.85, house: 1550, unit: 540, density: 2, seifa: 9 },
  { name: 'Windsor', postcode: '3181', lga: 'Stonnington', lng: 144.991, lat: -37.857, house: 1400, unit: 500, density: 2, seifa: 9 },
  { name: 'South Yarra', postcode: '3141', lga: 'Stonnington', lng: 144.991, lat: -37.838, house: 2200, unit: 560, density: 3, seifa: 9 },
  { name: 'Toorak', postcode: '3142', lga: 'Stonnington', lng: 145.016, lat: -37.842, house: 4500, unit: 900, density: 1, seifa: 10, heritage: true },
  { name: 'Armadale', postcode: '3143', lga: 'Stonnington', lng: 145.02, lat: -37.856, house: 2600, unit: 680, density: 1, seifa: 10, heritage: true },
  { name: 'Malvern', postcode: '3144', lga: 'Stonnington', lng: 145.03, lat: -37.862, house: 2700, unit: 700, density: 1, seifa: 10, heritage: true },
  { name: 'Malvern East', postcode: '3145', lga: 'Stonnington', lng: 145.058, lat: -37.874, house: 1850, unit: 620, density: 1, seifa: 10 },
  { name: 'Caulfield North', postcode: '3161', lga: 'Glen Eira', lng: 145.024, lat: -37.873, house: 2000, unit: 620, density: 1, seifa: 9 },
  { name: 'Caulfield', postcode: '3162', lga: 'Glen Eira', lng: 145.024, lat: -37.884, house: 1900, unit: 600, density: 1, seifa: 9 },
  { name: 'Elsternwick', postcode: '3185', lga: 'Glen Eira', lng: 145.003, lat: -37.887, house: 1950, unit: 640, density: 1, seifa: 9 },
  { name: 'Carnegie', postcode: '3163', lga: 'Glen Eira', lng: 145.057, lat: -37.889, house: 1450, unit: 560, density: 2, seifa: 9 },
  { name: 'Murrumbeena', postcode: '3163', lga: 'Glen Eira', lng: 145.071, lat: -37.902, house: 1450, unit: 640, density: 0, seifa: 9 },
  { name: 'Bentleigh', postcode: '3204', lga: 'Glen Eira', lng: 145.036, lat: -37.918, house: 1600, unit: 760, density: 0, seifa: 9 },
  { name: 'Brighton', postcode: '3186', lga: 'Bayside', lng: 145.0, lat: -37.909, house: 2900, unit: 900, density: 0, seifa: 10 },
  { name: 'Hawthorn', postcode: '3122', lga: 'Boroondara', lng: 145.032, lat: -37.822, house: 2400, unit: 560, density: 2, seifa: 10, heritage: true },
  { name: 'Hawthorn East', postcode: '3123', lga: 'Boroondara', lng: 145.05, lat: -37.832, house: 2000, unit: 640, density: 1, seifa: 10 },
  { name: 'Kew', postcode: '3101', lga: 'Boroondara', lng: 145.032, lat: -37.805, house: 2500, unit: 760, density: 1, seifa: 10, heritage: true },
  { name: 'Camberwell', postcode: '3124', lga: 'Boroondara', lng: 145.071, lat: -37.838, house: 2400, unit: 800, density: 0, seifa: 10, heritage: true },
  { name: 'Glen Iris', postcode: '3146', lga: 'Boroondara', lng: 145.06, lat: -37.857, house: 2100, unit: 720, density: 0, seifa: 10 },
  { name: 'Ashburton', postcode: '3147', lga: 'Boroondara', lng: 145.081, lat: -37.866, house: 1900, unit: 900, density: 0, seifa: 10 },
  { name: 'Balwyn', postcode: '3103', lga: 'Boroondara', lng: 145.083, lat: -37.81, house: 2600, unit: 840, density: 0, seifa: 10 },
  { name: 'Surrey Hills', postcode: '3127', lga: 'Whitehorse', lng: 145.1, lat: -37.826, house: 2100, unit: 820, density: 0, seifa: 10 },
  { name: 'Box Hill', postcode: '3128', lga: 'Whitehorse', lng: 145.124, lat: -37.819, house: 1600, unit: 480, density: 3, seifa: 6 },
  { name: 'Burwood', postcode: '3125', lga: 'Whitehorse', lng: 145.112, lat: -37.85, house: 1500, unit: 640, density: 1, seifa: 8 },
];
