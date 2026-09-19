# Custom GLB wheel imports

## What will change
- Make the Porsche GT2 rim the default and remove the procedural rim from the selector.
- Reduce the round export button while keeping it easy to tap.
- Add a GLB import control in the Rim section for either a custom rim or a complete tyre model.
- Show the imported file as a selectable custom option and provide a clear remove action.
- Auto-center and scale imported rims to the current rim diameter and full tyre width.
- Auto-center and scale imported tyre models to the current tyre diameter and the text-driven tyre width, including width micro-adjustments and other size controls.

## Technical details
- Parse local `.glb` files in the browser and release temporary object URLs when replaced or removed.
- Reuse the current model fitting approach, with separate radial and axial scaling for both bundled and imported models.
- Treat a custom rim as an overlay on the generated text tyre; treat a custom tyre as the tyre body while retaining the selected text and rim/editor behavior.
- Preserve GLB and PNG export so imported geometry is included in the exported result.
- Verify import, resizing, selection, reset, export menu, and mobile/desktop layouts.
