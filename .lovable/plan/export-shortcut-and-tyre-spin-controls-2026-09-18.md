# Export shortcut and tyre spin controls

## What will change
- Replace the Export editor tab with a round export icon in the top-right corner of the live view.
- Open a compact export menu from that icon with transparent-background selection, PNG download, GLB download, and reset.
- Add a new Spin tab at the end of the mobile tab row and a matching collapsible Spin section on desktop.
- Let users drag or swipe the tyre itself horizontally and vertically while keeping zoom available.
- Add automatic X-axis spin, Y-axis turn, or both together, with a play/pause control.
- Add controls for swipe speed, horizontal rotation, vertical rotation, X-axis spin speed, and Y-axis spin speed.
- Put a lock icon beside each rotation and axis-speed control; locked axes ignore swipe and automatic changes while preserving their current angle.

## Technical details
- Wrap the tyre and rim in one animated 3D group so they always move together.
- Use frame-rate-independent animation and clamped frame timing for consistent motion.
- Track pointer movement on the live-view surface and apply it directly to the tyre group rather than rotating the camera.
- Keep camera zoom enabled and retain the existing responsive framing, editor scrolling, styling, and export output.
- Verify mobile portrait and desktop layouts, export menu behavior, swipe rotation, axis locks, animation, and error-free rendering.
