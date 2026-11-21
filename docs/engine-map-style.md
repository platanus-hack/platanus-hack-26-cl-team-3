# Engine map inspection style

Use the Subaru Outback 2016 3.6R viewer as the reference for vehicle maps, component selection and guided procedures. A driver should first recognize the physical component in the engine bay, follow its movement in the guide, then find it again in the same place. On the EZ36 map, the washer cap glows beside the battery. The filler neck and cap lift together, the cap hinges open, and the driver can see fluid enter the opening. The assembly returns to the original registered pose.

## Appearance and layout

**Map and controls.** In the reference viewer, show the make, model, year and engine above the canvas. Keep the camera selector and reset control together. Put part actions and the current step below the canvas. On Android, use the existing scanner controls and the live camera background. Collapse the details panel when manual playback starts so the physical location and moving component remain visible.

**Model and materials.** Render the exact variant’s registered model with its existing proportions, facets and materials. Keep nearby components visible to give the driver a point of reference. Carry the washer, dipstick and fuse box accents across vehicles. Other components retain their source materials unless the catalog assigns an accent.

**Selection and labels.** Pulse the visible silhouette of the selected mesh. In the reference viewer, anchor a short localized name to the part and use its accent for the leader line. The Android scanner shows the name in its controls and guides the driver with a distance indicator, found status or direction arrow. Keep the label clear of the opening, moving lid, stream and other labels. Pair selection color with a part name and a readable step. Use the same animated pose for rendering, tapping and positioning the guide.

| Reference viewer element | Design value |
| --- | --- |
| Canvas, panel and control backgrounds | `#10171d`, `#192228`, `#26343d` |
| Control border and pressed state | `#51616b`, `#12685e` |
| Primary, secondary and active-step text | `#edf2f4`, `#cbd7dc`, `#ffe79e` |
| Washer, dipstick and fuse box accents | Mint `#51e3c1`, amber `#ffd267`, blue `#79b9ff` |
| Typography | System sans serif. Responsive 18–27 px title, 16 px controls, 14 px detail |
| Control shape and spacing | 6 px corners, 8 px gaps |

## Motion and timing

| Action | What the driver sees | Availability |
| --- | --- | --- |
| Highlight | Two pulses in place. The part, camera and neighboring geometry stay aligned. Allow time to recognize the component before moving it. | Every mapped component. Reference duration 3.2 s. |
| Lift | Ease the selected group out of the bay, leave a ring at the source and hold the part in view. Frame the motion using its bounds so a small cap is readable and a battery stays in frame. | Every mapped component. The reference clip holds the elevated pose at 4.2 s. Android includes a return and finishes at 5 s. |
| Refill | Highlight, lift, open, pour, close and return. Rotate the cap around its hinge. Show the bottle spout, continuous stream and rising surface inside the open filler neck. | Outback washer. Reference and Android duration 10 s. |

Use eased starts and stops. Keep the original transform so playback, interruption and re-registration can restore the same anchor. Elevation is an inspection view of the model. The illustrated liquid level is independent of the actual level in the vehicle. Each additional procedure needs its own mechanism and vehicle-specific instructions.

## Adding another vehicle or part

1. **Identify the variant.** Record make, model, year, engine, source asset and registration. Reuse the part identifiers and action vocabulary. Measure the new vehicle’s coordinates, scale and camera alignment.
2. **Bind each component.** Map its identifier to the localized name, mesh group and anchor. Identify the submeshes that can move independently, such as a cap, hinge or dipstick. The Outback washer model contains the filler neck and cap.
3. **Declare supported actions.** A registered part can highlight. An independently movable group can lift. Enable a procedure when its geometry and the exact vehicle’s instructions support it. Record the manual section and page with the procedure data.
4. **Connect the decision agent.** Resolve the vehicle and selected part, then expose the supported actions. The Outback camera card accepts `highlight` or `lift` on all 27 mapped components and `refill` on the washer. An optional action plays once after the user opens the card and registration completes. A card without an action retains its existing behavior.

For example, a request to locate the fuse box maps to `fuses / highlight`. Inspecting the dipstick maps to `dipstick / lift`. Demonstrating windshield washer refill maps to `washer / refill`. The scanner also offers these actions directly in the selected part’s details.

## Reviewing a new map

- Inspect the part in context, at peak lift, during operation and after return. Compare the first and final pose from the same camera.
- Check the smallest supported viewport and at least two camera angles. For refill, include a view into the open neck so the rim, fluid surface and incoming stream are distinguishable.
- Switch selections, interrupt playback, lose tracking and register again. Check the guide and tap target follow the displayed geometry.
- For a motion-reduced presentation, design discrete steps with manual advancement. Validate that mode on the target device before claiming support.
- Verify live placement on the exact vehicle. A replay can verify the mesh and rendering independently of tracking on a physical car.

The five captures below are offline replays from the Android OpenGL renderer running on an emulator. Live ARCore placement on a physical Outback remains unverified. The captures cover the [fuse box highlight](evidence/outback-inspection/fuses.png), [battery lift](evidence/outback-inspection/battery.png), [washer pour](evidence/outback-inspection/washer.png), [open neck from above](evidence/outback-inspection/overhead.png) and [return to the registered position](evidence/outback-inspection/returned.png).
