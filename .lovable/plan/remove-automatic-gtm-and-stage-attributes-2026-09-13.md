# Remove automatic GTM and Stage attributes

## Changes
- Stop asking the research model to generate company-level GTM motion and company stage values.
- Stop automatically creating and saving “GTM motion” and “Stage” as comparison attributes.
- Remove the GTM and Stage filter labels from the results toolbar.
- Preserve all existing GTM motion and Stage attributes and values; this change only affects future analyses.

## Verification
- Confirm new analyses contain only approved product attributes.
- Confirm existing analyses remain unchanged.
- Check the app builds successfully and the results screen renders correctly.

## Technical details
- Update the Stage 2 output contract and persistence logic.
- No database migration or cleanup of existing attributes is included.
