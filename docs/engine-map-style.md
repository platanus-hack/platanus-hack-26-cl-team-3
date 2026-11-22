# Engine map inspection style

The Outback 2016 3.6R uses the registered EZ36 mesh. Keep the selected part’s original facets and materials visible against nearby components. The washer uses mint, the dipstick amber and the fuse box blue. Other components inherit their model materials. Use the scanner’s existing controls, labels and current part details.

| Action | Motion | Availability |
| --- | --- | --- |
| Highlight | Pulse in place over 3.2 seconds. Keep the guide on the part. | Every mapped component |
| Lift | Ease the mesh upward, leave a ring at its registered location, hold, and return within 5 seconds. | Every mapped component |
| Refill | Lift the washer assembly, hinge the cap, pour from the bottle, raise the illustrated level inside the filler neck, close and return in 10 seconds. | Washer only |

The scanner exposes the actions after registration in the selected part’s details. The chat tool can supply an optional action when creating a camera card. Opening the card plays the action once after registration. Existing cards keep their original behavior. The fluid level is an illustration. The registration maps the visible filler neck and cap.

For another engine, bind each action to that variant’s part identifier, mesh, anchor and supported mechanism. Keep source geometry and registration immutable. Apply the inspection pose consistently to rendering, picking and the projected guide. Check the first and last pose, tracking loss, re-registration and selection changes. Validate the placement on the target vehicle.

## Reference viewer tokens

| Element | Reference value |
| --- | --- |
| Scene, panel and control backgrounds | `#10171d`, `#192228`, `#26343d` |
| Border and pressed control | `#51616b`, `#12685e` |
| Primary, secondary and active step text | `#edf2f4`, `#cbd7dc`, `#ffe79e` |
| Washer, dipstick and fuse box accents | `#51e3c1`, `#ffd267`, `#79b9ff` |
| Reference typography and controls | System sans serif, 16 px controls, 14 px detail, 6 px corners, 8 px spacing |

On Android the live camera supplies the background and the surrounding scanner retains its native theme. Collapse the details panel during manual playback. Keep labels clear of the moving part, opening and stream. Preserve a visible source marker during elevation.

## Delivery plan for each vehicle

Record the year, market, engine and reference vehicle. Assign one owner to its model, sources, scanner integration and visual checks. Use the 2016 Outback as the reference for part selection, context and interaction. Use the target vehicle to determine the shape, materials, location and operation of every component.

| Minimum service assembly | Geometry and inspection to verify on the target vehicle |
| --- | --- |
| Oil level | Model the dipstick grip, guide and visible blade. Show extraction and reinsertion along the guide. |
| Oil fill | Model the cap and filler seat. Show the supported release and return motion. |
| Washer fluid | Model the visible filler neck, rim and cap. Show how the cap opens and where fluid enters. |
| Coolant | Identify the expansion tank, its cap and any separate radiator pressure cap. Show their locations and the visible level-check area. |
| Brake fluid | Model the reservoir and cap separately. Keep the body anchored during cap inspection. |
| Battery | Model the casing, hold-down, terminals and visible protective cover. Show how the positive terminal is exposed where supported. |
| Engine fuses | Model the housing, cover, catches and exposed tray. Verify the slot layout and cover movement against the correct variant. |

1. **Reconstruct the surrounding bay.** Include the large visible engine cover or air cleaner, intake ducting, battery, radiator support and other dominant structures present on this vehicle. Review an overview from the front and an oblique angle for recognizable shape, depth and spacing.
2. **Register the assembly.** Identify distinctive real colors such as a dipstick loop, washer cap, pressure-cap label or terminal cover. Record their part identities and positions in several views. Pair the color cues with stable geometry on the firewall, support or housing. Check that similar-looking caps cannot swap places and that registration still works when an operable cover moves.
3. **Inspect each mechanism.** Provide selection, highlighting and a reversible inspection animation for each service assembly. Keep the mounted base still when a lid, cap or gauge moves. Use evidence for hinge axes, travel, exposed interiors and colors. Mark an assembly pending whenever the available views cannot establish its operation or placement.
4. **Verify through the scanner.** Compare the production mesh with the source at matching angles and inspect from a held-out angle. Check picking, guide location, return pose and re-registration. Record physical on-car validation separately from replay.
5. **Deliver visual evidence.** Include an overview, oblique view, detail of a mounted component, and distinct operating states in the pull request. Report coverage for all seven assemblies and for the larger surrounding structures. Count a vehicle as complete when that coverage is demonstrated.
