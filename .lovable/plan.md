# Remove automatic GTM and Stage attributes

## Changes
- Stop asking the research model to generate company-level GTM motion and company stage values.
- Stop automatically creating and saving “GTM motion” and “Stage” as comparison attributes.
- Remove the GTM and Stage filter labels from the results toolbar.
- Delete previously auto-created GTM motion and Stage attributes, while preserving any user-created attributes with similar names.

## Verification
- Confirm new analyses contain only approved product attributes.
- Confirm existing analyses no longer show the two automatic rows.
- Check the app builds successfully and the results screen renders correctly.

## Technical details
- Update the Stage 2 output contract and persistence logic.
- Apply a database migration limited to `is_custom = false` attributes named exactly `GTM motion` or `Stage`; dependent extracted values are removed through existing cascades.
