// Synced from Google Sheet: AP Environmental Science Chapters & Lengths
// https://docs.google.com/spreadsheets/d/154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4/edit

export const APES_AUDIOBOOK_SPREADSHEET_ID = '154DtAbZXIeqVR-cUgyMDQJaOEnnhtHqWw4GnIUBAdg4';

export interface ApesAudiobookTrack {
  trackNumber: number;
  unitNumber: number;
  unitTitle: string;
  segmentType: string;
  moduleNumber: number | null;
  title: string;
  estLengthFormatted: string;
  estMinutes: number;
  actualMinutes: number | null;
}

export const APES_AUDIOBOOK_TRACKS: ApesAudiobookTrack[] = [
  {
    "trackNumber": 1,
    "unitNumber": 0,
    "unitTitle": "Unit 0: Introduction — What Is Environmental Science?",
    "segmentType": "unit_intro",
    "moduleNumber": 0,
    "title": "Module 0 Case Study: The Global Pandemic and Environmental Science",
    "estLengthFormatted": "0:04:58",
    "estMinutes": 4.97,
    "actualMinutes": null
  },
  {
    "trackNumber": 2,
    "unitNumber": 0,
    "unitTitle": "Unit 0: Introduction — What Is Environmental Science?",
    "segmentType": "module",
    "moduleNumber": 0,
    "title": "Module 0: What Is Environmental Science?",
    "estLengthFormatted": "0:30:40",
    "estMinutes": 30.67,
    "actualMinutes": null
  },
  {
    "trackNumber": 3,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 1: The Living World: Ecosystems — Opening Case Study and Overview",
    "estLengthFormatted": "0:04:54",
    "estMinutes": 4.9,
    "actualMinutes": null
  },
  {
    "trackNumber": 4,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "module",
    "moduleNumber": 1,
    "title": "Module 1: Introduction to Ecosystems",
    "estLengthFormatted": "0:28:45",
    "estMinutes": 28.75,
    "actualMinutes": null
  },
  {
    "trackNumber": 5,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "module",
    "moduleNumber": 2,
    "title": "Module 2: Terrestrial Biomes",
    "estLengthFormatted": "0:30:12",
    "estMinutes": 30.2,
    "actualMinutes": null
  },
  {
    "trackNumber": 6,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "module",
    "moduleNumber": 3,
    "title": "Module 3: Aquatic Biomes",
    "estLengthFormatted": "0:17:56",
    "estMinutes": 17.93,
    "actualMinutes": null
  },
  {
    "trackNumber": 7,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "module",
    "moduleNumber": 4,
    "title": "Module 4: The Carbon and Nitrogen Cycles",
    "estLengthFormatted": "0:18:45",
    "estMinutes": 18.75,
    "actualMinutes": null
  },
  {
    "trackNumber": 8,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "module",
    "moduleNumber": 5,
    "title": "Module 5: The Phosphorus and Hydrologic (Water) Cycles",
    "estLengthFormatted": "0:12:09",
    "estMinutes": 12.15,
    "actualMinutes": null
  },
  {
    "trackNumber": 9,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "module",
    "moduleNumber": 6,
    "title": "Module 6: Primary Productivity",
    "estLengthFormatted": "0:15:56",
    "estMinutes": 15.93,
    "actualMinutes": null
  },
  {
    "trackNumber": 10,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "module",
    "moduleNumber": 7,
    "title": "Module 7: Trophic Levels, Energy Flow and the 10 Percent Rule, Food Chains, and Food Webs",
    "estLengthFormatted": "0:19:08",
    "estMinutes": 19.13,
    "actualMinutes": null
  },
  {
    "trackNumber": 11,
    "unitNumber": 1,
    "unitTitle": "Unit 1: The Living World: Ecosystems",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 1 Science Applied: Reversing Human Impacts on a Salty Lake",
    "estLengthFormatted": "0:09:14",
    "estMinutes": 9.23,
    "actualMinutes": null
  },
  {
    "trackNumber": 12,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 2: The Living World: Biodiversity — Opening Case Study and Overview",
    "estLengthFormatted": "0:04:40",
    "estMinutes": 4.67,
    "actualMinutes": null
  },
  {
    "trackNumber": 13,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "module",
    "moduleNumber": 8,
    "title": "Module 8: Introduction to Biodiversity",
    "estLengthFormatted": "0:19:34",
    "estMinutes": 19.57,
    "actualMinutes": null
  },
  {
    "trackNumber": 14,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "module",
    "moduleNumber": 9,
    "title": "Module 9: Ecosystem Services",
    "estLengthFormatted": "0:17:48",
    "estMinutes": 17.8,
    "actualMinutes": null
  },
  {
    "trackNumber": 15,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "module",
    "moduleNumber": 10,
    "title": "Module 10: Island Biogeography",
    "estLengthFormatted": "0:22:01",
    "estMinutes": 22.02,
    "actualMinutes": null
  },
  {
    "trackNumber": 16,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "module",
    "moduleNumber": 11,
    "title": "Module 11: Ecological Tolerance",
    "estLengthFormatted": "0:17:17",
    "estMinutes": 17.28,
    "actualMinutes": null
  },
  {
    "trackNumber": 17,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "module",
    "moduleNumber": 12,
    "title": "Module 12: Natural Disruptions to Ecosystems",
    "estLengthFormatted": "0:24:30",
    "estMinutes": 24.5,
    "actualMinutes": null
  },
  {
    "trackNumber": 18,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "module",
    "moduleNumber": 13,
    "title": "Module 13: Adaptations",
    "estLengthFormatted": "0:31:41",
    "estMinutes": 31.68,
    "actualMinutes": null
  },
  {
    "trackNumber": 19,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "module",
    "moduleNumber": 14,
    "title": "Module 14: Ecological Succession",
    "estLengthFormatted": "0:20:38",
    "estMinutes": 20.63,
    "actualMinutes": null
  },
  {
    "trackNumber": 20,
    "unitNumber": 2,
    "unitTitle": "Unit 2: The Living World: Biodiversity",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 2 Science Applied: How Should We Prioritize the Protection of Species Diversity?",
    "estLengthFormatted": "0:10:20",
    "estMinutes": 10.33,
    "actualMinutes": null
  },
  {
    "trackNumber": 21,
    "unitNumber": 3,
    "unitTitle": "Unit 3: Populations",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 3: Populations — Opening Case Study and Overview",
    "estLengthFormatted": "0:07:28",
    "estMinutes": 7.47,
    "actualMinutes": null
  },
  {
    "trackNumber": 22,
    "unitNumber": 3,
    "unitTitle": "Unit 3: Populations",
    "segmentType": "module",
    "moduleNumber": 15,
    "title": "Module 15: Generalist and Specialist Species, K- and r-selected Species, and Survivorship Curves",
    "estLengthFormatted": "0:17:00",
    "estMinutes": 17,
    "actualMinutes": null
  },
  {
    "trackNumber": 23,
    "unitNumber": 3,
    "unitTitle": "Unit 3: Populations",
    "segmentType": "module",
    "moduleNumber": 16,
    "title": "Module 16: Carrying Capacity, Population Growth, and Resource Availability",
    "estLengthFormatted": "0:25:12",
    "estMinutes": 25.2,
    "actualMinutes": null
  },
  {
    "trackNumber": 24,
    "unitNumber": 3,
    "unitTitle": "Unit 3: Populations",
    "segmentType": "module",
    "moduleNumber": 17,
    "title": "Module 17: Age Structure Diagrams and Total Fertility Rates",
    "estLengthFormatted": "0:38:15",
    "estMinutes": 38.25,
    "actualMinutes": null
  },
  {
    "trackNumber": 25,
    "unitNumber": 3,
    "unitTitle": "Unit 3: Populations",
    "segmentType": "module",
    "moduleNumber": 18,
    "title": "Module 18: Human Population Dynamics and the Demographic Transition",
    "estLengthFormatted": "0:27:12",
    "estMinutes": 27.2,
    "actualMinutes": null
  },
  {
    "trackNumber": 26,
    "unitNumber": 3,
    "unitTitle": "Unit 3: Populations",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 3 Science Applied: How Can We Control Overabundant Animal Populations?",
    "estLengthFormatted": "0:10:04",
    "estMinutes": 10.07,
    "actualMinutes": null
  },
  {
    "trackNumber": 27,
    "unitNumber": 4,
    "unitTitle": "Unit 4: Earth Systems and Resources",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 4: Earth Systems and Resources — Opening Case Study and Overview",
    "estLengthFormatted": "0:06:46",
    "estMinutes": 6.77,
    "actualMinutes": null
  },
  {
    "trackNumber": 28,
    "unitNumber": 4,
    "unitTitle": "Unit 4: Earth Systems and Resources",
    "segmentType": "module",
    "moduleNumber": 19,
    "title": "Module 19: Plate Tectonics",
    "estLengthFormatted": "0:22:09",
    "estMinutes": 22.15,
    "actualMinutes": null
  },
  {
    "trackNumber": 29,
    "unitNumber": 4,
    "unitTitle": "Unit 4: Earth Systems and Resources",
    "segmentType": "module",
    "moduleNumber": 20,
    "title": "Module 20: Soil Formation, Erosion, Composition, and Its Properties",
    "estLengthFormatted": "0:36:05",
    "estMinutes": 36.08,
    "actualMinutes": null
  },
  {
    "trackNumber": 30,
    "unitNumber": 4,
    "unitTitle": "Unit 4: Earth Systems and Resources",
    "segmentType": "module",
    "moduleNumber": 21,
    "title": "Module 21: Watersheds",
    "estLengthFormatted": "0:14:34",
    "estMinutes": 14.57,
    "actualMinutes": null
  },
  {
    "trackNumber": 31,
    "unitNumber": 4,
    "unitTitle": "Unit 4: Earth Systems and Resources",
    "segmentType": "module",
    "moduleNumber": 22,
    "title": "Module 22: Earth's Atmosphere, Global Wind Patterns, Solar Radiation, and Earth's Seasons",
    "estLengthFormatted": "0:30:41",
    "estMinutes": 30.68,
    "actualMinutes": null
  },
  {
    "trackNumber": 32,
    "unitNumber": 4,
    "unitTitle": "Unit 4: Earth Systems and Resources",
    "segmentType": "module",
    "moduleNumber": 23,
    "title": "Module 23: Earth's Geography and Climate, El Niño, and La Niña",
    "estLengthFormatted": "0:14:54",
    "estMinutes": 14.9,
    "actualMinutes": null
  },
  {
    "trackNumber": 33,
    "unitNumber": 4,
    "unitTitle": "Unit 4: Earth Systems and Resources",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 4 Science Applied: Can We Resolve the California Water Wars?",
    "estLengthFormatted": "0:16:40",
    "estMinutes": 16.67,
    "actualMinutes": null
  },
  {
    "trackNumber": 34,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 5: Land and Water Use — Opening Case Study and Overview",
    "estLengthFormatted": "0:07:28",
    "estMinutes": 7.47,
    "actualMinutes": null
  },
  {
    "trackNumber": 35,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 24,
    "title": "Module 24: The Tragedy of the Commons; Clear-cutting",
    "estLengthFormatted": "0:27:21",
    "estMinutes": 27.35,
    "actualMinutes": null
  },
  {
    "trackNumber": 36,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 25,
    "title": "Module 25: The Green Revolution",
    "estLengthFormatted": "0:29:08",
    "estMinutes": 29.13,
    "actualMinutes": null
  },
  {
    "trackNumber": 37,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 26,
    "title": "Module 26: Impacts of Agricultural Practices",
    "estLengthFormatted": "0:16:09",
    "estMinutes": 16.15,
    "actualMinutes": null
  },
  {
    "trackNumber": 38,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 27,
    "title": "Module 27: Irrigation and Pest Control Methods",
    "estLengthFormatted": "0:24:04",
    "estMinutes": 24.07,
    "actualMinutes": null
  },
  {
    "trackNumber": 39,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 28,
    "title": "Module 28: Meat Production Methods and the Impacts of Overfishing",
    "estLengthFormatted": "0:26:54",
    "estMinutes": 26.9,
    "actualMinutes": null
  },
  {
    "trackNumber": 40,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 29,
    "title": "Module 29: Impacts of Mining",
    "estLengthFormatted": "0:15:23",
    "estMinutes": 15.38,
    "actualMinutes": null
  },
  {
    "trackNumber": 41,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 30,
    "title": "Module 30: Impacts of Urbanization and the Methods to Reduce Urban Runoff",
    "estLengthFormatted": "0:15:45",
    "estMinutes": 15.75,
    "actualMinutes": null
  },
  {
    "trackNumber": 42,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 31,
    "title": "Module 31: Ecological Footprints",
    "estLengthFormatted": "0:16:18",
    "estMinutes": 16.3,
    "actualMinutes": null
  },
  {
    "trackNumber": 43,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 32,
    "title": "Module 32: Introduction to Sustainability",
    "estLengthFormatted": "0:25:21",
    "estMinutes": 25.35,
    "actualMinutes": null
  },
  {
    "trackNumber": 44,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 33,
    "title": "Module 33: Integrated Pest Management and Sustainable Agriculture",
    "estLengthFormatted": "0:23:40",
    "estMinutes": 23.67,
    "actualMinutes": null
  },
  {
    "trackNumber": 45,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "module",
    "moduleNumber": 34,
    "title": "Module 34: Aquaculture and Sustainable Forestry",
    "estLengthFormatted": "0:17:24",
    "estMinutes": 17.4,
    "actualMinutes": null
  },
  {
    "trackNumber": 46,
    "unitNumber": 5,
    "unitTitle": "Unit 5: Land and Water Use",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 5 Science Applied: How Do We Define Organic Food?",
    "estLengthFormatted": "0:12:51",
    "estMinutes": 12.85,
    "actualMinutes": null
  },
  {
    "trackNumber": 47,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 6: Energy Resources and Consumption — Opening Case Study and Overview",
    "estLengthFormatted": "0:08:36",
    "estMinutes": 8.6,
    "actualMinutes": null
  },
  {
    "trackNumber": 48,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "module",
    "moduleNumber": 35,
    "title": "Module 35: Renewable and Nonrenewable Resources and Global Energy Consumption",
    "estLengthFormatted": "0:32:12",
    "estMinutes": 32.2,
    "actualMinutes": null
  },
  {
    "trackNumber": 49,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "module",
    "moduleNumber": 36,
    "title": "Module 36: Fuel Types and Uses",
    "estLengthFormatted": "0:33:08",
    "estMinutes": 33.13,
    "actualMinutes": null
  },
  {
    "trackNumber": 50,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "module",
    "moduleNumber": 37,
    "title": "Module 37: Distribution of Natural Energy Resources: Fossil Fuels",
    "estLengthFormatted": "0:28:58",
    "estMinutes": 28.97,
    "actualMinutes": null
  },
  {
    "trackNumber": 51,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "module",
    "moduleNumber": 38,
    "title": "Module 38: Nuclear Power",
    "estLengthFormatted": "0:26:44",
    "estMinutes": 26.73,
    "actualMinutes": null
  },
  {
    "trackNumber": 52,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "module",
    "moduleNumber": 39,
    "title": "Module 39: Biomass and Solar Energies and Hydroelectric Power",
    "estLengthFormatted": "0:40:12",
    "estMinutes": 40.2,
    "actualMinutes": null
  },
  {
    "trackNumber": 53,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "module",
    "moduleNumber": 40,
    "title": "Module 40: Geothermal Energy and Hydrogen Fuel Cells",
    "estLengthFormatted": "0:20:46",
    "estMinutes": 20.77,
    "actualMinutes": null
  },
  {
    "trackNumber": 54,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "module",
    "moduleNumber": 41,
    "title": "Module 41: Wind Energy and Energy Conservation",
    "estLengthFormatted": "0:31:28",
    "estMinutes": 31.47,
    "actualMinutes": null
  },
  {
    "trackNumber": 55,
    "unitNumber": 6,
    "unitTitle": "Unit 6: Energy Resources and Consumption",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 6 Science Applied: Should Corn Become Fuel?",
    "estLengthFormatted": "0:11:44",
    "estMinutes": 11.73,
    "actualMinutes": null
  },
  {
    "trackNumber": 56,
    "unitNumber": 7,
    "unitTitle": "Unit 7: Atmospheric Pollution",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 7: Atmospheric Pollution — Opening Case Study and Overview",
    "estLengthFormatted": "0:07:24",
    "estMinutes": 7.4,
    "actualMinutes": null
  },
  {
    "trackNumber": 57,
    "unitNumber": 7,
    "unitTitle": "Unit 7: Atmospheric Pollution",
    "segmentType": "module",
    "moduleNumber": 42,
    "title": "Module 42: Introduction to Air Pollution",
    "estLengthFormatted": "0:21:13",
    "estMinutes": 21.22,
    "actualMinutes": null
  },
  {
    "trackNumber": 58,
    "unitNumber": 7,
    "unitTitle": "Unit 7: Atmospheric Pollution",
    "segmentType": "module",
    "moduleNumber": 43,
    "title": "Module 43: Photochemical Smog, Thermal Inversions, Atmospheric Carbon Dioxide, and Particulates",
    "estLengthFormatted": "0:23:29",
    "estMinutes": 23.48,
    "actualMinutes": null
  },
  {
    "trackNumber": 59,
    "unitNumber": 7,
    "unitTitle": "Unit 7: Atmospheric Pollution",
    "segmentType": "module",
    "moduleNumber": 44,
    "title": "Module 44: Indoor Air Pollutants",
    "estLengthFormatted": "0:19:34",
    "estMinutes": 19.57,
    "actualMinutes": null
  },
  {
    "trackNumber": 60,
    "unitNumber": 7,
    "unitTitle": "Unit 7: Atmospheric Pollution",
    "segmentType": "module",
    "moduleNumber": 45,
    "title": "Module 45: Reduction of Air Pollutants",
    "estLengthFormatted": "0:15:19",
    "estMinutes": 15.32,
    "actualMinutes": null
  },
  {
    "trackNumber": 61,
    "unitNumber": 7,
    "unitTitle": "Unit 7: Atmospheric Pollution",
    "segmentType": "module",
    "moduleNumber": 46,
    "title": "Module 46: Acid Rain and Noise Pollution",
    "estLengthFormatted": "0:23:00",
    "estMinutes": 23,
    "actualMinutes": null
  },
  {
    "trackNumber": 62,
    "unitNumber": 7,
    "unitTitle": "Unit 7: Atmospheric Pollution",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 7 Science Applied: Can Cap-and-Trade Reduce Pollution Emissions Equitably?",
    "estLengthFormatted": "0:10:03",
    "estMinutes": 10.05,
    "actualMinutes": null
  },
  {
    "trackNumber": 63,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 8: Aquatic and Terrestrial Pollution — Opening Case Study and Overview",
    "estLengthFormatted": "0:06:38",
    "estMinutes": 6.63,
    "actualMinutes": null
  },
  {
    "trackNumber": 64,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 47,
    "title": "Module 47: Sources of Pollution, Human Impacts on Ecosystems, and Endocrine Disruptors",
    "estLengthFormatted": "0:44:29",
    "estMinutes": 44.48,
    "actualMinutes": null
  },
  {
    "trackNumber": 65,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 48,
    "title": "Module 48: Human Impacts on Wetlands and Mangroves, Eutrophication, and Thermal Pollution",
    "estLengthFormatted": "0:40:19",
    "estMinutes": 40.32,
    "actualMinutes": null
  },
  {
    "trackNumber": 66,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 49,
    "title": "Module 49: Persistent Organic Pollutants (POPs), Bioaccumulation, and Biomagnification",
    "estLengthFormatted": "0:17:37",
    "estMinutes": 17.62,
    "actualMinutes": null
  },
  {
    "trackNumber": 67,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 50,
    "title": "Module 50: Solid Waste Disposal",
    "estLengthFormatted": "0:46:45",
    "estMinutes": 46.75,
    "actualMinutes": null
  },
  {
    "trackNumber": 68,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 51,
    "title": "Module 51: Waste Reduction Methods",
    "estLengthFormatted": "0:29:32",
    "estMinutes": 29.53,
    "actualMinutes": null
  },
  {
    "trackNumber": 69,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 52,
    "title": "Module 52: Sewage Treatment",
    "estLengthFormatted": "0:22:38",
    "estMinutes": 22.63,
    "actualMinutes": null
  },
  {
    "trackNumber": 70,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 53,
    "title": "Module 53: Lethal Dose 50 Percent (LD 50) and Dose-Response Curves",
    "estLengthFormatted": "0:29:08",
    "estMinutes": 29.13,
    "actualMinutes": null
  },
  {
    "trackNumber": 71,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "module",
    "moduleNumber": 54,
    "title": "Module 54: Pollution, Human Health, Pathogens, and Infectious Diseases",
    "estLengthFormatted": "0:43:57",
    "estMinutes": 43.95,
    "actualMinutes": null
  },
  {
    "trackNumber": 72,
    "unitNumber": 8,
    "unitTitle": "Unit 8: Aquatic and Terrestrial Pollution",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 8 Science Applied: Is Recycling Always Good for the Environment?",
    "estLengthFormatted": "0:08:54",
    "estMinutes": 8.9,
    "actualMinutes": null
  },
  {
    "trackNumber": 73,
    "unitNumber": 9,
    "unitTitle": "Unit 9: Global Change",
    "segmentType": "unit_intro",
    "moduleNumber": null,
    "title": "Unit 9: Global Change — Opening Case Study and Overview",
    "estLengthFormatted": "0:05:14",
    "estMinutes": 5.23,
    "actualMinutes": null
  },
  {
    "trackNumber": 74,
    "unitNumber": 9,
    "unitTitle": "Unit 9: Global Change",
    "segmentType": "module",
    "moduleNumber": 55,
    "title": "Module 55: Stratospheric Ozone Depletion and Its Reduction",
    "estLengthFormatted": "0:13:51",
    "estMinutes": 13.85,
    "actualMinutes": null
  },
  {
    "trackNumber": 75,
    "unitNumber": 9,
    "unitTitle": "Unit 9: Global Change",
    "segmentType": "module",
    "moduleNumber": 56,
    "title": "Module 56: The Greenhouse Effect",
    "estLengthFormatted": "0:25:30",
    "estMinutes": 25.5,
    "actualMinutes": null
  },
  {
    "trackNumber": 76,
    "unitNumber": 9,
    "unitTitle": "Unit 9: Global Change",
    "segmentType": "module",
    "moduleNumber": 57,
    "title": "Module 57: Increases in the Greenhouse Gases and Global Climate Change",
    "estLengthFormatted": "0:31:15",
    "estMinutes": 31.25,
    "actualMinutes": null
  },
  {
    "trackNumber": 77,
    "unitNumber": 9,
    "unitTitle": "Unit 9: Global Change",
    "segmentType": "module",
    "moduleNumber": 58,
    "title": "Module 58: Ocean Warming and Ocean Acidification",
    "estLengthFormatted": "0:18:26",
    "estMinutes": 18.43,
    "actualMinutes": null
  },
  {
    "trackNumber": 78,
    "unitNumber": 9,
    "unitTitle": "Unit 9: Global Change",
    "segmentType": "module",
    "moduleNumber": 59,
    "title": "Module 59: Invasive Species, Endangered Species, and Human Impacts on Biodiversity",
    "estLengthFormatted": "0:51:00",
    "estMinutes": 51,
    "actualMinutes": null
  },
  {
    "trackNumber": 79,
    "unitNumber": 9,
    "unitTitle": "Unit 9: Global Change",
    "segmentType": "science_applied",
    "moduleNumber": null,
    "title": "Unit 9 Science Applied: How Can We Bring Back Biodiversity?",
    "estLengthFormatted": "0:07:07",
    "estMinutes": 7.12,
    "actualMinutes": null
  }
];

export function parseSheetDurationMinutes(cell: string | undefined): number | null {
  const clean = (cell || '').trim();
  if (!clean || clean === '—' || clean === '-') return null;
  if (/^\d+(\.\d+)?$/.test(clean)) return Number(clean);
  const parts = clean.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) {
    return Math.round((parts[0] * 60 + parts[1] + parts[2] / 60) * 100) / 100;
  }
  if (parts.length === 2) {
    return Math.round((parts[0] + parts[1] / 60) * 100) / 100;
  }
  return null;
}

/**
 * Looks up assigned AP Environmental Science module numbers in the Audiobook Sheet,
 * prefers Actual Audio Length if recorded (otherwise Est. Minutes), and adds +20% margin buffer.
 */
export function computeEcoModulesDurationWithBuffer(
  moduleNumbers: number[],
  tracks: ApesAudiobookTrack[] = APES_AUDIOBOOK_TRACKS,
  bufferMultiplier = 1.2
): {
  matchedModules: number[];
  rawMinutes: number;
  bufferedMinutes: number;
  breakdownLabel: string;
} | null {
  const uniqueMods = Array.from(
    new Set(moduleNumbers.filter((n) => Number.isInteger(n) && n >= 0 && n <= 99))
  ).sort((a, b) => a - b);

  if (uniqueMods.length === 0) return null;

  let rawSum = 0;
  const matchedNums: number[] = [];
  const parts: string[] = [];

  for (const modNum of uniqueMods) {
    const matchingRows = tracks.filter(
      (t) => t.moduleNumber === modNum && (modNum === 0 || t.segmentType === 'module')
    );
    if (matchingRows.length === 0) continue;
    const mins = matchingRows.reduce(
      (sum, row) => sum + (row.actualMinutes ?? row.estMinutes),
      0
    );
    rawSum += mins;
    matchedNums.push(modNum);
    parts.push(`Module ${modNum} (${Math.round(mins * 10) / 10} min)`);
  }

  if (matchedNums.length === 0 || rawSum <= 0) return null;

  const rawRounded = Math.round(rawSum * 10) / 10;
  const bufferedMinutes = Math.max(15, Math.ceil(rawSum * bufferMultiplier));
  const bufferPct = Math.round((bufferMultiplier - 1) * 100);
  const sumClause =
    parts.length > 1
      ? `${parts.join(' + ')} = ${rawRounded} min of audio`
      : `${parts[0]} of audio`;

  return {
    matchedModules: matchedNums,
    rawMinutes: rawRounded,
    bufferedMinutes,
    breakdownLabel: `Why ${bufferedMinutes} min: ${sumClause}, plus a ${bufferPct}% buffer for pausing and notes.`,
  };
}

export function parseAudiobookTracksFromCsv(csvText: string): ApesAudiobookTrack[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (inQuotes) {
      if (ch === '"' && csvText[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && csvText[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
  }

  if (rows.length < 2) return APES_AUDIOBOOK_TRACKS;

  const parsed: ApesAudiobookTrack[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const trackNum = Number(r[0]);
    if (!Number.isFinite(trackNum) || trackNum <= 0) continue;
    parsed.push({
      trackNumber: trackNum,
      unitNumber: Number(r[1] || 0),
      unitTitle: r[2] || '',
      segmentType: r[3] || 'module',
      moduleNumber: r[4] !== undefined && r[4].trim() !== '' ? Number(r[4]) : null,
      title: r[5] || '',
      estLengthFormatted: r[8] || '',
      estMinutes: Number(r[9] || 0),
      actualMinutes: parseSheetDurationMinutes(r[13]),
    });
  }

  return parsed.length > 0 ? parsed : APES_AUDIOBOOK_TRACKS;
}

/**
 * Optionally fetches live rows from Google Sheets API (when OAuth token or API key is present)
 * so newly recorded Actual Audio Lengths on the spreadsheet override static estimates automatically.
 */
export async function fetchLiveAudiobookTracks(
  accessToken?: string
): Promise<ApesAudiobookTrack[]> {
  if (!accessToken) return APES_AUDIOBOOK_TRACKS;
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${APES_AUDIOBOOK_SPREADSHEET_ID}/values/Chapters!A2:P90`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return APES_AUDIOBOOK_TRACKS;
    const data = (await resp.json()) as { values?: string[][] };
    if (!Array.isArray(data.values) || data.values.length === 0) {
      return APES_AUDIOBOOK_TRACKS;
    }
    return data.values.map((r) => ({
      trackNumber: Number(r[0] || 0),
      unitNumber: Number(r[1] || 0),
      unitTitle: r[2] || '',
      segmentType: r[3] || 'module',
      moduleNumber: r[4] !== undefined && r[4] !== '' ? Number(r[4]) : null,
      title: r[5] || '',
      estLengthFormatted: r[8] || '',
      estMinutes: Number(r[9] || 0),
      actualMinutes: parseSheetDurationMinutes(r[13]),
    }));
  } catch {
    return APES_AUDIOBOOK_TRACKS;
  }
}
