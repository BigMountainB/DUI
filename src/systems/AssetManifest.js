export const ASSET_MANIFEST = {
  cars: [
    { key: 'car_player',      path: 'assets/cars/player.webp' },
    { key: 'car_beater',      path: 'assets/cars/beater.png' },
    { key: 'car_sports',      path: 'assets/cars/sports.png' },
    { key: 'car_truck',       path: 'assets/cars/truck.png' },
    // (muscle / lowrider / interceptor / van removed — only Garage.js
    //  referenced them and Garage was vestigial / deleted in cleanup.)
    // Front + back paired sedan/SUV variants. Same-direction NPCs use the
    // back image (player sees them from behind), oncoming NPCs and
    // oncoming cops use the front. Each variant has both directions.
    { key: 'car_back_blue',     path: 'assets/cars/car_back_blue.png' },
    { key: 'car_back_blue2',    path: 'assets/cars/car_back_blue2.png' },
    { key: 'car_back_green',    path: 'assets/cars/car_back_green.png' },
    { key: 'car_back_grey',     path: 'assets/cars/car_back_grey.png' },
    { key: 'car_back_orange',   path: 'assets/cars/car_back_orange.png' },
    { key: 'car_back_red',      path: 'assets/cars/car_back_red.png' },
    { key: 'car_back_red2',     path: 'assets/cars/car_back_red2.png' },
    { key: 'car_back_white',    path: 'assets/cars/car_back_white.png' },
    { key: 'car_back_white2',   path: 'assets/cars/car_back_white2.png' },
    { key: 'car_front_blue',    path: 'assets/cars/car_front_blue.png' },
    { key: 'car_front_blue2',   path: 'assets/cars/car_front_blue2.png' },
    { key: 'car_front_green',   path: 'assets/cars/car_front_green.png' },
    { key: 'car_front_grey',    path: 'assets/cars/car_front_grey.png' },
    { key: 'car_front_orange',  path: 'assets/cars/car_front_orange.png' },
    { key: 'car_front_red',     path: 'assets/cars/car_front_red.png' },
    { key: 'car_front_red2',    path: 'assets/cars/car_front_red2.png' },
    { key: 'car_front_white',   path: 'assets/cars/car_front_white.png' },
    { key: 'car_front_white2',  path: 'assets/cars/car_front_white2.png' },
    // Truck — only the blue variant has front/back so far.
    { key: 'car_back_truck_blue',  path: 'assets/cars/car_truck_back_blue.png' },
    { key: 'car_front_truck_blue', path: 'assets/cars/car_truck_front_blue.png' },
    // Police — front/back pair used by all police cop kinds.
    { key: 'car_back_police',  path: 'assets/cars/car_back_police.png' },
    { key: 'car_front_police', path: 'assets/cars/car_front_police.png' },
    // SWAT — front/back pair used by 4★+ heavy units (do 2× damage).
    { key: 'car_back_swat',    path: 'assets/cars/car_back_swat.png' },
    { key: 'car_front_swat',   path: 'assets/cars/car_front_swat.png' },
    // Side-view police images for cars parked on the shoulder.  Random
    // roadside cop encounters use these — left-shoulder cops face right
    // (toward the road) and vice versa.
    { key: 'car_left_police',  path: 'assets/cars/car_left_police.png' },
    { key: 'car_right_police', path: 'assets/cars/car_right_police.png' },
  ],
  // (hookers section removed — HookerSystem was vestigial / deleted.)
  drugs: [
    { key: 'drug_beer',     path: 'assets/drugs/beer.png' },
    { key: 'drug_weed',     path: 'assets/drugs/weed.png' },
    { key: 'drug_cocaine',  path: 'assets/drugs/cocaine.webp' },
    { key: 'drug_shrooms',  path: 'assets/drugs/shrooms.png' },
    { key: 'drug_lsd',      path: 'assets/drugs/lsd.png' },
    { key: 'drug_heroin',   path: 'assets/drugs/heroin.png' },
    { key: 'drug_rx',       path: 'assets/drugs/rx.png' },          // not yet provided
    { key: 'drug_fentanyl', path: 'assets/drugs/fentanyl.png' },    // not yet provided
    { key: 'drug_ketamine', path: 'assets/drugs/ketamine.png' },
    { key: 'drug_meth',     path: 'assets/drugs/meth.png' },        // not yet provided
  ],
  buildings: [
    { key: 'building_1', path: 'assets/buildings/building1.png' },
    { key: 'building_2', path: 'assets/buildings/building2.webp' },
    { key: 'building_3', path: 'assets/buildings/building3.png' },
    { key: 'building_4', path: 'assets/buildings/building4.png' },
    { key: 'building_5', path: 'assets/buildings/building5.png' },
    { key: 'building_6', path: 'assets/buildings/building6.png' },
    { key: 'building_7', path: 'assets/buildings/building7.png' },
    { key: 'space_needle', path: 'assets/buildings/space_needle.png' },
    // West Seattle homes — single-family residential photo assets used in
    // seattle_urban (mile 0–2) and the Issaquah tail of eastside (mile 16–17).
    { key: 'west_seattle_1', path: 'assets/buildings/west_seattle_1.png' },
    { key: 'west_seattle_2', path: 'assets/buildings/west_seattle_2.png' },
    { key: 'west_seattle_3', path: 'assets/buildings/west_seattle_3.png' },
    { key: 'west_seattle_4', path: 'assets/buildings/west_seattle_4.png' },
    { key: 'west_seattle_5', path: 'assets/buildings/west_seattle_5.png' },
    { key: 'west_seattle_6', path: 'assets/buildings/west_seattle_6.png' },
    // Sea/Bev skyscraper photo assets used in downtown Seattle and
    // downtown Bellevue (eastside_urban).
    { key: 'sea_bev_1', path: 'assets/buildings/sea_bev_1.png' },
    { key: 'sea_bev_2', path: 'assets/buildings/sea_bev_2.png' },
    { key: 'sea_bev_3', path: 'assets/buildings/sea_bev_3.png' },
    { key: 'sea_bev_4', path: 'assets/buildings/sea_bev_4.png' },
    { key: 'sea_bev_5', path: 'assets/buildings/sea_bev_5.png' },
    { key: 'sea_bev_6', path: 'assets/buildings/sea_bev_6.png' },
    // Bell/Issy mid-rise photo assets used in Bellevue surroundings and
    // the early eastside stretch through Issaquah.
    { key: 'bell_issy_1', path: 'assets/buildings/bell_issy_1.png' },
    { key: 'bell_issy_2', path: 'assets/buildings/bell_issy_2.png' },
    { key: 'bell_issy_3', path: 'assets/buildings/bell_issy_3.png' },
    { key: 'bell_issy_4', path: 'assets/buildings/bell_issy_4.png' },
    { key: 'bell_issy_5', path: 'assets/buildings/bell_issy_5.png' },
    { key: 'bell_issy_6', path: 'assets/buildings/bell_issy_6.png' },
  ],
  businesses: [
    // Brand-logo placards used by the rest-stop services-sign UI.
    { key: 'biz_cargo',      path: 'assets/businesses/cargo.png' },        // Gas — west (gas + EV)
    { key: 'biz_huffs',      path: 'assets/businesses/huffs.png' },        // Gas — east (gas only)
    { key: 'biz_cowbellas',  path: 'assets/businesses/cowbellas.png' },    // Hunting
    { key: 'biz_aok',        path: 'assets/businesses/aok.png' },          // Camp
    { key: 'biz_lord',       path: 'assets/businesses/lord.png' },         // Dealer — Lord Motors (EV)
    { key: 'biz_suck',       path: 'assets/businesses/suck.png' },         // Dealer — Sam's Used Car Kingdom (gas)
    { key: 'biz_pharmabros', path: 'assets/businesses/pharmabros.png' },   // Drugs — PharmaBros pharmacy
    // Highway shield badges — composited onto green exit signs.
    { key: 'hwy_i90',   path: 'assets/businesses/hwy_i90.svg' },
    { key: 'hwy_us195', path: 'assets/businesses/hwy_us195.png' },
    { key: 'hwy_wa26',  path: 'assets/businesses/hwy_wa26.png' },
    { key: 'hwy_wa270', path: 'assets/businesses/hwy_wa270.svg' },
    // Per-stop "SHOPPING - NEXT RIGHT" signs — pre-baked by
    // scripts/buildShoppingSigns.js from the user's blank template +
    // brand logos.  One PNG per REST_STOP id; rerun `npm run build:signs`
    // after editing any brand logo or amenity assignment.
    { key: 'sign_S',  path: 'assets/businesses/sign_S.png'  },
    { key: 'sign_M',  path: 'assets/businesses/sign_M.png'  },
    { key: 'sign_B',  path: 'assets/businesses/sign_B.png'  },
    { key: 'sign_I',  path: 'assets/businesses/sign_I.png'  },
    { key: 'sign_SQ', path: 'assets/businesses/sign_SQ.png' },
    { key: 'sign_N',  path: 'assets/businesses/sign_N.png'  },
    { key: 'sign_SP', path: 'assets/businesses/sign_SP.png' },
    { key: 'sign_EA', path: 'assets/businesses/sign_EA.png' },
    { key: 'sign_C',  path: 'assets/businesses/sign_C.png'  },
    { key: 'sign_TH', path: 'assets/businesses/sign_TH.png' },
    { key: 'sign_E',  path: 'assets/businesses/sign_E.png'  },
    { key: 'sign_V',  path: 'assets/businesses/sign_V.png'  },
    { key: 'sign_Y',  path: 'assets/businesses/sign_Y.png'  },
    { key: 'sign_O',  path: 'assets/businesses/sign_O.png'  },
    { key: 'sign_W',  path: 'assets/businesses/sign_W.png'  },
    { key: 'sign_L',  path: 'assets/businesses/sign_L.png'  },
    { key: 'sign_CO', path: 'assets/businesses/sign_CO.png' },
    { key: 'sign_P',  path: 'assets/businesses/sign_P.png'  },
  ],
  trees: [
    { key: 'tree_hemlock1', path: 'assets/trees/hemlock1.png' },
    { key: 'tree_hemlock2', path: 'assets/trees/hemlock2.png' },
    { key: 'tree_cedar1',   path: 'assets/trees/cedar1.avif' },
    { key: 'tree_cedar2',   path: 'assets/trees/cedar2.png' },
    { key: 'tree_generic',  path: 'assets/trees/tree1.png' },
  ],
  weapons: [
    { key: 'weapon_gun',         path: 'assets/weapons/gun.png' },
    { key: 'weapon_spike_strip', path: 'assets/weapons/spike_strip.png' },
    { key: 'weapon_paint_bomb',  path: 'assets/weapons/paint_bomb.png' },
    { key: 'weapon_disguise',    path: 'assets/weapons/disguise.png' },
    { key: 'weapon_grenade',     path: 'assets/weapons/grenade.png' },
    { key: 'weapon_rocket',      path: 'assets/weapons/rocket.png' },
  ],
  cops: [
    // Police cop sprites are sourced from the car_back_police /
    // car_front_police pair in `cars` above.  The single cop_police
    // texture is kept as a legacy fallback only.
    { key: 'cop_police',  path: 'assets/cops/police.png' },
    // 5★ chase helicopter — two rotor frames per facing direction.
    // The renderer alternates 1 ↔ 2 at ~10 Hz for the rotor-spin
    // illusion and uses the _flip variants when the chopper is shown
    // banking the opposite way.
    { key: 'cop_heli_1',      path: 'assets/cops/heli_1.png' },
    { key: 'cop_heli_2',      path: 'assets/cops/heli_2.png' },
    { key: 'cop_heli_1_flip', path: 'assets/cops/heli_1_flip.png' },
    { key: 'cop_heli_2_flip', path: 'assets/cops/heli_2_flip.png' },
  ],
  // (props removed — prop_marker + prop_blood were vestigial manifest
  //  entries with no gameplay code referencing them.)
  ui: [
    { key: 'ui_crash_collision', path: 'assets/ui/crash_collision.png' },
    { key: 'ui_crash_overdose',  path: 'assets/ui/crash_overdose.png' },
    // Title-screen letters — animated independently for a drunk/woozy
    // sway+fade effect on the intro overlay.  See GameScene._buildHUD.
    { key: 'ui_title_d',         path: 'assets/ui/title_d.png' },
    { key: 'ui_title_u',         path: 'assets/ui/title_u.png' },
    { key: 'ui_title_i',         path: 'assets/ui/title_i.png' },
  ],
};

export function flattenManifest() {
  return Object.values(ASSET_MANIFEST).flat();
}
