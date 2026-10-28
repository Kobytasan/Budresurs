import type { Product } from './types'

export interface ProductMedia {
  src: string
  source: string
  title: string
  author: string
  license: string
}

const mediaBySku: Record<string, ProductMedia> = {
  'BR-DRILL-18': {
    src: '/images/products/cordless-drill.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Black_and_Decker_20-Volt_Power_Drill_(49112921413).jpg',
    title: 'Black and Decker 20-Volt Power Drill',
    author: 'Tony Webster',
    license: 'CC BY 2.0',
  },
  'BR-DRILL-BIT-SET': {
    src: '/images/products/drill-bits.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:2010-01-21_Craftsman_Professional_cobalt_drill_bit_set.jpg',
    title: 'Craftsman Professional cobalt drill bit set',
    author: 'Ildar Sagdejev (Specious)',
    license: 'CC BY-SA 4.0',
  },
  'BR-PERFORATOR-800': {
    src: '/images/products/rotary-hammer.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Black_%26_Decker_P80-38_Rotary_Hammer_Drill_1.jpg',
    title: 'Black & Decker P80-38 Rotary Hammer Drill',
    author: 'toolstop',
    license: 'CC BY 2.0',
  },
  'BR-WRENCH-SET': {
    src: '/images/products/wrench-set.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:2008-04-14_Chrome-Vanadium_Wrenches.jpg',
    title: 'Chrome-vanadium combination wrenches',
    author: 'Ildar Sagdejev (Specious)',
    license: 'CC BY-SA 3.0',
  },
  'BR-PLIERS-180': {
    src: '/images/products/pliers.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Tool-pliers.jpg',
    title: 'Pliers',
    author: 'Evan-Amos',
    license: 'Public domain',
  },
  'BR-SCREWDRIVER-SET': {
    src: '/images/products/screwdriver-set.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Screwdriver_set_with_great_variety_of_bits_and_ratchet_screwdriver.jpg',
    title: 'Screwdriver set with bits and ratchet screwdriver',
    author: 'Pittigrilli',
    license: 'CC BY 4.0',
  },
  'BR-LEVEL-LASER': {
    src: '/images/products/laser-level.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Laser-Level.jpg',
    title: 'Laser level on a construction site',
    author: 'Billbeee at English Wikipedia',
    license: 'CC BY 2.5',
  },
  'BR-LEVEL-600': {
    src: '/images/products/spirit-level.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Waterpass.jpg',
    title: 'Spirit level',
    author: 'Dmitry Makeev',
    license: 'CC BY-SA 4.0',
  },
  'BR-SCREW-WOOD-5X70': {
    src: '/images/products/wood-screw.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Fetter-thread_lag_screw_with_full_point.jpg',
    title: 'Lag screw with full point',
    author: 'Wp-0001',
    license: 'CC BY 4.0',
  },
  'BR-ANCHOR-10X80': {
    src: '/images/products/anchor-bolt.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Ancor_bolt_for_concrete.JPG',
    title: 'Anchor bolt for concrete',
    author: 'Dmitry G',
    license: 'CC BY-SA 3.0',
  },
  'BR-GRINDER-125': {
    src: '/images/products/angle-grinder.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:A_welder_using_an_angle_grinder_to_grind_steel.jpg',
    title: 'A welder using an angle grinder to grind steel',
    author: 'Adygrafix250',
    license: 'CC BY-SA 4.0',
  },
  'BR-SAW-185': {
    src: '/images/products/circular-saw.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:DeWalt_circular_saw.jpg',
    title: 'DeWalt circular saw',
    author: 'Mark Hunter',
    license: 'CC BY 2.0',
  },
  'BR-HAMMER-500': {
    src: '/images/products/hammer.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Hammer_(6371964415).jpg',
    title: 'Hammer',
    author: 'James Bowe',
    license: 'CC BY 2.0',
  },
  'BR-TAPE-5M': {
    src: '/images/products/tape-measure.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:A_pair_of_hands_holding_a_construction_measuring_tape.jpg',
    title: 'A pair of hands holding a construction measuring tape',
    author: 'Nenad Stojkovic',
    license: 'CC BY 2.0',
  },
  'BR-HELMET': {
    src: '/images/products/hard-hat.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Cologne_Germany_Safety-helmet-with-headset-01.jpg',
    title: 'Safety helmet with headset',
    author: 'CEphoto, Uwe Aranas',
    license: 'CC BY-SA 3.0',
  },
  'BR-GLASSES': {
    src: '/images/products/safety-eyewear.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Safety_Eyewear.jpg',
    title: 'Safety eyewear',
    author: 'DJSparky',
    license: 'CC BY-SA 4.0',
  },
  'BR-GLOVES': {
    src: '/images/products/work-gloves.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Ansell_Edmont_Industrial_Neoprene_Neatop_75_29-50_Gloves_Sol-Vex_U.S.D.A._Accepted_Madi_in_Malaysia_(51879455310).jpg',
    title: 'Ansell Edmont industrial gloves',
    author: 'Joost J. Bakker IJmuiden',
    license: 'CC BY 2.0',
  },
  'BR-LADDER-3': {
    src: '/images/products/aluminum-ladder.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:1619Men_of_the_Philippines_with_aluminum_step_ladders_08.jpg',
    title: 'Men with aluminum step ladders',
    author: 'Judgefloro',
    license: 'CC0',
  },
  'BR-STEP-2': {
    src: '/images/products/aluminum-ladder-product.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Ladder_aluminum.jpg',
    title: 'Aluminum ladder',
    author: 'Amin',
    license: 'CC BY-SA 4.0',
  },
  'BR-EXTENSION-5': {
    src: '/images/products/extension-cord.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Europlug_extension_cord.jpg',
    title: 'Europlug extension cord',
    author: 'Peter Lebbing',
    license: 'CC BY-SA 4.0',
  },
}

const mediaByCategory: Record<string, ProductMedia> = {
  'ruchnyi-instrument': mediaBySku['BR-HAMMER-500'],
  'vymiriuvalnyi-instrument': mediaBySku['BR-TAPE-5M'],
  'kripylne-osnashchennia': mediaBySku['BR-DRILL-BIT-SET'],
  'zasoby-zakhystu': {
    src: '/images/products/construction-site.jpg',
    source: 'https://commons.wikimedia.org/wiki/File:Arequipa,_Peru_(36187196854).jpg',
    title: 'Arequipa, Peru',
    author: 'Sasha India',
    license: 'CC BY 2.0',
  },
  'lestnytsi-ta-dostup': mediaBySku['BR-LADDER-3'],
  elektroinstrument: mediaBySku['BR-DRILL-18'],
}

export function getProductMedia(product: Product): ProductMedia {
  return mediaBySku[product.sku] || mediaByCategory[product.category] || mediaBySku['BR-DRILL-18']
}
