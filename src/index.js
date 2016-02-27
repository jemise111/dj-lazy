#!/usr/bin/env node

import open from 'open';
import Xray from 'x-ray';
import SpotifyWebApi from 'spotify-web-api-node';
import express from 'express';
import Q from 'q';
import cliOptions from 'commander';

// Get command line args
cliOptions
.option('-m, --max', 'The max number of albums to add')
.option('-s, --status', 'The playlist status (public, private)')
.parse(process.argv);

const store = {
	userId: '',
	playlistId: '',
	scrapedAlbums: [],
	albumsSuccess: []
};

const config = {
	scopes       : ['playlist-modify-public', 'playlist-modify-private'],
	redirectPath : '/spotify-auth',
	port         : 8085
};

const clientId = process.env.DJ_LAZY_CLIENT_ID;
const clientSecret = process.env.DJ_LAZY_CLIENT_SECRET;
const redirectUri = `http://localhost:${config.port}${config.redirectPath}`;

if (!clientId || !clientSecret) {
	const err = new Error('Missing cliendId or clientSecret\nEnsure you have DJ_LAZY_CLIENT_ID and DJ_LAZY_CLIENT_SECRET set as ENV variables');
	throw err;
}

// Create Spotify API wrapper
const spotifyApi = new SpotifyWebApi({clientId, clientSecret, redirectUri});

// Create the authorization URL
const authorizeURL = spotifyApi.createAuthorizeURL(config.scopes, 'mystate');

if (authToken) {
	startScraping(authToken);
} else {
	const app = express();
	let server;

	app.get(config.redirectPath, (req, res) => {
		// console.log('Here is your authorization token, you can avoid this step when running this script in the future by saving this token in an environment variable named LAZY_DJ_SPOTIFY_AUTHORIZATION');
		authToken = req.query.code;
		// console.log(authToken);
		res.send('<script>window.close();</script>');
		server.close();
		startScraping(authToken);
	});

	server = app.listen(config.port, _ => console.log(`Server listening on port ${config.port}!\n`) );
	open(authorizeURL);
};

const authorize = (authToken) => {
	return spotifyApi.authorizationCodeGrant(authToken);
}

const setAccessToken = (data) => {
	return spotifyApi.setAccessToken(data.body['access_token']);
}

const fetchUser = _ => {
	return spotifyApi.getMe();
}

const createPlaylist = _ => {
	const date = new Date();
	const title = `DJ Lazy ${date.toLocaleDateString()}`;
	let status = 'public'; 
	if (cliOptions.status === 'private' || cliOptions.status === 'public') {
		status = cliOptions.status;
	}
	return spotifyApi.createPlaylist(store.userId, title, {public: status == 'public'});
}

const scrapeForAlbums = () => {
	var deferred = Q.defer();
	const x = Xray();
	x('http://www.allmusic.com/newreleases', 
		x('.featured-rows .row .featured', [{
			artist: '.artist a:first-child',
			title: '.title a:first-child'
		}])
	)((err, data) => {
		if (err) {
			console.error('Error trying to scrape');
			throw err;
		} else {
			deferred.resolve(data);
		}
	});
	return deferred.promise;
}

const getAlbumsTracks = (albumIds) => {
	return Q.all(albumIds.map(id => spotifyApi.getAlbumTracks(id) ));
}

function delay (delay) {
	var q = Q.defer();
	setTimeout(q.resolve.bind(q), delay);
	return q.promise;
}

const addTracksToPlaylist = (trackUris) => {
	let defer = Q.defer();
	let promise = defer.promise;
	for (var i = 0; i < trackUris.length; i += 50) {
		(i => {
			const endIndex = trackUris.length <= i + 50 ? trackUris.length : i + 50;
			promise = promise.then(_ => spotifyApi.addTracksToPlaylist(store.userId, store.playlistId, trackUris.slice(i, endIndex)));
			promise = promise.then(_ => delay(2000));
		})(i);
	}
	defer.resolve();
	return promise;
}

function startScraping(authToken) {

	authorize(authToken)
	.then(setAccessToken)
	.then(fetchUser)
	.then(userData => {
		store.userId = userData.body.id;
		console.log('Creating playlist...');
		return createPlaylist();
	})
	.then(playlistData => {
		store.playlistId = playlistData.body.id;
		console.log('Fetching albums from Allmusic...');
		return scrapeForAlbums();
	})
	.then(scrapedAlbums => {
		store.scrapedAlbums = scrapedAlbums;
		console.log('Searching Spotify...');
		return Q.all(scrapedAlbums.map(album => {
			return spotifyApi.searchAlbums(`album:${album.title} artist:${album.artist}`);
		}));
	})
	.then(spotifyAlbumResultsData => {
		console.log('Fetching tracks...');
		const maxAlbums = cliOptions.max && parseInt(cliOptions.max);
		const topMatchIds = spotifyAlbumResultsData.map((result, i) => {
			if (result.body.albums && result.body.albums.items && result.body.albums.items.length) {
				if (!maxAlbums || store.albumsSuccess.length < maxAlbums) {
					store.albumsSuccess.push(store.scrapedAlbums[i]);
					return result.body.albums.items[0].id;
				}
			}
		}).filter(id => !!id);
		return getAlbumsTracks(topMatchIds);
	})
	.then(albumsTracksData => {
		console.log('Adding tracks to Spotify...');
		const albumsTracksUris = albumsTracksData.map(result => {
			return result.body.items.map(item => item.uri);
		});
		const flatAlbumsTracksUris = [].concat.apply([], albumsTracksUris);
		return addTracksToPlaylist(flatAlbumsTracksUris);
	})
	.then(data => {
		console.log('Finished!');
		console.log('Found Spotify Albums For');
		console.log('=========================');
		store.albumsSuccess.map(a => console.log(`${a.title} by ${a.artist}`));
		process.exit();
	})
	.catch(function(err) {
		console.log('Something went wrong!', err);
		throw err;
	});
}