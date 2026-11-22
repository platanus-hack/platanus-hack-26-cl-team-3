# 2022 RAM 700 Big Horn 1.4

The Android scanner models the Chilean double-cab Big Horn with the 1.4 L Fire engine. Its oil filler and dipstick occupy separate locations. The 1.3 L Firefly uses another layout. The 2022 owner's manual identifies the service points in the 1.4 L engine compartment on printed page 209. [Stellantis owner's manual](https://manualesdigitales.stellantis.com.mx/wp-content/uploads/2021/07/OM_RAM700_2022MY_COpdf.pdf)

## Model and service actions

The 23 selectable meshes include both oil service points, the washer filler, the brake, coolant and hydraulic steering reservoirs, the battery and the closed fuse housing. The air cleaner, its retaining clips, the exposed valve cover, the strut towers and the front and rear bodywork provide context. The model preserves relative scale. ARCore supplies measured depth during placement.

Each selection supports highlighting and lifting. The oil cap turns, rises and returns to its seat. The washer cap separates from its fixed filler neck for the refill sequence. The small reservoir caps and visible dipstick grip have illustrative inspection travel. The drawings show the closed fuse housing, the visible part of the dipstick and the exposed battery fittings. Fuse circuits, the hidden dipstick blade, battery polarity and exact removal distances remain unverified.

[Front view](ram700-engine-bay.png) · [Service plan](ram700-service-plan.png) · [Oil and washer actions](ram700-service-actions.gif) · [Fuse housing lift](ram700-fuse-lift.png)

## Source views and registration

The model uses an estimated camera calibration from front and oblique photographs of a Chilean truck. Additional views of the same trim helped locate the washer cap. The geometry approximates external profiles and hidden depths. [Primary vehicle](https://remotor.cl/lote/superbid/3316272) · [Additional vehicle](https://remotor.cl/lote/superbid/3796947)

The descriptor bank covers two vehicles. Three calibrated colors refine alignment after a match: the blue coolant cap, the amber steering cap and the amber oil filler. For the frontal view, the scanner also checks the spacing of visible color patches and the air cleaner profile against texture measurements. Frame the intake and caps together. [Second descriptor vehicle](https://remotor.cl/lote/superbid/3243535)

The cross-vehicle emulator replay uses a third truck outside the descriptor bank. Its frontal photo also informed matcher tuning. Depth in the replay comes from a rendered depth map. Physical depth, camera tracking while the operator moves, and field performance across trucks require an on-vehicle test.
