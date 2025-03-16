# Changes Summary: Credits to Gem Balance Migration

This document summarizes all the changes made to fix the issue where the application was trying to access a `credits` column in the database, but the schema actually uses `gem_balance`.

## Database Changes

1. Created a SQL migration file (`migrations/update_gem_balance.sql`) that:
   - Renames the `credits` column to `gem_balance` if only `credits` exists
   - Migrates data from `credits` to `gem_balance` if both exist
   - Updates the `award_gems_for_ad` function to use `gem_balance`

2. Created migration instructions (`MIGRATION-INSTRUCTIONS.md`) with:
   - Step-by-step guide for applying the migration via Supabase dashboard
   - SQL code to execute
   - Verification queries

## Component Updates

### StreamPage.jsx
- Updated `refreshUserCredits` function to fetch `gem_balance` instead of `credits`
- Renamed state variable from `showCreditsModal` to `showGemsModal`
- Updated references to the modal component

### InsufficientCreditsModal.jsx
- Renamed to `InsufficientGemsModal`
- Updated all references from `credits` to `gems` or `gem_balance`
- Added functionality to refresh gem balance from the database

### UserManagement.jsx
- Updated sort options from `credits` to `gem_balance`
- Changed column header from "Credits" to "Gems"
- Updated user data display to show `gem_balance` instead of `credits`

### Settings.jsx
- Renamed state variable from `credits` to `gemBalance`
- Updated all UI text to refer to "Gems" instead of "Credits"
- Updated database queries to fetch `gem_balance`

### Discover.jsx
- Updated `fetchUserBalance` function to query `gem_balance` instead of `credits`

### Signup.jsx
- Updated user creation to initialize `gem_balance` instead of `credits`

### AnalyticsDashboard.jsx
- Updated all references from `credits` to `gems` or `gem_balance`
- Updated database queries and data processing

### CreditsPage.jsx
- Created a new `GemsPage.jsx` based on `CreditsPage.jsx`
- Updated all references from `credits` to `gems`
- Updated return URLs and navigation paths

### App.jsx
- Updated import to use `GemsPage` instead of `CreditsPage`
- Added routes for both `/gems` and `/credits` (for backward compatibility)

## Next Steps

1. Apply the database migration using the instructions in `MIGRATION-INSTRUCTIONS.md`
2. Test the application to ensure all gem-related functionality works correctly
3. Consider renaming CSS classes and files in a future update (currently still using `creditsPage`, etc.)
4. Update any documentation or user-facing content to consistently use "gems" terminology 