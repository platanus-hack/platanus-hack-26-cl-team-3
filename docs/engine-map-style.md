# Engine map inspection style

The Outback 2016 3.6R uses the registered EZ36 mesh. Keep the selected part’s original facets and materials visible against nearby components. The washer uses mint, the dipstick amber and the fuse box blue. Other components inherit their model materials. Use the scanner’s existing controls, labels and current part details.

| Action | Motion | Availability |
| --- | --- | --- |
| Highlight | Pulse in place over 3.2 seconds. Keep the guide on the part. | Every mapped component |
| Lift | Ease the mesh upward, leave a ring at its registered location, hold, and return within 5 seconds. | Every mapped component |
| Refill | Lift the washer assembly, hinge the cap, pour from the bottle, raise the illustrated level inside the filler neck, close and return in 10 seconds. | Washer only |

The scanner exposes the actions after registration in the selected part’s details. The chat tool can supply an optional action when creating a camera card. Opening the card plays the action once after registration. Existing cards keep their original behavior. The fluid level is an illustration. The registration maps the visible filler neck and cap.

For another engine, bind each action to that variant’s part identifier, mesh, anchor and supported mechanism. Keep source geometry and registration immutable. Apply the inspection pose consistently to rendering, picking and the projected guide. Check the first and last pose, tracking loss, re-registration and selection changes. Validate the placement on the target vehicle.
