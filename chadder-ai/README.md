# Chadder.ai

Chadder.ai is a platform that helps viewers discover and support small streamers through a voting system.

## Features

- Discover small streamers
- Vote for your favorite streamers using gems
- Leaderboard to track top streamers
- Weekly prize pool for top streamers

## Ad System

Chadder.ai now includes a rewarded ad system that allows users to earn gems by watching ads. This provides an alternative to purchasing gems through subscriptions.

### Ad System Features

- Watch ads to earn 10 gems per ad
- Daily limit of 5 ads per user
- 30-second cooldown between ads
- Integration with Google AdSense for web

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in the required values
4. Run the development server: `npm run dev`

### Ad System Setup

To set up the ad system, you need to:

1. Create a Google AdSense account at [adsense.google.com](https://www.google.com/adsense)
2. Get your AdSense Publisher ID (format: ca-pub-XXXXXXXXXX)
3. Create an ad unit and get the Ad Unit ID
4. Add these values to your `.env` file:
   ```
   VITE_ADSENSE_CLIENT_ID=your-adsense-client-id
   VITE_ADSENSE_AD_UNIT_ID=your-adsense-ad-unit-id
   ```
5. Run the Supabase migration: `psql -U postgres -d your_database -f migrations/add_ad_system.sql`

## Technologies

- React
- Vite
- Supabase
- Tailwind CSS
- Stripe for payments
- Google AdSense for rewarded ads

## License

MIT
