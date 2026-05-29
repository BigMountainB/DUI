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
    // Codex upgraded vehicle art — front/back pairs for premium garage cars.
    { key: 'codex_beater_back',          path: 'assets/cars/codex/codex_beater_back.png' },
    { key: 'codex_beater_front',         path: 'assets/cars/codex/codex_beater_front.png' },
    { key: 'codex_suv4x4_back',          path: 'assets/cars/codex/codex_suv4x4_back.png' },
    { key: 'codex_suv4x4_front',         path: 'assets/cars/codex/codex_suv4x4_front.png' },
    { key: 'codex_used_truck_back',      path: 'assets/cars/codex/codex_used_truck_back.png' },
    { key: 'codex_used_truck_front',     path: 'assets/cars/codex/codex_used_truck_front.png' },
    { key: 'codex_new_truck_back',       path: 'assets/cars/codex/codex_new_truck_back.png' },
    { key: 'codex_new_truck_front',      path: 'assets/cars/codex/codex_new_truck_front.png' },
    { key: 'codex_ev_truck_back',        path: 'assets/cars/codex/codex_ev_truck_back.png' },
    { key: 'codex_ev_truck_front',       path: 'assets/cars/codex/codex_ev_truck_front.png' },
    { key: 'codex_sports_car_back',      path: 'assets/cars/codex/codex_sports_car_back.png' },
    { key: 'codex_sports_car_front',     path: 'assets/cars/codex/codex_sports_car_front.png' },
    { key: 'codex_bestla_roadster_back', path: 'assets/cars/codex/codex_bestla_roadster_back.png' },
    { key: 'codex_bestla_roadster_front', path: 'assets/cars/codex/codex_bestla_roadster_front.png' },
    { key: 'codex_playdout_s3x_back',  path: 'assets/cars/codex/bestla_playdout_s3x_back.png' },
    { key: 'codex_playdout_s3x_front', path: 'assets/cars/codex/bestla_playdout_s3x_front.png' },
    // ── Beater first-person cockpit (transparent PNG overlay) ─────────
    // Native 1672×941, scaled to fill the 800×450 viewport.  Drawn in
    // GameScene._buildCockpit / _renderCockpit when the active vehicle
    // is `beater`.  Other vehicles continue using the third-person
    // playerSprite until their own cockpit art ships.
    { key: 'beater_cockpit_base',         path: 'assets/cars/codex/cockpit/beater_cockpit_no_wheel.png' },
    { key: 'beater_steering_wheel',       path: 'assets/cars/codex/cockpit/beater_steering_wheel.png' },
    { key: 'beater_speedometer_needle',   path: 'assets/cars/codex/cockpit/beater_speedometer_needle.png' },
    { key: 'beater_fuel_needle',          path: 'assets/cars/codex/cockpit/beater_fuel_needle.png' },
    { key: 'beater_low_fuel_light',       path: 'assets/cars/codex/cockpit/beater_low_fuel_light.png' },
    { key: 'beater_wiper_arm',            path: 'assets/cars/codex/cockpit/beater_wiper_arm.png' },
    // Traffic aliases for the Codex garage cars.  GameScene resolves NPC
    // traffic with car_back_<set> / car_front_<set> keys.
    { key: 'car_back_codex_beater',          path: 'assets/cars/codex/codex_beater_back.png' },
    { key: 'car_front_codex_beater',         path: 'assets/cars/codex/codex_beater_front.png' },
    { key: 'car_back_codex_suv4x4',          path: 'assets/cars/codex/codex_suv4x4_back.png' },
    { key: 'car_front_codex_suv4x4',         path: 'assets/cars/codex/codex_suv4x4_front.png' },
    { key: 'car_back_codex_used_truck',      path: 'assets/cars/codex/codex_used_truck_back.png' },
    { key: 'car_front_codex_used_truck',     path: 'assets/cars/codex/codex_used_truck_front.png' },
    { key: 'car_back_codex_new_truck',       path: 'assets/cars/codex/codex_new_truck_back.png' },
    { key: 'car_front_codex_new_truck',      path: 'assets/cars/codex/codex_new_truck_front.png' },
    { key: 'car_back_codex_ev_truck',        path: 'assets/cars/codex/codex_ev_truck_back.png' },
    { key: 'car_front_codex_ev_truck',       path: 'assets/cars/codex/codex_ev_truck_front.png' },
    { key: 'car_back_codex_sports_car',      path: 'assets/cars/codex/codex_sports_car_back.png' },
    { key: 'car_front_codex_sports_car',     path: 'assets/cars/codex/codex_sports_car_front.png' },
    { key: 'car_back_codex_bestla_roadster', path: 'assets/cars/codex/codex_bestla_roadster_back.png' },
    { key: 'car_front_codex_bestla_roadster', path: 'assets/cars/codex/codex_bestla_roadster_front.png' },
    // Extra civilian NPC traffic variants.
    { key: 'car_back_npc_hatchback',  path: 'assets/cars/codex/car_npc_hatchback_back.png' },
    { key: 'car_front_npc_hatchback', path: 'assets/cars/codex/car_npc_hatchback_front.png' },
    { key: 'car_back_npc_minivan',    path: 'assets/cars/codex/car_npc_minivan_back.png' },
    { key: 'car_front_npc_minivan',   path: 'assets/cars/codex/car_npc_minivan_front.png' },
    { key: 'car_back_npc_wagon',      path: 'assets/cars/codex/car_npc_wagon_back.png' },
    { key: 'car_front_npc_wagon',     path: 'assets/cars/codex/car_npc_wagon_front.png' },
    // Side-view police images for cars parked on the shoulder.  Random
    // roadside cop encounters use these — left-shoulder cops face right
    // (toward the road) and vice versa.
    { key: 'car_left_police',  path: 'assets/cars/car_left_police.png' },
    { key: 'car_right_police', path: 'assets/cars/car_right_police.png' },
  ],
  // (hookers section removed — HookerSystem was vestigial / deleted.)
  drugs: [
    { key: 'drug_beer',     path: 'assets/drugs/beer.png?v=badge-zoom-1' },
    { key: 'drug_weed',     path: 'assets/drugs/weed.png?v=badge-zoom-1' },
    { key: 'drug_cocaine',  path: 'assets/drugs/cocaine.webp?v=badge-zoom-1' },
    { key: 'drug_shrooms',  path: 'assets/drugs/shrooms.png?v=badge-zoom-1' },
    { key: 'drug_lsd',      path: 'assets/drugs/lsd.png?v=badge-zoom-1' },
    { key: 'drug_heroin',   path: 'assets/drugs/heroin.png?v=badge-zoom-1' },
    { key: 'drug_rx',       path: 'assets/drugs/rx.png?v=badge-zoom-1' },
    { key: 'drug_fentanyl', path: 'assets/drugs/fentanyl.png?v=badge-zoom-1' },
    { key: 'drug_ketamine', path: 'assets/drugs/ketamine.png?v=badge-zoom-1' },
    { key: 'drug_meth',     path: 'assets/drugs/meth.png?v=badge-zoom-1' },
  ],
  buildings: [
    { key: 'space_needle', path: 'assets/buildings/codex/space_needle_landmark.png' },
    // Codex real-reference scenery pass — transparent cutout candidates
    // grounded in Seattle / Bellevue / Issaquah reference architecture.
    { key: 'codex_seattle_skyline',         path: 'assets/buildings/codex/seattle_skyline_cluster.png' },
    { key: 'codex_seattle_tower_pair',      path: 'assets/buildings/codex/seattle_tower_pair.png' },
    { key: 'codex_seattle_office_cluster',  path: 'assets/buildings/codex/seattle_office_cluster.png' },
    { key: 'codex_bellevue_skyline',        path: 'assets/buildings/codex/bellevue_skyline_cluster.png' },
    { key: 'codex_bellevue_wavy_residential', path: 'assets/buildings/codex/bellevue_wavy_residential.png' },
    { key: 'codex_bellevue_city_center_dark', path: 'assets/buildings/codex/bellevue_city_center_dark.png' },
    { key: 'codex_bellevue_braced_glass_tower', path: 'assets/buildings/codex/bellevue_braced_glass_tower.png' },
    { key: 'codex_bellevue_residential_cluster', path: 'assets/buildings/codex/bellevue_residential_cluster.png' },
    { key: 'codex_seattle_columbia_center', path: 'assets/buildings/codex/seattle_columbia_center.png' },
    { key: 'codex_seattle_rainier_square',  path: 'assets/buildings/codex/seattle_rainier_square.png' },
    { key: 'codex_seattle_two_union_square', path: 'assets/buildings/codex/seattle_two_union_square.png' },
    { key: 'codex_seattle_1201_third',      path: 'assets/buildings/codex/seattle_1201_third.png' },
    { key: 'codex_seattle_municipal_tower', path: 'assets/buildings/codex/seattle_municipal_tower.png' },
    { key: 'codex_seattle_f5_tower',        path: 'assets/buildings/codex/seattle_f5_tower.png' },
    { key: 'codex_seattle_safeco_plaza',    path: 'assets/buildings/codex/seattle_safeco_plaza.png' },
    { key: 'codex_seattle_city_centre',     path: 'assets/buildings/codex/seattle_city_centre.png' },
    { key: 'codex_seattle_russell_investments', path: 'assets/buildings/codex/seattle_russell_investments.png' },
    { key: 'codex_seattle_lumen_field',     path: 'assets/buildings/codex/seattle_lumen_field.png' },
    { key: 'codex_seattle_tmobile_park',    path: 'assets/buildings/codex/seattle_tmobile_park.png' },
    { key: 'codex_bellevue_roadside_strip', path: 'assets/buildings/codex/bellevue_roadside_strip.png' },
    // Directional variants — angle-matched for the side of the road
    // they spawn on so the façade faces the player as they pass.
    { key: 'codex_pse_bellevue_office_left',         path: 'assets/buildings/codex/bellevue_pse_office_left.png' },
    { key: 'codex_pse_bellevue_office_right',        path: 'assets/buildings/codex/bellevue_pse_office_right.png' },
    { key: 'codex_pse_bellevue_second_office_left',  path: 'assets/buildings/codex/bellevue_pse_second_office_left.png' },
    { key: 'codex_pse_bellevue_second_office_right', path: 'assets/buildings/codex/bellevue_pse_second_office_right.png' },
    { key: 'codex_bellevue_twin_residential_left',   path: 'assets/buildings/codex/bellevue_twin_residential_left.png' },
    { key: 'codex_issaquah_front_supply',   path: 'assets/buildings/codex/issaquah_front_st_supply.png' },
    { key: 'codex_issaquah_highlands',      path: 'assets/buildings/codex/issaquah_highlands_market.png' },
    { key: 'codex_issaquah_cottage',        path: 'assets/buildings/codex/issaquah_craftsman_cottage.png' },
    { key: 'codex_issaquah_roadside_strip_perspective', path: 'assets/buildings/codex/issaquah_roadside_strip_perspective.png' },
    // Compact dry-side town/farm cutouts. Runtime copies are cropped WebP
    // assets; the full generated originals live under Archive/.
    { key: 'codex_cle_elum_general_store',      path: 'assets/buildings/codex/cle_elum_general_store.webp' },
    { key: 'codex_ellensburg_main_street_shops', path: 'assets/buildings/codex/ellensburg_main_street_shops.webp' },
    { key: 'codex_east_wa_weathered_house',     path: 'assets/buildings/codex/east_wa_weathered_house.webp' },
    { key: 'codex_east_wa_barn',                path: 'assets/buildings/codex/east_wa_barn.webp' },
    { key: 'codex_east_wa_abandoned_bungalow',  path: 'assets/buildings/codex/east_wa_abandoned_bungalow.webp' },
    { key: 'codex_east_wa_brick_storefront_1',  path: 'assets/buildings/codex/east_wa_brick_storefront_1.webp' },
    { key: 'codex_east_wa_brick_storefront_2',  path: 'assets/buildings/codex/east_wa_brick_storefront_2.webp' },
    { key: 'codex_east_wa_doublewide_tan',      path: 'assets/buildings/codex/east_wa_doublewide_tan.webp' },
    { key: 'codex_east_wa_doublewide_white',    path: 'assets/buildings/codex/east_wa_doublewide_white.webp' },
    { key: 'codex_east_wa_fenced_house_tan',    path: 'assets/buildings/codex/east_wa_fenced_house_tan.webp' },
    { key: 'codex_east_wa_fenced_house_white',  path: 'assets/buildings/codex/east_wa_fenced_house_white.webp' },
    { key: 'codex_east_wa_two_story_brick_shop', path: 'assets/buildings/codex/east_wa_two_story_brick_shop.webp' },
    { key: 'codex_east_wa_block_repair_shop',   path: 'assets/buildings/codex/east_wa_block_repair_shop.webp' },
    { key: 'codex_east_wa_main_street_storefront', path: 'assets/buildings/codex/east_wa_main_street_storefront.webp' },
    { key: 'codex_east_wa_cafe_storefront',      path: 'assets/buildings/codex/east_wa_cafe_storefront.webp' },
    { key: 'codex_east_wa_auto_parts_store',     path: 'assets/buildings/codex/east_wa_auto_parts_store.webp' },
    { key: 'codex_east_wa_market_storefront',    path: 'assets/buildings/codex/east_wa_market_storefront.webp' },
    { key: 'codex_east_wa_vantage_truck_stop',  path: 'assets/buildings/codex/east_wa_vantage_truck_stop.webp' },
    { key: 'codex_east_wa_ritzville_diner_motel', path: 'assets/buildings/codex/east_wa_ritzville_diner_motel.webp' },
    { key: 'codex_east_wa_palouse_farm_store',  path: 'assets/buildings/codex/east_wa_palouse_farm_store.webp' },
    { key: 'codex_east_wa_pullman_party_house', path: 'assets/buildings/codex/east_wa_pullman_party_house.webp' },
    { key: 'codex_west_seattle_horizon_left',       path: 'assets/buildings/codex/west_seattle_horizon_left.png' },
    { key: 'codex_west_seattle_horizon_right',      path: 'assets/buildings/codex/west_seattle_horizon_right.png' },
    { key: 'codex_west_seattle_lowrise_apartments', path: 'assets/buildings/codex/west_seattle_lowrise_apartments.png' },
    { key: 'codex_west_seattle_junction_shops',     path: 'assets/buildings/codex/west_seattle_junction_shops.png' },
    { key: 'codex_west_seattle_warehouse_row',      path: 'assets/buildings/codex/west_seattle_warehouse_row.png' },
    { key: 'codex_west_seattle_hillside_condos',    path: 'assets/buildings/codex/west_seattle_hillside_condos.png' },
    { key: 'codex_west_seattle_overpass_ramp',      path: 'assets/buildings/codex/west_seattle_overpass_ramp.png' },
    // Container cranes flanking the West Seattle Bridge — strict left/right
    // pairing so each side spawns from its own sub-pool (cranes face the road).
    { key: 'codex_ws_crane_crate_left',         path: 'assets/buildings/codex/west_seattle_container_cranes_crate_left.png' },
    { key: 'codex_ws_crane_white_boxes_left',   path: 'assets/buildings/codex/west_seattle_container_cranes_white_boxes_left.png' },
    { key: 'codex_ws_crane_crate_right',        path: 'assets/buildings/codex/west_seattle_container_cranes_crate_right.png' },
    { key: 'codex_ws_crane_white_boxes_right',  path: 'assets/buildings/codex/west_seattle_container_cranes_white_boxes_right.png' },
    { key: 'codex_west_seattle_container_stack_18', path: 'assets/buildings/codex/west_seattle_container_stack_18.png' },
    // West Seattle homes — same Codex building asset folder as Seattle,
    // Bellevue, and Issaquah regional scenery.
    { key: 'west_seattle_1', path: 'assets/buildings/codex/west_seattle_1.png' },
    { key: 'west_seattle_2', path: 'assets/buildings/codex/west_seattle_2.png' },
    { key: 'west_seattle_3', path: 'assets/buildings/codex/west_seattle_3.png' },
    { key: 'west_seattle_4', path: 'assets/buildings/codex/west_seattle_4.png' },
    { key: 'west_seattle_5', path: 'assets/buildings/codex/west_seattle_5.png' },
    { key: 'west_seattle_6', path: 'assets/buildings/codex/west_seattle_6.png' },
  ],
  rural: [
    // One texture instance represents several distant pasture cows. These
    // can be mirrored and staggered in the route for herd variety.
    { key: 'east_wa_herd_3_cows', path: 'assets/rural/eastern_washington/east_wa_herd_3_cows.webp' },
    { key: 'east_wa_herd_5_cows', path: 'assets/rural/eastern_washington/east_wa_herd_5_cows.webp' },
    { key: 'east_wa_herd_6_cows', path: 'assets/rural/eastern_washington/east_wa_herd_6_cows.webp' },
    { key: 'east_wa_fence_post',   path: 'assets/rural/eastern_washington/east_wa_fence_post.webp' },
    { key: 'east_wa_utility_pole_plain', path: 'assets/rural/eastern_washington/east_wa_utility_pole_plain.webp' },
    { key: 'east_wa_utility_pole_transformer', path: 'assets/rural/eastern_washington/east_wa_utility_pole_transformer.webp' },
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
    // Urban broadleaves — Seattle / Mercer Island / Bellevue street &
    // yard trees.  Bigleaf Maple (Acer macrophyllum) is the iconic PNW
    // city tree; vine maple is the understory infill.
    { key: 'tree_bigleaf_maple_1', path: 'assets/trees/bigleaf_maple_1.png' },
    { key: 'tree_bigleaf_maple_2', path: 'assets/trees/bigleaf_maple_2.png' },
    { key: 'tree_vine_maple_1',    path: 'assets/trees/vine_maple_1.png' },
    // Western WA conifers — Bellevue → Issaquah → Snoqualmie Pass.
    // hemlock1/2 + cedar1/2 already on disk; the other species ship as
    // soon as Codex drops the PNGs (paths are pre-registered so the
    // scenery wiring doesn't need a second editing pass).
    { key: 'tree_hemlock1',       path: 'assets/trees/hemlock1.png' },
    { key: 'tree_hemlock2',       path: 'assets/trees/hemlock2.png' },
    { key: 'tree_hemlock3',       path: 'assets/trees/hemlock3.png' },
    { key: 'tree_red_cedar_1',    path: 'assets/trees/red_cedar_1.png' },
    { key: 'tree_red_cedar_2',    path: 'assets/trees/red_cedar_2.png' },
    { key: 'tree_cedar1',         path: 'assets/trees/cedar1.avif' },
    { key: 'tree_cedar2',         path: 'assets/trees/cedar2.png' },
    { key: 'tree_douglas_fir_1',  path: 'assets/trees/douglas_fir_1.png' },
    { key: 'tree_douglas_fir_2',  path: 'assets/trees/douglas_fir_2.png' },
    // Eastern WA — Cle Elum → Ellensburg → Columbia Basin.
    { key: 'tree_ponderosa_1',    path: 'assets/trees/ponderosa_1.png' },
    { key: 'tree_ponderosa_2',    path: 'assets/trees/ponderosa_2.png' },
    { key: 'tree_white_pine_1',   path: 'assets/trees/white_pine_1.png' },
    { key: 'tree_white_pine_2',   path: 'assets/trees/white_pine_2.png' },
    // Columbia Basin shrub-steppe.
    { key: 'shrub_sage_1',        path: 'assets/trees/sage_1.png' },
    { key: 'shrub_sage_2',        path: 'assets/trees/sage_2.png' },
    { key: 'shrub_rabbitbrush_1', path: 'assets/trees/rabbitbrush_1.png' },
    // Legacy placeholder — kept as final fallback.
    { key: 'tree_generic',        path: 'assets/trees/tree1.png' },
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
    // Loaded first by BootScene so the remaining asset fetches have a
    // title-quality neon splash behind the live progress bar.
    { key: 'ui_loading_screen',   path: 'assets/ui/loading_screen.webp' },
    { key: 'ui_end_crashed_neon', path: 'assets/ui/end_crashed_neon.webp' },
    { key: 'ui_end_overdose_neon', path: 'assets/ui/end_overdose_neon.webp' },
    { key: 'ui_end_busted_screen', path: 'assets/ui/end_busted_screen.webp' },
    // Gas-gauge HUD swap.  Full pump shows above 30 mi remaining,
    // empty pump shows once the tank is at 30 mi or less.
    { key: 'ui_gas_full',        path: 'assets/ui/gas_full.png' },
    { key: 'ui_gas_empty',       path: 'assets/ui/gas_empty.png' },
    { key: 'ui_top_btn_genre',   path: 'assets/ui/top_btn_genre.png' },
    { key: 'ui_top_btn_mute',    path: 'assets/ui/top_btn_mute.png' },
    { key: 'ui_top_btn_unmute',  path: 'assets/ui/top_btn_unmute.png' },
    { key: 'ui_top_btn_map',     path: 'assets/ui/top_btn_map.png' },
    { key: 'ui_top_btn_garage',  path: 'assets/ui/top_btn_garage.png' },
    { key: 'ui_top_btn_ff',      path: 'assets/ui/top_btn_ff.png' },
    { key: 'ui_top_btn_ff_active', path: 'assets/ui/top_btn_ff_active.png' },
    { key: 'ui_top_btn_pause',   path: 'assets/ui/top_btn_pause.png' },
    { key: 'ui_top_btn_pause_active', path: 'assets/ui/top_btn_pause_active.png' },
    // Portrait phone-as-menu background.  Rotating the device to
    // portrait (or pressing M on desktop) launches PhoneMenuScene with
    // this PNG as the full-screen letterboxed background.
    { key: 'ui_phone_menu_bg',   path: 'assets/ui/iphone_menu_bg.png' },
    // Full-frame neon/rain title treatment. Runtime copy is sized to the
    // 800x450 game viewport; the authored full-size PNG stays in Images/.
    { key: 'ui_title_screen',     path: 'assets/ui/title_screen.webp' },
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
