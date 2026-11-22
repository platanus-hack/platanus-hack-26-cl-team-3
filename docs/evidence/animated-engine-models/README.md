# Animated engine bay references

Open a GLB in a glTF animation viewer and select a named inspection clip. Each clip moves one component for inspection and returns it to its starting position. These review assets use illustration or photograph coordinates and approximate inspection distances. Mechanical disassembly paths, concealed components and physical registration require additional source geometry.

| Model | Animated parts |
| --- | ---: |
| [Tracker-2023-Premier-1.2T-engine-bay-inspection](Tracker-2023-Premier-1.2T-engine-bay-inspection.glb) | 9 |
| [chevrolet-onix-2023-photo-reference-inspection](chevrolet-onix-2023-photo-reference-inspection.glb) | 9 |
| [ford-ranger-2022-photo-reference-inspection](ford-ranger-2022-photo-reference-inspection.glb) | 9 |
| [hyundai-tucson-2025-photo-reference-inspection](hyundai-tucson-2025-photo-reference-inspection.glb) | 9 |
| [kia-rio-2023-photo-reference-inspection](kia-rio-2023-photo-reference-inspection.glb) | 8 |
| [mazda-cx5-2021-photo-reference-inspection](mazda-cx5-2021-photo-reference-inspection.glb) | 9 |
| [outback-2016-36r-vano-inspection](outback-2016-36r-vano-inspection.glb) | 27 |
| [ram-700-bighorn-2022](ram-700-bighorn-2022.glb) | 7 |
| [RAM 700 Big Horn air filter detail](ram-700-bighorn-2022-air-filter-detail.glb) | 6 |
| [suzuki-swift](suzuki-swift.glb) | 9 |
| [toyota-corolla-2020-photo-reference-inspection](toyota-corolla-2020-photo-reference-inspection.glb) | 7 |

The 2022 RAM 700 Big Horn 1.4 L uses seven textured silhouettes from printed page 209 of the [Stellantis manual](https://manualesdigitales.stellantis.com.mx/wp-content/uploads/2021/07/OM_RAM700_2022MY_COpdf.pdf).

The separate [air filter detail](RAM-700-Big-Horn-air-filter-detail.png) uses the 1.4 L illustrations on printed pages 215 and 216. The manual specifies the duct and cover travel directions. Independent clips highlight the three retainers and filter element. Their inspection distances and physical hinge axes remain unmeasured.

The Japanese Suzuki Swift Sport CBA-ZC32S uses nine visible parts from a [photograph by Tokumeigakarinoaoshima](https://commons.wikimedia.org/wiki/File:The_engine_room_of_Suzuki_SWIFT_Sport_(CBA-ZC32S).JPG). The Swift model and its preview adapt that photograph with traced contours and inspection movement and are distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

The eight existing catalog vehicles retain the source geometry and orientation of their respective reference assets. The Rio and Ranger photographs show South African configurations. The Onix and Tracker photographs show Brazilian configurations, the Tucson shows a Peruvian configuration, and the Corolla and CX-5 show US configurations.

## Individual replacement parts

These models depict the specified replacement components in isolation. The reviewed sources establish their external dimensions or form factors. An individual vehicle's installed supplier and the engine-space mounting transforms remain unverified.

- [RAM 700 spark plug GLB](RAM-700-1.4-NGK-BKR6E.glb). The [NGK Chile application table](https://automotivo.ngkntk.com.br/wp-content/uploads/2022/03/Tabla-Chile-4R_2022.pdf) lists BKR6E for the 85 CV RAM 700 1.4 8V from 2018. The model uses the [published 16 mm hex, M14 thread and 19.1 mm reach](https://www.partseurope.eu/en/product/spark-plug/BKR6E). The remaining exterior profile follows one image, with a textured thread envelope and a single visible ground-electrode face. The model and [render](RAM-700-1.4-NGK-BKR6E.png) adapt a [photograph by Slcreza](https://commons.wikimedia.org/wiki/File:Spark_Plug_20180205_110424.jpg) and are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- [Onix Plus F48 fuse GLB](Onix-Plus-2023-F48-MICRO2-10A.glb). The Brazil MY2023 manual specifies a 10 A MICRO2 fan relay fuse. The [render](Onix-Plus-2023-F48-MICRO2-10A.png) shows the exterior of a Littelfuse 327-series type. [GM and Littelfuse references and drawing dimensions](Onix-Plus-2023-F48-MICRO2-10A.sources.txt).
- [Ranger air filter GLB](Ranger-2.2-TDCi-air-filter.glb). The [MANN-FILTER C 22 024 catalog](https://www.mann-filter.com/en/catalog/search-results/product.html/c22024_mann-filter.html) lists the TKE 2.2 TDCi application and dimensions of 222 mm outside diameter, 135 mm opening and 138 mm height. The [render](Ranger-2.2-TDCi-air-filter.png) shows the dimensioned envelope. Pleats, seals and internal geometry remain undocumented. The extraction distance is illustrative.
- [Kia Rio 1.4 G4LC oil filter GLB](Kia-Rio-2023-G4LC-W7023.glb). The W 7023 study follows the 66 mm shell diameter, 77 mm height and published seal dimensions. [Render](Kia-Rio-2023-G4LC-W7023.png) · [Sources and limits](Kia-Rio-2023-G4LC-W7023.sources.txt).
- [Mazda CX-5 Touring air filter GLB](Mazda-CX-5-2021-C27019.glb). The C 27 019 study follows the 271 × 179 × 41 mm dimensions of the replacement cross-referenced to Mazda PE07-13-3A0A. [Render](Mazda-CX-5-2021-C27019.png) · [Sources and limits](Mazda-CX-5-2021-C27019.sources.txt).
- [Tracker 1.2 turbo oil filter GLB](Tracker-2023-1.2T-W7561-oil-filter.glb). MANN lists the W 7561 for the Brazilian 1.2 turbo. The mounting-face proportions are approximate. [Render](Tracker-2023-1.2T-W7561-oil-filter.png) · [Sources and limits](Tracker-2023-1.2T-W7561-oil-filter.sources.txt).
- [Corolla XSE air filter GLB](Toyota-Corolla-2020-XSE-33-3080.glb). K&N lists the 33-3080 for the US 2.0 L Corolla. The model follows the published 268 × 152 × 29 mm outer dimensions and the visible pleat pattern. [Render](Toyota-Corolla-2020-XSE-33-3080.png) · [Sources and limits](Toyota-Corolla-2020-XSE-33-3080.sources.txt).

## Native service assembly

- [Outback fuse box service assembly GLB](Subaru-Outback-2016-EZ36-fuse-box-service.glb). The housing and tray use the CapoAR EZ36 data. The six-second native inspection action moves the lid to reveal the 38 fuse positions and 16 relay positions, then returns it to its seat. [Render](Subaru-Outback-2016-EZ36-fuse-box-service.png) · [Sources and limits](Subaru-Outback-2016-EZ36-fuse-box-service.sources.txt).
