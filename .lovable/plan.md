# Mobile tyre editor layout

## What will change
- Keep the live 3D tyre at the top of the portrait mobile screen.
- Place the editor directly underneath it as part of the page, so the controls can be scrolled without covering the tyre.
- Replace the mobile accordion list with a horizontally scrollable top row of tabs: Text, Text Tread, Tire, Rim, Lighting, and Export.
- Show only the selected tab’s controls below the tab row.
- Move Text Tread into the second position immediately after Text.
- Keep the existing desktop side panel and collapsible section behaviour unchanged.
- Keep export actions available without crowding the narrow mobile header.

## Technical details
- Split the 3D preview and editor into responsive regions: a fixed-height mobile preview followed by the editor, while preserving the full-screen desktop canvas.
- Add mobile-only tab state and accessible tab controls, reusing the existing control contents.
- Reorder the desktop sections so Text Tread also follows Text.
- Verify at the current portrait mobile size and at desktop size, including scrolling, tab switching, tyre interaction, and no overlap.
