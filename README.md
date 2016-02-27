# DJ Lazy
---
DJ Lazy is a command-line tool to remove the burden of staying up to date with the latest music.

[Allmusic.com](Allmusic.com) puts out a fresh list of new releases once a week. Once that list is up on their website you can run dj-lazy in your command line to add all available tracks on Spotify to a new Spotify playlist.

# Installation
---
```bash
npm install -g dj-lazy
```

# Prerequisites
---
To use DJ Lazy you first need a clientId and clientSecret token so DJ Lazy can use the Spotify Web API.

1. Go to [Spotify's Developer Portal](https://developer.spotify.com/), login, and go to **My Apps**
2. Follow the steps to create a new app. In the **Redirect URIs** field add "http://localhost:8085/spotify-auth" and click **Save** (this allows DJ lazy to retrieve your authentication token)
3. Store your clientId and clientSecret as ENV variables as:
```bash
DJ_LAZY_CLIENT_ID=<your_client_id>
DJ_LAZY_CLIENT_SECRET=<your_client_secret>
```

# Usage
---
```bash
dj-lazy
```
*Note:* DJ Lazy requires an authentication token from Spotify on every run to make changes to your account. Therefore DJ Lazy will open a browser window to authenticate you. If you are already authenticated the window will open and subsequently close.

# Options
---
```bash
-m, --max : Max number of albums to add (default: none)
-s, --status : Playlist status, either public or private (default: private)
```
# TODO
---
 * Get music from Allmusic's genre pages
 * Add more music sources
 * Don't get new auth token every time
 * Prevent duplicate playlists
 * Progress bar instead of logging

# License
---
MIT