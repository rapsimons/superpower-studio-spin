# Mobile tyre view and editor scrolling

## What will change
- Condense the mobile title into one single-line label.
- Give the portrait tyre view safer framing so the full tyre remains visible below the header.
- Make the mobile header and editor backgrounds semi-transparent.
- Keep the editor tab row fixed at the top of the editor.
- Limit the mobile settings area to the remaining screen height and give it its own visible vertical scrollbar.
- Preserve the existing desktop layout and controls.

## Technical details
- Adjust the mobile camera framing and preview dimensions without changing desktop camera behavior.
- Separate the fixed tab row from the independently scrolling settings region.
- Verify the result at the current 375 × 668 portrait viewport and desktop size.
